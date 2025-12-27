/**
 * OpenAI Embedding Provider
 * Implements embedding generation using OpenAI API
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { BaseEmbeddingProvider } from './BaseEmbeddingProvider';
import { EmbeddingOptions, EmbeddingResult, BatchEmbeddingResult } from './IEmbeddingProvider';
import { OpenAIEmbeddingConfig } from '../models/ProviderConfig';
import { getModelConfig } from '../models/EmbeddingModels';
import { RateLimiter } from '../../utils/rateLimit';
import { Logger } from '../../utils/logger';

interface OpenAIEmbeddingRequest {
    input: string | string[];
    model: string;
}

interface OpenAIEmbeddingResponse {
    data: Array<{
        embedding: number[];
        index: number;
    }>;
    model: string;
    usage: {
        prompt_tokens: number;
        total_tokens: number;
    };
}

/**
 * OpenAI embedding provider implementation
 */
export class OpenAIEmbeddingProvider extends BaseEmbeddingProvider {
    readonly providerName = 'openai';
    readonly modelConfig;

    private logger = new Logger('OpenAIEmbeddingProvider');
    private client: AxiosInstance;
    private config: OpenAIEmbeddingConfig;
    private rateLimiter: RateLimiter;

    constructor(config: OpenAIEmbeddingConfig) {
        super();
        this.config = config;

        // Get model configuration
        const modelConfig = getModelConfig('openai', config.model);
        if (!modelConfig) {
            throw new Error(`Unknown OpenAI model: ${config.model}`);
        }
        this.modelConfig = modelConfig;

        // Create rate limiter
        const requestsPerMinute = config.rateLimit?.requestsPerMinute ?? 500;
        const tokensPerMinute = config.rateLimit?.tokensPerMinute ?? 1000000;
        this.rateLimiter = new RateLimiter(requestsPerMinute, tokensPerMinute);

        // Create axios instance
        const baseURL = config.baseUrl ?? 'https://api.openai.com/v1';
        this.client = axios.create({
            baseURL,
            timeout: 30000, // 30 seconds
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${config.apiKey}`,
                ...(config.organization ? { 'OpenAI-Organization': config.organization } : {})
            }
        });

        this.logger.info(`OpenAI embedding provider initialized: ${config.model}`);
    }

    /**
     * Check if OpenAI API is accessible
     */
    async checkConnection(): Promise<boolean> {
        try {
            // Simple request to verify API key is valid
            const response = await this.client.get('/models', {
                timeout: 5000
            });
            return response.status === 200;
        } catch (error) {
            this.logger.debug('Connection check failed', error);
            return false;
        }
    }

    /**
     * Check if the configured model is available
     */
    async isModelAvailable(): Promise<boolean> {
        try {
            const response = await this.client.get(`/models/${this.config.model}`, {
                timeout: 5000
            });
            return response.status === 200;
        } catch (error) {
            this.logger.debug('Model availability check failed', error);
            return false;
        }
    }

    /**
     * Generate embedding for a single text
     */
    async generateEmbedding(text: string, options?: EmbeddingOptions): Promise<EmbeddingResult> {
        // Wait for rate limit
        await this.rateLimiter.waitForToken();

        try {
            // Preprocess text (OpenAI doesn't use task prefixes, but we still preprocess code)
            const processedText = options?.preprocessCode !== false
                ? this.preprocessCodeForEmbedding(text)
                : text;

            const requestData: OpenAIEmbeddingRequest = {
                input: processedText,
                model: this.config.model
            };

            const response = await this.client.post<OpenAIEmbeddingResponse>(
                '/embeddings',
                requestData
            );

            const embedding = response.data.data[0].embedding;
            const tokensUsed = response.data.usage.total_tokens;

            this.logger.debug(`Generated embedding: ${embedding.length} dimensions, ${tokensUsed} tokens`);

            return {
                embedding,
                tokensUsed,
                model: this.config.model
            };
        } catch (error) {
            this.logger.error('Failed to generate embedding', error);
            throw this.handleError(error);
        }
    }

    /**
     * Generate embeddings for multiple texts (batch processing)
     * OpenAI supports batch embeddings natively
     */
    async generateEmbeddings(texts: string[], options?: EmbeddingOptions): Promise<BatchEmbeddingResult> {
        this.logger.info(`Generating embeddings for ${texts.length} texts...`);

        // Process in batches of 100 (OpenAI supports up to 2048)
        const batchSize = 100;
        const embeddings: number[][] = [];
        const failedIndices: number[] = [];
        let successCount = 0;
        let failureCount = 0;
        let totalTokens = 0;

        for (let i = 0; i < texts.length; i += batchSize) {
            const batch = texts.slice(i, Math.min(i + batchSize, texts.length));

            // Wait for rate limit
            await this.rateLimiter.waitForToken();

            try {
                // Preprocess batch
                const processedBatch = options?.preprocessCode !== false
                    ? batch.map(t => this.preprocessCodeForEmbedding(t))
                    : batch;

                const requestData: OpenAIEmbeddingRequest = {
                    input: processedBatch,
                    model: this.config.model
                };

                const response = await this.client.post<OpenAIEmbeddingResponse>(
                    '/embeddings',
                    requestData
                );

                // Extract embeddings in order
                const sortedData = response.data.data.sort((a, b) => a.index - b.index);
                for (const item of sortedData) {
                    embeddings.push(item.embedding);
                    successCount++;
                }

                totalTokens += response.data.usage.total_tokens;

                this.logger.debug(`Batch ${i / batchSize + 1} completed: ${sortedData.length} embeddings`);
            } catch (error) {
                this.logger.error(`Failed to generate batch ${i / batchSize + 1}`, error);

                // Add failed indices and empty embeddings
                for (let j = i; j < Math.min(i + batchSize, texts.length); j++) {
                    embeddings.push([]);
                    failedIndices.push(j);
                    failureCount++;
                }
            }
        }

        return {
            embeddings,
            successCount,
            failureCount,
            failedIndices,
            totalTokens
        };
    }

    /**
     * Handle axios errors and convert to user-friendly messages
     */
    private handleError(error: unknown): Error {
        if (axios.isAxiosError(error)) {
            const axiosError = error as AxiosError;

            if (axiosError.response) {
                const status = axiosError.response.status;
                const data = axiosError.response.data as any;

                if (status === 401) {
                    return new Error('Invalid OpenAI API key. Please check your configuration.');
                }

                if (status === 429) {
                    return new Error('OpenAI rate limit exceeded. Please try again later.');
                }

                if (status === 500) {
                    return new Error('OpenAI server error. Please try again later.');
                }

                if (data?.error?.message) {
                    return new Error(`OpenAI error: ${data.error.message}`);
                }

                return new Error(`OpenAI error: ${status} ${axiosError.response.statusText}`);
            }

            if (axiosError.code === 'ETIMEDOUT') {
                return new Error('Request to OpenAI timed out');
            }

            return new Error(axiosError.message);
        }

        return error instanceof Error ? error : new Error(String(error));
    }
}
