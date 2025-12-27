import { OllamaClient } from '../ollama/ollamaClient';
import { VectorStore, SearchResult } from './vectorStore';
import { CodeChunk, ChunkType } from '../indexing/types';
import { Logger } from '../utils/logger';
import { Config } from '../utils/config';

const logger = new Logger('SearchOrchestrator');

/**
 * Parameters for search operation
 */
export interface SearchParams {
    query: string;
    limit?: number;
    minSimilarity?: number;
    chunkTypes?: ChunkType[];
}

/**
 * Result set from a search operation
 */
export interface SearchResultSet {
    query: string;
    results: SearchResult[];
    totalResults: number;
    searchTime: number;
    error?: string;
}

/**
 * Orchestrates semantic search operations
 * Coordinates query embedding generation and vector search
 */
export class SearchOrchestrator {
    constructor(
        private ollamaClient: OllamaClient,
        private vectorStore: VectorStore
    ) {}

    /**
     * Execute a semantic search
     * @param params Search parameters
     * @returns Search result set with matches and metadata
     */
    async search(params: SearchParams): Promise<SearchResultSet> {
        const startTime = Date.now();

        try {
            logger.info(`Executing search for query: "${params.query}"`);

            // Validate inputs
            if (!params.query || params.query.trim().length === 0) {
                throw new Error('Search query cannot be empty');
            }

            // Check if vector store is initialized
            const isInitialized = await this.vectorStore.isInitialized();
            if (!isInitialized) {
                throw new Error('Index not initialized. Please index your workspace first.');
            }

            // Get configuration values
            const limit = params.limit ?? Config.get('searchResultLimit', 20);
            const minSimilarity = params.minSimilarity ?? Config.get('minSimilarity', 0.5);

            logger.debug(`Search params: limit=${limit}, minSimilarity=${minSimilarity}`);

            // Generate query embedding with search_query prefix
            logger.debug('Generating query embedding...');
            const queryVector = await this.ollamaClient.generateEmbedding(params.query.trim(), true);
            logger.debug(`Query embedding generated: ${queryVector.length} dimensions`);

            // Execute vector search
            logger.debug('Executing vector search...');
            let results = await this.vectorStore.search(queryVector, limit, minSimilarity);
            logger.info(`Vector search returned ${results.length} results`);

            // Apply chunk type filters if specified
            if (params.chunkTypes && params.chunkTypes.length > 0) {
                logger.debug(`Applying chunk type filters: ${params.chunkTypes.join(', ')}`);
                const beforeFilter = results.length;
                results = this.applyChunkTypeFilter(results, params.chunkTypes);
                logger.debug(`Filtered from ${beforeFilter} to ${results.length} results`);
            }

            // Apply multi-signal re-ranking
            logger.debug('Applying multi-signal re-ranking...');
            results = this.reRankResults(params.query, results);

            const searchTime = Date.now() - startTime;
            logger.info(`Search completed in ${searchTime}ms with ${results.length} results`);

            return {
                query: params.query,
                results,
                totalResults: results.length,
                searchTime
            };

        } catch (error) {
            const searchTime = Date.now() - startTime;
            const errorMessage = error instanceof Error ? error.message : String(error);

            logger.error('Search failed', error);

            return {
                query: params.query,
                results: [],
                totalResults: 0,
                searchTime,
                error: errorMessage
            };
        }
    }

    /**
     * Filter search results by chunk type
     * @param results Search results to filter
     * @param allowedTypes Chunk types to include
     * @returns Filtered search results
     */
    private applyChunkTypeFilter(results: SearchResult[], allowedTypes: ChunkType[]): SearchResult[] {
        return results.filter(result =>
            allowedTypes.includes(result.chunk.type)
        );
    }

    /**
     * Re-rank search results using multiple signals
     * Combines semantic similarity with keyword matching, file path matching, and chunk type priority
     * @param query Original search query
     * @param results Search results to re-rank
     * @returns Re-ranked search results
     */
    private reRankResults(query: string, results: SearchResult[]): SearchResult[] {
        if (results.length === 0) {
            return results;
        }

        const queryTokens = this.tokenizeCode(query.toLowerCase());

        // Score each result with multiple signals
        const scoredResults = results.map(result => {
            const codeTokens = this.tokenizeCode(result.chunk.text.toLowerCase());
            const filePathTokens = this.tokenizeCode(result.chunk.filePath.toLowerCase());

            // 1. Exact token match ratio (30% weight)
            const exactMatchRatio = queryTokens.filter(qt =>
                codeTokens.some(ct => ct.includes(qt) || qt.includes(ct))
            ).length / Math.max(queryTokens.length, 1);

            // 2. File path match (10% weight)
            const pathMatchScore = queryTokens.some(qt =>
                filePathTokens.some(pt => pt.includes(qt))
            ) ? 1.0 : 0.0;

            // 3. Chunk type priority (10% weight)
            const typeBonus: Record<ChunkType, number> = {
                'function': 1.0,
                'method': 0.95,
                'class': 0.8,
                'component': 0.85,
                'interface': 0.75,
                'const': 0.6,
                'variable': 0.5,
                'import': 0.2,
                'export': 0.2,
                'unknown': 0.4,
                'block': 0.3,
                'type': 0.7,
                'namespace': 0.7,
                'jsx': 0.75,
                'template': 0.7,
                'script': 0.6,
                'css': 0.5,
                'data': 0.7,
                'computed': 0.7,
                'lifecycle': 0.8,
                'watch': 0.7
            };

            // 4. Semantic similarity (50% weight)
            const normalizedSemantic = result.similarity;

            // Composite score
            const reRankScore = (
                0.50 * normalizedSemantic +
                0.30 * exactMatchRatio +
                0.10 * pathMatchScore +
                0.10 * (typeBonus[result.chunk.type] ?? 0.5)
            );

            return {
                ...result,
                reRankScore
            };
        });

        // Sort by re-rank score (descending)
        return scoredResults.sort((a, b) => (b.reRankScore ?? 0) - (a.reRankScore ?? 0));
    }

    /**
     * Tokenize code/text by splitting on common delimiters and camelCase
     * @param text Text to tokenize
     * @returns Array of lowercase tokens
     */
    private tokenizeCode(text: string): string[] {
        return text
            .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase split
            .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')  // PascalCase split
            .replace(/[_\-./\\]/g, ' ')  // Delimiters to spaces
            .toLowerCase()
            .split(/\s+/)
            .filter(t => t.length > 1);  // Filter out single characters
    }

    /**
     * Check if the vector store is ready for searching
     * @returns True if initialized and ready
     */
    async isReady(): Promise<boolean> {
        try {
            const initialized = await this.vectorStore.isInitialized();
            const count = await this.vectorStore.count();
            logger.info(`VectorStore ready check: initialized=${initialized}, count=${count}`);
            return initialized;
        } catch (error) {
            logger.error('Failed to check vector store status', error);
            return false;
        }
    }

    /**
     * Get count of indexed chunks
     * @returns Number of chunks in the index
     */
    async getIndexedChunkCount(): Promise<number> {
        try {
            return await this.vectorStore.count();
        } catch (error) {
            logger.error('Failed to get chunk count', error);
            return 0;
        }
    }
}
