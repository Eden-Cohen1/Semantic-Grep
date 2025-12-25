import axios, { AxiosInstance, AxiosError } from 'axios';
import { Logger } from '../utils/logger';
import { Config } from '../utils/config';

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
 * Client for interacting with Ollama REST API
 * All operations are local - no external API calls
 */
export class OllamaClient {
    private logger = new Logger('OllamaClient');
    private baseUrl: string;
    private client: AxiosInstance;

    constructor() {
        this.baseUrl = Config.get('ollamaUrl', 'http://localhost:11434');

        // Create axios instance with default config
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 30000, // 30 seconds default
            headers: {
                'Content-Type': 'application/json'
            }
        });

        this.logger.info(`Ollama client initialized with base URL: ${this.baseUrl}`);
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
     * List all installed models
     */
    async listModels(): Promise<string[]> {
        try {
            const response = await this.client.get<OllamaTagsResponse>('/api/tags');
            return response.data.models.map(model => model.name);
        } catch (error) {
            this.logger.error('Failed to list models', error);
            throw this.handleError(error);
        }
    }

    /**
     * Check if a specific model is installed
     */
    async isModelInstalled(modelName: string): Promise<boolean> {
        try {
            const models = await this.listModels();
            return models.some(model => model.includes(modelName));
        } catch (error) {
            this.logger.error(`Failed to check if model ${modelName} is installed`, error);
            return false;
        }
    }

    /**
     * Generate embedding for a single text
     */
    async generateEmbedding(text: string): Promise<number[]> {
        const modelName = Config.get('modelName', 'nomic-embed-text');

        try {
            const response = await this.client.post<OllamaEmbeddingResponse>(
                '/api/embeddings',
                {
                    model: modelName,
                    prompt: text
                }
            );

            // Normalize the embedding vector to unit length
            const embedding = this.normalizeVector(response.data.embedding);
            return embedding;
        } catch (error) {
            this.logger.error('Failed to generate embedding', error);
            throw this.handleError(error);
        }
    }

    /**
     * Normalize a vector to unit length (L2 norm = 1)
     */
    private normalizeVector(vector: number[]): number[] {
        const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));

        if (magnitude === 0) {
            this.logger.warn('Zero magnitude vector encountered, returning as-is');
            return vector;
        }

        return vector.map(val => val / magnitude);
    }

    /**
     * Generate embeddings for multiple texts (batch processing)
     * This is more efficient than calling generateEmbedding() multiple times
     */
    async generateEmbeddings(texts: string[]): Promise<number[][]> {
        this.logger.info(`Generating embeddings for ${texts.length} texts...`);

        const embeddings: number[][] = [];

        // Process sequentially with retry logic
        for (let i = 0; i < texts.length; i++) {
            try {
                const embedding = await this.generateEmbeddingWithRetry(texts[i]);
                embeddings.push(embedding);
            } catch (error) {
                this.logger.error(`Failed to generate embedding for text ${i}`, error);
                // Continue with other texts
                embeddings.push([]); // Empty embedding for failed item
            }
        }

        return embeddings;
    }

    /**
     * Generate embedding with retry logic and exponential backoff
     */
    private async generateEmbeddingWithRetry(
        text: string,
        maxRetries: number = 3
    ): Promise<number[]> {
        let lastError: Error | undefined;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await this.generateEmbedding(text);
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
