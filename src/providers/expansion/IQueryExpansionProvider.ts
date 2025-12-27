/**
 * Query Expansion Provider Interface
 * Defines the contract for LLM-based query expansion providers
 */

/**
 * Options for query expansion
 */
export interface ExpansionOptions {
    maxSynonyms?: number;        // Maximum number of synonyms to generate
    maxRelatedTerms?: number;    // Maximum number of related terms to generate
    contextHint?: string;        // Additional context (e.g., "TypeScript code")
    temperature?: number;        // LLM temperature for generation
    timeout?: number;            // Timeout in milliseconds
}

/**
 * Result from query expansion
 */
export interface ExpansionResult {
    originalQuery: string;
    synonyms: string[];
    relatedTerms: string[];
    expandedQuery: string;       // Combined query for embedding
    tokensUsed?: number;         // For cost tracking (OpenAI)
    cached?: boolean;            // Whether result was from cache
}

/**
 * Interface that all query expansion providers must implement
 */
export interface IQueryExpansionProvider {
    /**
     * Provider name (e.g., "ollama", "openai")
     */
    readonly providerName: string;

    /**
     * Model name being used
     */
    readonly modelName: string;

    /**
     * Check if the provider is available and responding
     */
    checkConnection(): Promise<boolean>;

    /**
     * Expand a search query with synonyms and related terms
     * @param query Original search query
     * @param options Optional parameters
     * @returns Expansion result with synonyms and combined query
     */
    expandQuery(query: string, options?: ExpansionOptions): Promise<ExpansionResult>;

    /**
     * Clean up resources when provider is no longer needed
     */
    dispose(): Promise<void>;
}
