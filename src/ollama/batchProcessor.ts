import { OllamaClient } from "./ollamaClient";
import { Logger } from "../utils/logger";
import { Config } from "../utils/config";

export interface BatchProcessorOptions {
  batchSize?: number;
  delayBetweenBatches?: number;
  maxRetries?: number;
  onProgress?: (current: number, total: number) => void;
}

export interface BatchResult {
  embeddings: number[][];
  failedIndices: number[];
  successCount: number;
  failureCount: number;
}

/**
 * Handles batch processing of embeddings with retry logic and rate limiting
 * Optimizes performance while avoiding overwhelming Ollama
 */
export class BatchProcessor {
  private logger = new Logger("BatchProcessor");
  private client: OllamaClient;
  private batchSize: number;
  private delayBetweenBatches: number;
  private maxRetries: number;

  constructor(options: BatchProcessorOptions = {}) {
    this.client = new OllamaClient();
    this.batchSize = options.batchSize ?? Config.getBatchSize();
    this.delayBetweenBatches = options.delayBetweenBatches ?? 100; // 100ms default
    this.maxRetries = options.maxRetries ?? 3;

    this.logger.info(
      `BatchProcessor initialized with batch size: ${this.batchSize}`
    );
  }

  /**
   * Process multiple texts into embeddings with batching and retry logic
   */
  async processTexts(
    texts: string[],
    onProgress?: (current: number, total: number) => void
  ): Promise<BatchResult> {
    this.logger.info(
      `Processing ${texts.length} texts in batches of ${this.batchSize}`
    );

    const embeddings: number[][] = new Array(texts.length);
    const failedIndices: number[] = [];
    let successCount = 0;
    let processedCount = 0;

    // Split into batches
    const batches = this.createBatches(texts);
    this.logger.info(`Created ${batches.length} batches`);

    // Process each batch sequentially
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
      const batch = batches[batchIndex];
      this.logger.debug(`Processing batch ${batchIndex + 1}/${batches.length}`);

      try {
        // Process batch with retry
        const batchEmbeddings = await this.processBatchWithRetry(batch.texts);

        // Store results at correct indices
        for (let i = 0; i < batch.texts.length; i++) {
          const originalIndex = batch.startIndex + i;
          embeddings[originalIndex] = batchEmbeddings[i];

          if (batchEmbeddings[i].length > 0) {
            successCount++;
          } else {
            failedIndices.push(originalIndex);
          }
        }

        processedCount += batch.texts.length;

        // Report progress
        if (onProgress) {
          onProgress(processedCount, texts.length);
        }

        // Rate limiting - delay between batches
        if (batchIndex < batches.length - 1) {
          await this.sleep(this.delayBetweenBatches);
        }
      } catch (error) {
        this.logger.error(`Batch ${batchIndex + 1} failed completely`, error);

        // Mark all items in this batch as failed
        for (let i = 0; i < batch.texts.length; i++) {
          const originalIndex = batch.startIndex + i;
          embeddings[originalIndex] = [];
          failedIndices.push(originalIndex);
        }

        processedCount += batch.texts.length;

        // Report progress even on failure
        if (onProgress) {
          onProgress(processedCount, texts.length);
        }

        // Try to recover by reducing batch size
        if (this.batchSize > 1) {
          this.logger.warn(
            `Reducing batch size from ${this.batchSize} to ${Math.floor(
              this.batchSize / 2
            )}`
          );
          this.batchSize = Math.floor(this.batchSize / 2);
        }
      }
    }

    const failureCount = failedIndices.length;
    this.logger.info(
      `Batch processing complete: ${successCount} succeeded, ${failureCount} failed`
    );

    return {
      embeddings,
      failedIndices,
      successCount,
      failureCount,
    };
  }

  /**
   * Process a single batch with retry logic
   */
  private async processBatchWithRetry(texts: string[]): Promise<number[][]> {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await this.client.generateEmbeddings(texts);
      } catch (error) {
        let lastError: Error | undefined =
          error instanceof Error ? error : new Error(String(error));
        this.logger.warn(
          `Batch retry ${attempt + 1}/${this.maxRetries}`,
          lastError
        );

        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt) * 1000;
        await this.sleep(delay);
      }
    }

    // If all retries failed, try processing items individually
    this.logger.warn(
      "Batch processing failed, falling back to individual processing"
    );
    return await this.processIndividually(texts);
  }

  /**
   * Process texts individually as a fallback when batch processing fails
   */
  private async processIndividually(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];

    for (let i = 0; i < texts.length; i++) {
      try {
        const embedding = await this.client.generateEmbedding(texts[i]);
        embeddings.push(embedding);
      } catch (error) {
        this.logger.error(`Failed to process individual text ${i}`, error);
        embeddings.push([]); // Empty array for failed items
      }

      // Small delay between individual requests
      if (i < texts.length - 1) {
        await this.sleep(50);
      }
    }

    return embeddings;
  }

  /**
   * Retry failed items from a previous batch run
   */
  async retryFailedItems(
    texts: string[],
    failedIndices: number[],
    originalEmbeddings: number[][]
  ): Promise<BatchResult> {
    this.logger.info(`Retrying ${failedIndices.length} failed items`);

    const failedTexts = failedIndices.map((index) => texts[index]);
    const result = await this.processTexts(failedTexts);

    // Merge results back into original embeddings
    const updatedEmbeddings = [...originalEmbeddings];
    const stillFailedIndices: number[] = [];

    for (let i = 0; i < failedIndices.length; i++) {
      const originalIndex = failedIndices[i];
      updatedEmbeddings[originalIndex] = result.embeddings[i];

      if (result.embeddings[i].length === 0) {
        stillFailedIndices.push(originalIndex);
      }
    }

    const successCount = failedIndices.length - stillFailedIndices.length;

    return {
      embeddings: updatedEmbeddings,
      failedIndices: stillFailedIndices,
      successCount,
      failureCount: stillFailedIndices.length,
    };
  }

  /**
   * Split texts into batches
   */
  private createBatches(
    texts: string[]
  ): Array<{ texts: string[]; startIndex: number }> {
    const batches: Array<{ texts: string[]; startIndex: number }> = [];

    for (let i = 0; i < texts.length; i += this.batchSize) {
      batches.push({
        texts: texts.slice(i, i + this.batchSize),
        startIndex: i,
      });
    }

    return batches;
  }

  /**
   * Dynamically adjust batch size based on performance
   */
  adjustBatchSize(increase: boolean) {
    const oldSize = this.batchSize;

    if (increase) {
      // Increase by 25%, max 100
      this.batchSize = Math.min(Math.floor(this.batchSize * 1.25), 100);
    } else {
      // Decrease by 50%, min 1
      this.batchSize = Math.max(Math.floor(this.batchSize / 2), 1);
    }

    if (oldSize !== this.batchSize) {
      this.logger.info(
        `Adjusted batch size from ${oldSize} to ${this.batchSize}`
      );
    }
  }

  /**
   * Get current batch size
   */
  getBatchSize(): number {
    return this.batchSize;
  }

  /**
   * Set batch size
   */
  setBatchSize(size: number) {
    if (size < 1 || size > 100) {
      throw new Error("Batch size must be between 1 and 100");
    }
    this.logger.info(`Setting batch size to ${size}`);
    this.batchSize = size;
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
