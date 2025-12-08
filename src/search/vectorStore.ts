import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';
import { connect } from '@lancedb/lancedb';
import type { Connection, Table } from '@lancedb/lancedb';
import { Logger } from '../utils/logger';
import { CodeChunk } from '../indexing/types';

export interface SearchResult {
    chunk: CodeChunk;
    similarity: number;
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
    private logger = new Logger('VectorStore');
    private db: Connection | null = null;
    private table: Table | null = null;
    private dbPath: string;
    private tableName = 'code_chunks';

    constructor() {
        // Store in workspace .vscode/.semantic-grep/
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        this.dbPath = path.join(
            workspaceFolder.uri.fsPath,
            '.vscode',
            '.semantic-grep'
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
            this.logger.info('Connected to LanceDB');

            // Try to open existing table
            try {
                const tableNames = await this.db.tableNames();
                if (tableNames.includes(this.tableName)) {
                    this.table = await this.db.openTable(this.tableName);
                    this.logger.info(`Opened existing table: ${this.tableName}`);
                } else {
                    this.logger.info('Table does not exist yet, will be created on first insert');
                }
            } catch (error) {
                this.logger.info('Table does not exist yet, will be created on first insert');
            }

        } catch (error) {
            this.logger.error('Failed to initialize vector store', error);
            throw error;
        }
    }

    /**
     * Insert code chunks with embeddings
     */
    async insert(chunks: CodeChunk[]): Promise<void> {
        if (!this.db) {
            throw new Error('Database not initialized');
        }

        if (chunks.length === 0) {
            this.logger.warn('No chunks to insert');
            return;
        }

        // Filter out chunks without embeddings
        const validChunks = chunks.filter(chunk => chunk.vector && chunk.vector.length > 0);

        if (validChunks.length === 0) {
            this.logger.warn('No chunks with valid embeddings to insert');
            return;
        }

        this.logger.info(`Inserting ${validChunks.length} chunks into vector store`);

        try {
            // Convert chunks to LanceDB format
            const records = validChunks.map(chunk => ({
                id: chunk.id,
                filePath: chunk.filePath,
                startLine: chunk.startLine,
                endLine: chunk.endLine,
                text: chunk.text,
                type: chunk.type,
                language: chunk.language,
                timestamp: chunk.timestamp,
                vector: chunk.vector! // We checked it exists above
            }));

            // Create or append to table
            if (!this.table) {
                this.table = await this.db.createTable(this.tableName, records);
                this.logger.info(`Created table ${this.tableName} with ${records.length} records`);
            } else {
                await this.table.add(records);
                this.logger.info(`Added ${records.length} records to ${this.tableName}`);
            }

        } catch (error) {
            this.logger.error('Failed to insert chunks', error);
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
            this.logger.warn('No table available for search');
            return [];
        }

        try {
            this.logger.debug(`Searching for ${limit} results with min similarity ${minSimilarity}`);

            // Perform vector search using LanceDB 0.4.x API
            const results = await this.table
                .vectorSearch(queryVector)
                .limit(limit * 2) // Get more results to filter by similarity
                .toArray();

            // Convert results to SearchResult format
            const searchResults: SearchResult[] = results
                .map((result: any) => {
                    // Calculate similarity score from distance
                    // LanceDB returns L2 distance, convert to cosine similarity approximation
                    const distance = result._distance || 0;
                    const similarity = 1 / (1 + distance);

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
                            vector: result.vector
                        },
                        similarity
                    };
                })
                .filter(result => result.similarity >= minSimilarity)
                .slice(0, limit);

            this.logger.info(`Found ${searchResults.length} results above threshold`);
            return searchResults;

        } catch (error) {
            this.logger.error('Search failed', error);
            throw error;
        }
    }

    /**
     * Delete all chunks from a specific file
     */
    async deleteFile(filePath: string): Promise<number> {
        if (!this.table) {
            this.logger.warn('No table available for deletion');
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
            this.logger.warn('Database not initialized');
            return;
        }

        try {
            this.logger.info('Clearing vector store...');

            if (this.table) {
                await this.db.dropTable(this.tableName);
                this.table = null;
                this.logger.info('Dropped table');
            }

        } catch (error) {
            this.logger.error('Failed to clear vector store', error);
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
            this.logger.error('Failed to count rows', error);
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
                this.logger.warn('Failed to count files', error);
            }
        }

        // Calculate storage size
        let storageSize = 0;
        try {
            const getDirectorySize = async (dir: string): Promise<number> => {
                let size = 0;
                try {
                    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
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
            this.logger.warn('Failed to calculate storage size', error);
        }

        return {
            chunkCount,
            fileCount,
            storageSize
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
            this.logger.info('Closed vector store connection');
        }
    }
}
