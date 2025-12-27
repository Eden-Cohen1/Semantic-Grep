/**
 * Embedding Provider Interface
 * Defines the contract for all embedding providers (Ollama, OpenAI, etc.)
 */

import { EmbeddingModelConfig } from '../models/EmbeddingModels';

/**
 * Options for embedding generation
 */
export interface EmbeddingOptions {
    isQuery?: boolean;           // Whether this is a query (vs document) embedding
    preprocessCode?: boolean;    // Whether to preprocess code (split identifiers)
    batchSize?: number;          // Batch size for batch operations
    timeout?: number;            // Timeout in milliseconds
}

/**
 * Result from embedding generation
 */
export interface EmbeddingResult {
    embedding: number[];
    tokensUsed?: number;         // For cost tracking (OpenAI)
    model: string;
}

/**
 * Result from batch embedding generation
 */
export interface BatchEmbeddingResult {
    embeddings: number[][];
    successCount: number;
    failureCount: number;
    failedIndices: number[];
    totalTokens?: number;        // For OpenAI cost tracking
}

/**
 * Interface that all embedding providers must implement
 */
export interface IEmbeddingProvider {
    /**
     * Provider name (e.g., "ollama", "openai")
     */
    readonly providerName: string;

    /**
     * Model configuration (dimensions, prefixes, etc.)
     */
    readonly modelConfig: EmbeddingModelConfig;

    /**
     * Check if the provider is available and responding
     */
    checkConnection(): Promise<boolean>;

    /**
     * Check if the configured model is available
     */
    isModelAvailable(): Promise<boolean>;

    /**
     * Generate embedding for a single text
     * @param text Text to embed
     * @param options Optional parameters
     * @returns Embedding result with vector and metadata
     */
    generateEmbedding(text: string, options?: EmbeddingOptions): Promise<EmbeddingResult>;

    /**
     * Generate embeddings for multiple texts (batch operation)
     * @param texts Array of texts to embed
     * @param options Optional parameters
     * @returns Batch embedding result
     */
    generateEmbeddings(texts: string[], options?: EmbeddingOptions): Promise<BatchEmbeddingResult>;

    /**
     * Normalize a vector to unit length (L2 normalization)
     * @param vector Vector to normalize
     * @returns Normalized vector
     */
    normalizeVector(vector: number[]): number[];

    /**
     * Preprocess text before embedding (split camelCase, add prefixes, etc.)
     * @param text Text to preprocess
     * @param options Optional parameters
     * @returns Preprocessed text
     */
    preprocessText(text: string, options?: EmbeddingOptions): string;

    /**
     * Clean up resources when provider is no longer needed
     */
    dispose(): Promise<void>;
}
