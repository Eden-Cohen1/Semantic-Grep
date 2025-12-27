/**
 * Provider configuration types
 * Defines configuration structures for different embedding and expansion providers
 */

export type EmbeddingProviderType = 'ollama' | 'openai';
export type ExpansionProviderType = 'ollama' | 'openai' | 'none';

/**
 * Ollama embedding configuration
 */
export interface OllamaEmbeddingConfig {
    provider: 'ollama';
    url: string;
    model: 'nomic-embed-text' | 'mxbai-embed-large';
}

/**
 * OpenAI embedding configuration
 */
export interface OpenAIEmbeddingConfig {
    provider: 'openai';
    apiKey: string;
    model: 'text-embedding-3-small' | 'text-embedding-3-large';
    organization?: string;
    baseUrl?: string;  // Optional custom endpoint
    rateLimit?: {
        requestsPerMinute: number;
        tokensPerMinute: number;
    };
}

/**
 * Union type for embedding provider configurations
 */
export type EmbeddingProviderConfig = OllamaEmbeddingConfig | OpenAIEmbeddingConfig;

/**
 * Ollama expansion configuration
 */
export interface OllamaExpansionConfig {
    provider: 'ollama';
    url: string;
    model: string;  // llama3.2, qwen2.5, etc.
    temperature?: number;
}

/**
 * OpenAI expansion configuration
 */
export interface OpenAIExpansionConfig {
    provider: 'openai';
    apiKey: string;
    model: 'gpt-4o-mini';
    organization?: string;
    baseUrl?: string;
    temperature?: number;
}

/**
 * No expansion configuration
 */
export interface NoExpansionConfig {
    provider: 'none';
}

/**
 * Union type for expansion provider configurations
 */
export type ExpansionProviderConfig = OllamaExpansionConfig | OpenAIExpansionConfig | NoExpansionConfig;
