/**
 * Model metadata for embedding models
 * Defines capabilities and configuration for each embedding model
 */

export interface EmbeddingModelConfig {
    name: string;
    dimensions: number;
    maxTokens: number;
    taskPrefixSupported: boolean;
    queryPrefix?: string;
    documentPrefix?: string;
    normalizeVectors: boolean;
}

/**
 * Registry of supported embedding models with their configurations
 */
export const EMBEDDING_MODELS = {
    ollama: {
        'nomic-embed-text': {
            name: 'nomic-embed-text',
            dimensions: 768,
            maxTokens: 8192,
            taskPrefixSupported: true,
            queryPrefix: 'search_query:',
            documentPrefix: 'search_document:',
            normalizeVectors: true
        },
        'mxbai-embed-large': {
            name: 'mxbai-embed-large',
            dimensions: 1024,
            maxTokens: 512,
            taskPrefixSupported: false,
            normalizeVectors: true
        }
    },
    openai: {
        'text-embedding-3-small': {
            name: 'text-embedding-3-small',
            dimensions: 1536,
            maxTokens: 8191,
            taskPrefixSupported: false,
            normalizeVectors: false  // OpenAI already returns normalized vectors
        },
        'text-embedding-3-large': {
            name: 'text-embedding-3-large',
            dimensions: 3072,
            maxTokens: 8191,
            taskPrefixSupported: false,
            normalizeVectors: false
        }
    }
} as const;

/**
 * Get model configuration by provider and model name
 */
export function getModelConfig(
    provider: 'ollama' | 'openai',
    modelName: string
): EmbeddingModelConfig | undefined {
    const providerModels = EMBEDDING_MODELS[provider] as Record<string, EmbeddingModelConfig>;
    return providerModels[modelName];
}
