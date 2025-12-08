import { BatchProcessor } from '../ollama/batchProcessor';
import { Logger } from '../utils/logger';
import { CodeChunk } from './types';

export interface EmbeddingResult {
    chunks: CodeChunk[];
    successCount: number;
    failureCount: number;
    failedChunks: CodeChunk[];
}

export interface EmbeddingProgress {
    current: number;
    total: number;
    percentage: number;
}

/**
 * Generates embeddings for code chunks using BatchProcessor
 * Handles progress reporting and failure tracking
 */
export class EmbeddingGenerator {
    private logger = new Logger('EmbeddingGenerator');
    private batchProcessor: BatchProcessor;

    constructor() {
        this.batchProcessor = new BatchProcessor();
        this.logger.info('EmbeddingGenerator initialized');
    }

    /**
     * Generate embeddings for code chunks with progress reporting
     */
    async generateEmbeddings(
        chunks: CodeChunk[],
        onProgress?: (progress: EmbeddingProgress) => void
    ): Promise<EmbeddingResult> {
        this.logger.info(`Generating embeddings for ${chunks.length} chunks`);

        if (chunks.length === 0) {
            return {
                chunks: [],
                successCount: 0,
                failureCount: 0,
                failedChunks: []
            };
        }

        // Extract texts from chunks
        const texts = chunks.map(chunk => chunk.text);

        // Generate embeddings using batch processor
        const result = await this.batchProcessor.processTexts(
            texts,
            (current, total) => {
                if (onProgress) {
                    onProgress({
                        current,
                        total,
                        percentage: Math.round((current / total) * 100)
                    });
                }
            }
        );

        // Merge embeddings back into chunks
        const chunksWithEmbeddings: CodeChunk[] = [];
        const failedChunks: CodeChunk[] = [];

        for (let i = 0; i < chunks.length; i++) {
            const chunk = { ...chunks[i] };
            const embedding = result.embeddings[i];

            if (embedding && embedding.length > 0) {
                chunk.vector = embedding;
                chunksWithEmbeddings.push(chunk);
            } else {
                failedChunks.push(chunk);
            }
        }

        this.logger.info(
            `Embedding generation complete: ${result.successCount} succeeded, ${result.failureCount} failed`
        );

        return {
            chunks: chunksWithEmbeddings,
            successCount: result.successCount,
            failureCount: result.failureCount,
            failedChunks
        };
    }

    /**
     * Retry failed chunks
     */
    async retryFailedChunks(
        failedChunks: CodeChunk[],
        onProgress?: (progress: EmbeddingProgress) => void
    ): Promise<EmbeddingResult> {
        this.logger.info(`Retrying ${failedChunks.length} failed chunks`);
        return this.generateEmbeddings(failedChunks, onProgress);
    }

    /**
     * Generate embedding for a single chunk (for real-time updates)
     */
    async generateSingleEmbedding(chunk: CodeChunk): Promise<CodeChunk | null> {
        try {
            const result = await this.generateEmbeddings([chunk]);

            if (result.chunks.length > 0) {
                return result.chunks[0];
            }

            return null;
        } catch (error) {
            this.logger.error('Failed to generate single embedding', error);
            return null;
        }
    }

    /**
     * Estimate time to process chunks based on batch size
     */
    estimateProcessingTime(chunkCount: number): number {
        // Rough estimate: ~2 seconds per batch of 32 chunks
        const batchSize = this.batchProcessor.getBatchSize();
        const batches = Math.ceil(chunkCount / batchSize);
        return batches * 2; // seconds
    }

    /**
     * Get current batch size
     */
    getBatchSize(): number {
        return this.batchProcessor.getBatchSize();
    }

    /**
     * Adjust batch size
     */
    adjustBatchSize(increase: boolean): void {
        this.batchProcessor.adjustBatchSize(increase);
    }
}
