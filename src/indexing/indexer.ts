import { FileScanner } from './fileScanner';
import { CodeChunker } from './codeChunker';
import { EmbeddingGenerator, EmbeddingProgress } from './embeddingGenerator';
import { VectorStore } from '../search/vectorStore';
import { Logger } from '../utils/logger';
import { CodeChunk } from './types';

export interface IndexingProgress {
    phase: 'scanning' | 'chunking' | 'embedding' | 'storing' | 'complete';
    current: number;
    total: number;
    percentage: number;
    message: string;
}

export interface IndexingResult {
    success: boolean;
    totalFiles: number;
    totalChunks: number;
    successfulChunks: number;
    failedChunks: number;
    duration: number;
    errors: string[];
}

/**
 * Orchestrates the complete indexing workflow
 * Coordinates file scanning, chunking, embedding, and storage
 */
export class Indexer {
    private logger = new Logger('Indexer');
    private fileScanner: FileScanner;
    private codeChunker: CodeChunker;
    private embeddingGenerator: EmbeddingGenerator;
    private vectorStore: VectorStore;

    constructor() {
        this.fileScanner = new FileScanner();
        this.codeChunker = new CodeChunker();
        this.embeddingGenerator = new EmbeddingGenerator();
        this.vectorStore = new VectorStore();
        this.logger.info('Indexer initialized');
    }

    /**
     * Index entire workspace
     */
    async indexWorkspace(
        onProgress?: (progress: IndexingProgress) => void
    ): Promise<IndexingResult> {
        const startTime = Date.now();
        const errors: string[] = [];

        try {
            this.logger.info('Starting workspace indexing...');

            // Initialize vector store
            await this.vectorStore.initialize();

            // Phase 1: Scan files
            this.reportProgress(onProgress, {
                phase: 'scanning',
                current: 0,
                total: 100,
                percentage: 0,
                message: 'Scanning workspace for code files...'
            });

            const scanResult = await this.fileScanner.scanWorkspace();
            this.logger.info(`Scanned ${scanResult.files.length} files`);

            if (scanResult.files.length === 0) {
                return {
                    success: true,
                    totalFiles: 0,
                    totalChunks: 0,
                    successfulChunks: 0,
                    failedChunks: 0,
                    duration: Date.now() - startTime,
                    errors: ['No files found to index']
                };
            }

            // Phase 2: Chunk files
            this.reportProgress(onProgress, {
                phase: 'chunking',
                current: 0,
                total: scanResult.files.length,
                percentage: 10,
                message: 'Chunking code files...'
            });

            const allChunks: CodeChunk[] = [];
            let processedFiles = 0;

            for (const filePath of scanResult.files) {
                try {
                    const result = await this.codeChunker.chunkFile(filePath);
                    allChunks.push(...result.chunks);

                    if (result.error) {
                        errors.push(`Failed to chunk ${filePath}: ${result.error}`);
                    }

                    processedFiles++;
                    this.reportProgress(onProgress, {
                        phase: 'chunking',
                        current: processedFiles,
                        total: scanResult.files.length,
                        percentage: 10 + (processedFiles / scanResult.files.length) * 20,
                        message: `Chunking files... ${processedFiles}/${scanResult.files.length}`
                    });

                } catch (error) {
                    const errorMsg = `Error chunking ${filePath}: ${error}`;
                    errors.push(errorMsg);
                    this.logger.error(errorMsg);
                }
            }

            this.logger.info(`Chunked ${scanResult.files.length} files into ${allChunks.length} chunks`);

            if (allChunks.length === 0) {
                return {
                    success: false,
                    totalFiles: scanResult.files.length,
                    totalChunks: 0,
                    successfulChunks: 0,
                    failedChunks: 0,
                    duration: Date.now() - startTime,
                    errors: ['No code chunks extracted']
                };
            }

            // Phase 3: Generate embeddings
            this.reportProgress(onProgress, {
                phase: 'embedding',
                current: 0,
                total: allChunks.length,
                percentage: 30,
                message: 'Generating embeddings...'
            });

            const embeddingResult = await this.embeddingGenerator.generateEmbeddings(
                allChunks,
                (embProgress: EmbeddingProgress) => {
                    this.reportProgress(onProgress, {
                        phase: 'embedding',
                        current: embProgress.current,
                        total: embProgress.total,
                        percentage: 30 + (embProgress.percentage * 0.5),
                        message: `Generating embeddings... ${embProgress.current}/${embProgress.total}`
                    });
                }
            );

            this.logger.info(
                `Generated embeddings: ${embeddingResult.successCount} succeeded, ${embeddingResult.failureCount} failed`
            );

            // Phase 4: Store in vector database
            this.reportProgress(onProgress, {
                phase: 'storing',
                current: 0,
                total: embeddingResult.chunks.length,
                percentage: 80,
                message: 'Storing in vector database...'
            });

            await this.vectorStore.insert(embeddingResult.chunks);

            this.logger.info(`Stored ${embeddingResult.chunks.length} chunks in vector database`);

            // Complete
            const duration = Date.now() - startTime;
            this.reportProgress(onProgress, {
                phase: 'complete',
                current: embeddingResult.chunks.length,
                total: embeddingResult.chunks.length,
                percentage: 100,
                message: `Indexing complete! ${embeddingResult.chunks.length} chunks indexed`
            });

            return {
                success: true,
                totalFiles: scanResult.files.length,
                totalChunks: allChunks.length,
                successfulChunks: embeddingResult.successCount,
                failedChunks: embeddingResult.failureCount,
                duration,
                errors
            };

        } catch (error) {
            const errorMsg = `Indexing failed: ${error}`;
            this.logger.error(errorMsg);
            errors.push(errorMsg);

            return {
                success: false,
                totalFiles: 0,
                totalChunks: 0,
                successfulChunks: 0,
                failedChunks: 0,
                duration: Date.now() - startTime,
                errors
            };
        }
    }

    /**
     * Re-index a single file (for incremental updates)
     */
    async reindexFile(filePath: string): Promise<boolean> {
        try {
            this.logger.info(`Re-indexing file: ${filePath}`);

            // Initialize vector store if needed
            if (!(await this.vectorStore.isInitialized())) {
                await this.vectorStore.initialize();
            }

            // Delete old chunks for this file
            await this.vectorStore.deleteFile(filePath);

            // Chunk the file
            const chunkResult = await this.codeChunker.chunkFile(filePath);

            if (chunkResult.chunks.length === 0) {
                this.logger.warn(`No chunks extracted from ${filePath}`);
                return true; // Not an error, file might be empty
            }

            // Generate embeddings
            const embeddingResult = await this.embeddingGenerator.generateEmbeddings(
                chunkResult.chunks
            );

            // Store in database
            await this.vectorStore.insert(embeddingResult.chunks);

            this.logger.info(`Re-indexed ${filePath}: ${embeddingResult.chunks.length} chunks`);
            return true;

        } catch (error) {
            this.logger.error(`Failed to re-index ${filePath}`, error);
            return false;
        }
    }

    /**
     * Clear entire index
     */
    async clearIndex(): Promise<void> {
        this.logger.info('Clearing index...');
        await this.vectorStore.clear();
        this.logger.info('Index cleared');
    }

    /**
     * Get index statistics
     */
    async getStats() {
        return this.vectorStore.getStats();
    }

    /**
     * Get vector store instance
     */
    getVectorStore(): VectorStore {
        return this.vectorStore;
    }

    /**
     * Report progress to callback
     */
    private reportProgress(
        callback: ((progress: IndexingProgress) => void) | undefined,
        progress: IndexingProgress
    ): void {
        if (callback) {
            callback(progress);
        }
    }
}
