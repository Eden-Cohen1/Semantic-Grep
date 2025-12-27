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

        // Build contextual embedding inputs with metadata
        const texts = chunks.map(chunk => this.buildEmbeddingInput(chunk));

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

    /**
     * Build contextual embedding input with metadata
     * Adds file context, chunk type, and language to help the model understand semantics
     */
    private buildEmbeddingInput(chunk: CodeChunk): string {
        const parts: string[] = [];

        // 1. Language and file context
        parts.push(`[${chunk.language.toUpperCase()}]`);

        const fileName = chunk.filePath.split(/[/\\]/).pop() || '';
        if (fileName) {
            parts.push(fileName);
        }

        // 2. Chunk type
        const chunkTypeLabel = this.formatChunkType(chunk.type);
        parts.push(chunkTypeLabel);

        // 3. Extract identifier name from code (simple heuristic)
        const name = this.extractIdentifierName(chunk.text, chunk.type);
        if (name) {
            parts.push(`Name: ${name}`);
        }

        // 4. Separator
        parts.push('');

        // 5. The actual code
        parts.push(chunk.text);

        return parts.join('\n');
    }

    /**
     * Format chunk type for display
     */
    private formatChunkType(type: string): string {
        const typeMap: Record<string, string> = {
            'function': 'Function',
            'method': 'Method',
            'class': 'Class',
            'interface': 'Interface',
            'component': 'Component',
            'const': 'Constant',
            'variable': 'Variable',
            'import': 'Import',
            'export': 'Export',
            'type': 'Type',
            'namespace': 'Namespace',
            'jsx': 'JSX Element',
            'template': 'Template',
            'script': 'Script',
            'css': 'CSS',
            'data': 'Data Property',
            'computed': 'Computed Property',
            'lifecycle': 'Lifecycle Method',
            'watch': 'Watcher',
            'block': 'Block',
            'unknown': 'Code Block'
        };

        return typeMap[type] || type;
    }

    /**
     * Extract identifier name from code (simple regex extraction)
     */
    private extractIdentifierName(code: string, type: string): string | null {
        // Simple regex patterns for common chunk types
        const patterns: Record<string, RegExp> = {
            'function': /(?:function|const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/,
            'class': /class\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/,
            'method': /([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/,
            'const': /const\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/,
            'variable': /(?:let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/,
            'interface': /interface\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/,
            'type': /type\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/,
            'component': /(?:const|function|export\s+(?:default\s+)?(?:function)?)\s+([A-Z][a-zA-Z0-9_$]*)/
        };

        const pattern = patterns[type];
        if (!pattern) {
            return null;
        }

        const match = code.match(pattern);
        return match ? match[1] : null;
    }
}
