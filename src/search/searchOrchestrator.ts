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

            // Generate query embedding
            logger.debug('Generating query embedding...');
            const queryVector = await this.ollamaClient.generateEmbedding(params.query.trim());
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
