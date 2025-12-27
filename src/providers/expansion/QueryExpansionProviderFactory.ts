/**
 * Query Expansion Provider Factory
 * Creates query expansion providers based on configuration
 */

import { IQueryExpansionProvider } from './IQueryExpansionProvider';
import { ExpansionProviderConfig } from '../models/ProviderConfig';

/**
 * Factory for creating query expansion providers
 */
export class QueryExpansionProviderFactory {
    /**
     * Create a query expansion provider based on configuration
     * @param config Provider configuration
     * @returns Query expansion provider instance or null if 'none'
     */
    static async create(config: ExpansionProviderConfig): Promise<IQueryExpansionProvider | null> {
        switch (config.provider) {
            case 'ollama':
                // Lazy load to avoid circular dependencies
                const { OllamaExpansionProvider } = await import('./OllamaExpansionProvider');
                return new OllamaExpansionProvider(config);

            case 'openai':
                // Lazy load to avoid circular dependencies
                const { OpenAIExpansionProvider } = await import('./OpenAIExpansionProvider');
                return new OpenAIExpansionProvider(config);

            case 'none':
                return null;

            default:
                throw new Error(`Unknown expansion provider: ${(config as any).provider}`);
        }
    }
}
