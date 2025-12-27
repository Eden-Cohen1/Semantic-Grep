/**
 * Ollama Embedding Provider
 * Implements embedding generation using local Ollama instance
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { BaseEmbeddingProvider } from './BaseEmbeddingProvider';
import { EmbeddingOptions, EmbeddingResult, BatchEmbeddingResult } from './IEmbeddingProvider';
import { OllamaEmbeddingConfig } from '../models/ProviderConfig';
import { getModelConfig } from '../models/EmbeddingModels';
import { Logger } from '../../utils/logger';

interface OllamaModel {
    name: string;
    size: number;
    modified_at: string;
}

interface OllamaTagsResponse {
    models: OllamaModel[];
}

interface OllamaEmbeddingResponse {
    embedding: number[];
}

/**
 * Ollama embedding provider implementation
 */
export class OllamaEmbeddingProvider extends BaseEmbeddingProvider {
    readonly providerName = 'ollama';
    readonly modelConfig;

    private logger = new Logger('OllamaEmbeddingProvider');
    private client: AxiosInstance;
    private config: OllamaEmbeddingConfig;

    constructor(config: OllamaEmbeddingConfig) {
        super();
        this.config = config;

        // Get model configuration
        const modelConfig = getModelConfig('ollama', config.model);
        if (!modelConfig) {
            throw new Error(`Unknown Ollama model: ${config.model}`);
        }
        this.modelConfig = modelConfig;

        // Create axios instance
        this.client = axios.create({
            baseURL: config.url,
            timeout: 60000, // 60 seconds for embedding generation
            headers: {
                'Content-Type': 'application/json'
            }
        });

        this.logger.info(`Ollama embedding provider initialized: ${config.model} @ ${config.url}`);
    }

    /**
     * Check if Ollama is running and accessible
     */
    async checkConnection(): Promise<boolean> {
        try {
            const response = await this.client.get('/api/tags', {
                timeout: 5000 // 5 second timeout for health check
            });
            return response.status === 200;
        } catch (error) {
            this.logger.debug('Connection check failed', error);
            return false;
        }
    }

    /**
     * Check if the configured model is installed
     */
    async isModelAvailable(): Promise<boolean> {
        try {
            const response = await this.client.get<OllamaTagsResponse>('/api/tags');
            const models = response.data.models.map(m => m.name);
            return models.some(model => model.includes(this.config.model));
        } catch (error) {
            this.logger.error(`Failed to check model availability`, error);
            return false;
        }
    }

    /**
     * Generate embedding for a single text
     */
    async generateEmbedding(text: string, options?: EmbeddingOptions): Promise<EmbeddingResult> {
        try {
            // Preprocess text (add prefixes, split identifiers)
            const processedText = this.preprocessText(text, options);

            const response = await this.client.post<OllamaEmbeddingResponse>(
                '/api/embeddings',
                {
                    model: this.config.model,
                    prompt: processedText
                }
            );

            // Normalize if required by model config
            let embedding = response.data.embedding;
            if (this.modelConfig.normalizeVectors) {
                embedding = this.normalizeVector(embedding);
            }

            this.logger.debug(`Generated embedding: ${embedding.length} dimensions`);

            return {
                embedding,
                model: this.config.model
            };
        } catch (error) {
            this.logger.error('Failed to generate embedding', error);
            throw this.handleError(error);
        }
    }

    /**
     * Generate embeddings for multiple texts (batch processing)
     */
    async generateEmbeddings(texts: string[], options?: EmbeddingOptions): Promise<BatchEmbeddingResult> {
        this.logger.info(`Generating embeddings for ${texts.length} texts...`);

        const embeddings: number[][] = [];
        const failedIndices: number[] = [];
        let successCount = 0;
        let failureCount = 0;

        // Process sequentially with retry logic
        for (let i = 0; i < texts.length; i++) {
            try {
                const result = await this.generateEmbeddingWithRetry(texts[i], options);
                embeddings.push(result.embedding);
                successCount++;
            } catch (error) {
                this.logger.error(`Failed to generate embedding for text ${i}`, error);
                embeddings.push([]); // Empty embedding for failed item
                failedIndices.push(i);
                failureCount++;
            }
        }

        return {
            embeddings,
            successCount,
            failureCount,
            failedIndices
        };
    }

    /**
     * Generate embedding with retry logic and exponential backoff
     */
    private async generateEmbeddingWithRetry(
        text: string,
        options?: EmbeddingOptions,
        maxRetries: number = 3
    ): Promise<EmbeddingResult> {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await this.generateEmbedding(text, options);
            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                this.logger.warn(`Retry ${attempt + 1}/${maxRetries} for embedding generation`);

                // Exponential backoff: 1s, 2s, 4s
                const delay = Math.pow(2, attempt) * 1000;
                await this.sleep(delay);
            }
        }

        throw lastError || new Error('Failed to generate embedding after retries');
    }

    /**
     * Handle axios errors and convert to user-friendly messages
     */
    private handleError(error: unknown): Error {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError;

            if (axiosError.code === 'ECONNREFUSED') {
                return new Error('Cannot connect to Ollama. Is it running?');
            }

            if (axiosError.code === 'ETIMEDOUT') {
                return new Error('Request to Ollama timed out');
            }

            if (axiosError.response) {
                return new Error(
                    `Ollama error: ${axiosError.response.status} ${axiosError.response.statusText}`
                );
            }

            return new Error(axiosError.message);
        }

        return error instanceof Error ? error : new Error(String(error));
    }

    /**
     * Sleep for specified milliseconds
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
