import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";
import { connect } from "@lancedb/lancedb";
import type { Connection, Table } from "@lancedb/lancedb";
import { Logger } from "../utils/logger";
import { CodeChunk } from "../indexing/types";

export interface SearchResult {
  chunk: CodeChunk;
  similarity: number;
  normalizedScore?: number;  // 0-100 normalized score for display
  reRankScore?: number;      // Composite score from multi-signal re-ranking
}

export interface VectorStoreStats {
  chunkCount: number;
  fileCount: number;
  storageSize: number;
}

/**
 * Manages vector database storage using LanceDB
 * Stores code chunks with embeddings for semantic search
 */
export class VectorStore {
  private logger = new Logger("VectorStore");
  private db: Connection | null = null;
  private table: Table | null = null;
  private dbPath: string;
  private tableName = "code_chunks";

  constructor() {
    // Store in workspace .vscode/.semantic-grep/
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error("No workspace folder found");
    }

    this.dbPath = path.join(
      workspaceFolder.uri.fsPath,
      ".vscode",
      ".semantic-grep"
    );

    this.logger.info(`Vector store path: ${this.dbPath}`);
  }

  /**
   * Initialize database connection
   */
  async initialize(): Promise<void> {
    try {
      // Ensure directory exists
      await fs.promises.mkdir(this.dbPath, { recursive: true });

      // Connect to LanceDB
      this.db = await connect(this.dbPath);
      this.logger.info("Connected to LanceDB");

      // Try to open existing table
      try {
        const tableNames = await this.db.tableNames();
        if (tableNames.includes(this.tableName)) {
          this.table = await this.db.openTable(this.tableName);
          this.logger.info(`Opened existing table: ${this.tableName}`);
        } else {
          this.logger.info(
            "Table does not exist yet, will be created on first insert"
          );
        }
      } catch (error) {
        this.logger.info(
          "Table does not exist yet, will be created on first insert"
        );
      }
    } catch (error) {
      this.logger.error("Failed to initialize vector store", error);
      throw error;
    }
  }

  /**
   * Insert code chunks with embeddings
   */
  async insert(chunks: CodeChunk[]): Promise<void> {
    if (!this.db) {
      throw new Error("Database not initialized");
    }

    if (chunks.length === 0) {
      this.logger.warn("No chunks to insert");
      return;
    }

    // Filter out chunks without embeddings
    const validChunks = chunks.filter(
      (chunk) => chunk.vector && chunk.vector.length > 0
    );

    if (validChunks.length === 0) {
      this.logger.warn("No chunks with valid embeddings to insert");
      return;
    }

    this.logger.info(
      `Inserting ${validChunks.length} chunks into vector store`
    );

    try {
      // Convert chunks to LanceDB format
      const records = validChunks.map((chunk) => ({
        id: chunk.id,
        filePath: chunk.filePath,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        text: chunk.text,
        type: chunk.type,
        language: chunk.language,
        timestamp: chunk.timestamp,
        vector: chunk.vector!, // We checked it exists above
      }));

      // Create or append to table
      if (!this.table) {
        this.table = await this.db.createTable(this.tableName, records);
        this.logger.info(
          `Created table ${this.tableName} with ${records.length} records`
        );

        // Create FTS index on text field for BM25 search (Phase 3)
        try {
          await this.table.createIndex({
            column: "text",
            type: "fts",
          } as any);
          this.logger.info("Created FTS index for hybrid search");
        } catch (error) {
          this.logger.warn("Failed to create FTS index (may not be supported)", error);
        }
      } else {
        await this.table.add(records);
        this.logger.info(
          `Added ${records.length} records to ${this.tableName}`
        );
      }
    } catch (error) {
      this.logger.error("Failed to insert chunks", error);
      throw error;
    }
  }

  /**
   * Search for similar code chunks
   */
  async search(
    queryVector: number[],
    limit: number = 20,
    minSimilarity: number = 0.5
  ): Promise<SearchResult[]> {
    if (!this.table) {
      this.logger.warn("No table available for search");
      return [];
    }

    try {
      this.logger.debug(
        `Searching for ${limit} results with min similarity ${minSimilarity}`
      );

      // Perform vector search using LanceDB 0.4.x API
      const results = await this.table
        .vectorSearch(queryVector)
        .limit(limit * 2) // Get more results to filter by similarity
        .toArray();

      // Convert results to SearchResult format
      const allResults = results.map((result: any) => {
        // Calculate similarity score from distance
        // LanceDB returns squared L2 distance
        const squaredDistance = result._distance || 0;

        // For normalized vectors, convert squared L2 distance to cosine similarity
        // Formula: cosine_similarity = 1 - (L2²/2)
        // This gives better score differentiation than linear mapping
        const similarity = Math.max(0, Math.min(1, 1 - squaredDistance / 2));

        // Also keep L2 distance for debugging
        const distance = Math.sqrt(squaredDistance);

        return {
          chunk: {
            id: result.id,
            filePath: result.filePath,
            startLine: result.startLine,
            endLine: result.endLine,
            text: result.text,
            type: result.type,
            language: result.language,
            timestamp: result.timestamp,
            chunkIndexInFile: result.chunkIndexInFile || 0,
            vector: result.vector,
          },
          similarity,
          distance,
          squaredDistance,
        };
      });

      // Log top 5 results for debugging
      if (allResults.length > 0) {
        this.logger.debug(
          `Top 5 results: ${allResults
            .slice(0, 5)
            .map(
              (r: any) =>
                `L2²=${r.squaredDistance.toFixed(1)}, L2=${r.distance.toFixed(
                  2
                )}, sim=${r.similarity.toFixed(3)}`
            )
            .join(" | ")}`
        );
      }

      const searchResults = allResults
        .filter((result: any) => result.similarity >= minSimilarity)
        .slice(0, limit);

      this.logger.info(
        `Found ${searchResults.length} results above threshold (min=${minSimilarity})`
      );

      // Normalize scores for display (0-100 scale)
      const normalizedResults = this.normalizeScoresForDisplay(searchResults);

      return normalizedResults;
    } catch (error) {
      this.logger.error("Search failed", error);
      throw error;
    }
  }

  /**
   * Hybrid search combining vector similarity and BM25 keyword search
   * Uses Reciprocal Rank Fusion (RRF) to merge results
   */
  async hybridSearch(
    queryText: string,
    queryVector: number[],
    limit: number = 20,
    minSimilarity: number = 0.5
  ): Promise<SearchResult[]> {
    if (!this.table) {
      this.logger.warn("No table available for hybrid search");
      return [];
    }

    try {
      this.logger.debug(`Performing hybrid search (vector + BM25)`);

      // 1. Vector search
      const vectorResults = await this.table
        .vectorSearch(queryVector)
        .limit(limit * 2)
        .toArray();

      // 2. BM25 full-text search using query filter
      let bm25Results: any[] = [];
      try {
        // Use LanceDB's query API with full-text search filter
        // Note: FTS requires the index to be created first
        bm25Results = await this.table
          .query()
          .where(`text LIKE '%${queryText}%'`)
          .limit(limit * 2)
          .toArray();
        this.logger.debug(`BM25 search returned ${bm25Results.length} results`);
      } catch (error) {
        this.logger.warn("BM25 search failed, falling back to vector-only", error);
        // Fall back to vector search only
        return this.search(queryVector, limit, minSimilarity);
      }

      // 3. Apply Reciprocal Rank Fusion (RRF)
      const mergedResults = this.reciprocalRankFusion(
        vectorResults,
        bm25Results
      );

      // 4. Filter by minimum similarity and limit results
      const filteredResults = mergedResults
        .filter(result => result.similarity >= minSimilarity)
        .slice(0, limit);

      this.logger.info(
        `Hybrid search returned ${filteredResults.length} results (vector: ${vectorResults.length}, BM25: ${bm25Results.length})`
      );

      // Normalize scores for display
      const normalizedResults = this.normalizeScoresForDisplay(filteredResults);

      return normalizedResults;
    } catch (error) {
      this.logger.error("Hybrid search failed", error);
      throw error;
    }
  }

  /**
   * Reciprocal Rank Fusion (RRF) algorithm
   * Combines rankings from multiple search methods
   * Formula: RRF_score = sum(1 / (k + rank_i)) for each ranking
   */
  private reciprocalRankFusion(
    vectorResults: any[],
    bm25Results: any[],
    k: number = 60
  ): SearchResult[] {
    // Create maps for O(1) lookup
    const vectorRankMap = new Map<string, number>();
    const bm25RankMap = new Map<string, number>();
    const allChunks = new Map<string, any>();

    // Build vector rank map
    vectorResults.forEach((result, index) => {
      vectorRankMap.set(result.id, index + 1);
      allChunks.set(result.id, result);
    });

    // Build BM25 rank map
    bm25Results.forEach((result, index) => {
      bm25RankMap.set(result.id, index + 1);
      if (!allChunks.has(result.id)) {
        allChunks.set(result.id, result);
      }
    });

    // Calculate RRF scores
    const rrfScores: Array<{ id: string; score: number; result: any }> = [];

    allChunks.forEach((result, id) => {
      let rrfScore = 0;

      // Add vector ranking contribution
      const vectorRank = vectorRankMap.get(id);
      if (vectorRank !== undefined) {
        rrfScore += 1 / (k + vectorRank);
      }

      // Add BM25 ranking contribution
      const bm25Rank = bm25RankMap.get(id);
      if (bm25Rank !== undefined) {
        rrfScore += 1 / (k + bm25Rank);
      }

      rrfScores.push({ id, score: rrfScore, result });
    });

    // Sort by RRF score (descending)
    rrfScores.sort((a, b) => b.score - a.score);

    // Convert to SearchResult format
    return rrfScores.map(({ result }) => {
      // Calculate similarity from distance (for vector results)
      const squaredDistance = result._distance || 0;
      const similarity = Math.max(0, Math.min(1, 1 - squaredDistance / 2));

      return {
        chunk: {
          id: result.id,
          filePath: result.filePath,
          startLine: result.startLine,
          endLine: result.endLine,
          text: result.text,
          type: result.type,
          language: result.language,
          timestamp: result.timestamp,
          chunkIndexInFile: result.chunkIndexInFile || 0,
          vector: result.vector,
        },
        similarity,
      };
    });
  }

  /**
   * Normalize similarity scores to 0-100 range for better UX
   * Maps the range of actual scores to a full 0-100 scale
   */
  private normalizeScoresForDisplay(results: SearchResult[]): SearchResult[] {
    if (results.length === 0) {
      return results;
    }

    const scores = results.map(r => r.similarity);
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const range = max - min;

    // Handle edge case where all scores are identical
    if (range < 1e-6) {
      return results.map(r => ({
        ...r,
        normalizedScore: 50 // All equal, show as medium confidence
      }));
    }

    // Normalize to 0-100 scale
    return results.map(r => ({
      ...r,
      normalizedScore: Math.round(((r.similarity - min) / range) * 100)
    }));
  }

  /**
   * Delete all chunks from a specific file
   */
  async deleteFile(filePath: string): Promise<number> {
    if (!this.table) {
      this.logger.warn("No table available for deletion");
      return 0;
    }

    try {
      this.logger.info(`Deleting chunks from file: ${filePath}`);

      // Delete records matching the file path
      await this.table.delete(`filePath = '${filePath}'`);

      this.logger.info(`Deleted chunks from ${filePath}`);
      return 1;
    } catch (error) {
      this.logger.error(`Failed to delete file: ${filePath}`, error);
      throw error;
    }
  }

  /**
   * Clear entire index
   */
  async clear(): Promise<void> {
    if (!this.db) {
      this.logger.warn("Database not initialized");
      return;
    }

    try {
      this.logger.info("Clearing vector store...");

      if (this.table) {
        await this.db.dropTable(this.tableName);
        this.table = null;
        this.logger.info("Dropped table");
      }
    } catch (error) {
      this.logger.error("Failed to clear vector store", error);
      throw error;
    }
  }

  /**
   * Get count of indexed chunks
   */
  async count(): Promise<number> {
    if (!this.table) {
      return 0;
    }

    try {
      const result = await this.table.countRows();
      return result;
    } catch (error) {
      this.logger.error("Failed to count rows", error);
      return 0;
    }
  }

  /**
   * Get statistics about the vector store
   */
  async getStats(): Promise<VectorStoreStats> {
    const chunkCount = await this.count();

    // Count unique files
    let fileCount = 0;
    if (this.table) {
      try {
        // Get all records and count unique file paths
        const allRecords = await this.table.query().limit(100000).toArray();
        const uniqueFiles = new Set(allRecords.map((r: any) => r.filePath));
        fileCount = uniqueFiles.size;
      } catch (error) {
        this.logger.warn("Failed to count files", error);
      }
    }

    // Calculate storage size
    let storageSize = 0;
    try {
      const getDirectorySize = async (dir: string): Promise<number> => {
        let size = 0;
        try {
          const entries = await fs.promises.readdir(dir, {
            withFileTypes: true,
          });
          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              size += await getDirectorySize(fullPath);
            } else if (entry.isFile()) {
              const stats = await fs.promises.stat(fullPath);
              size += stats.size;
            }
          }
        } catch (err) {
          // Ignore errors
        }
        return size;
      };

      storageSize = await getDirectorySize(this.dbPath);
    } catch (error) {
      this.logger.warn("Failed to calculate storage size", error);
    }

    return {
      chunkCount,
      fileCount,
      storageSize,
    };
  }

  /**
   * Check if vector store is initialized and has data
   */
  async isInitialized(): Promise<boolean> {
    return this.table !== null && (await this.count()) > 0;
  }

  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      // LanceDB connections are managed automatically
      this.db = null;
      this.table = null;
      this.logger.info("Closed vector store connection");
    }
  }
}
