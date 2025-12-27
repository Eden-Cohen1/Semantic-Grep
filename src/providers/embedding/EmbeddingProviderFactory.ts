/**
 * Embedding Provider Factory
 * Creates embedding providers based on configuration
 */

import { IEmbeddingProvider } from './IEmbeddingProvider';
import { EmbeddingProviderConfig } from '../models/ProviderConfig';

/**
 * Factory for creating embedding providers
 */
export class EmbeddingProviderFactory {
    /**
     * Create an embedding provider based on configuration
     * @param config Provider configuration
     * @returns Embedding provider instance
     */
    static async create(config: EmbeddingProviderConfig): Promise<IEmbeddingProvider> {
        switch (config.provider) {
            case 'ollama':
                // Lazy load to avoid circular dependencies
                const { OllamaEmbeddingProvider } = await import('./OllamaEmbeddingProvider');
                return new OllamaEmbeddingProvider(config);

            case 'openai':
                // Lazy load to avoid circular dependencies
                const { OpenAIEmbeddingProvider } = await import('./OpenAIEmbeddingProvider');
                return new OpenAIEmbeddingProvider(config);

            default:
                throw new Error(`Unknown embedding provider: ${(config as any).provider}`);
        }
    }
}
