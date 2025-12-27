/**
 * Query Expander
 * Orchestrates LLM-based query expansion for improved search recall
 */

import {
  IQueryExpansionProvider,
  ExpansionOptions,
  ExpansionResult,
} from "../providers/expansion/IQueryExpansionProvider";
import { Logger } from "../utils/logger";

const logger = new Logger("QueryExpander");

/**
 * Query expander that uses LLM to generate synonyms and related terms
 */
export class QueryExpander {
  private provider: IQueryExpansionProvider | null;
  private cache: Map<string, ExpansionResult>;
  private readonly maxCacheSize = 100;

  constructor(provider: IQueryExpansionProvider | null) {
    this.provider = provider;
    this.cache = new Map();

    if (provider) {
      logger.info(
        `Query expander initialized with ${provider.providerName} (${provider.modelName})`
      );
    } else {
      logger.info(
        "Query expander initialized with no provider (expansion disabled)"
      );
    }
  }

  /**
   * Expand a query with synonyms and related terms
   * Returns the expanded query string, or original query if expansion fails/disabled
   */
  async expandQuery(
    query: string,
    options?: ExpansionOptions
  ): Promise<string> {
    // If no provider, return original query
    if (!this.provider) {
      return query;
    }

    // Check cache first
    const cacheKey = this.getCacheKey(query, options);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.debug(`Using cached expansion for: "${query}"`);
      return cached.expandedQuery;
    }

    try {
      // Expand query using provider
      const result = await this.provider.expandQuery(query, options);

      // Cache the result
      this.addToCache(cacheKey, result);

      logger.info(
        `Query expanded: "${query}" → "${result.expandedQuery}" ` +
          `(${result.synonyms.length} synonyms, ${result.relatedTerms.length} related)`
      );

      return result.expandedQuery;
    } catch (error) {
      logger.error("Query expansion failed, using original query", error);
      return query;
    }
  }

  /**
   * Expand a query and return full expansion result
   */
  async expandQueryDetailed(
    query: string,
    options?: ExpansionOptions
  ): Promise<ExpansionResult> {
    // If no provider, return minimal result
    if (!this.provider) {
      return {
        originalQuery: query,
        synonyms: [],
        relatedTerms: [],
        expandedQuery: query,
      };
    }

    // Check cache first
    const cacheKey = this.getCacheKey(query, options);
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return { ...cached, cached: true };
    }

    try {
      // Expand query using provider
      const result = await this.provider.expandQuery(query, options);

      // Cache the result
      this.addToCache(cacheKey, result);

      return result;
    } catch (error) {
      logger.error("Query expansion failed", error);
      return {
        originalQuery: query,
        synonyms: [],
        relatedTerms: [],
        expandedQuery: query,
      };
    }
  }

  /**
   * Check if expansion is enabled (provider is set)
   */
  isEnabled(): boolean {
    return this.provider !== null;
  }

  /**
   * Get provider name
   */
  getProviderName(): string | null {
    return this.provider?.providerName ?? null;
  }

  /**
   * Clear expansion cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.info("Expansion cache cleared");
  }

  /**
   * Generate cache key from query and options
   */
  private getCacheKey(query: string, options?: ExpansionOptions): string {
    const key = query.toLowerCase().trim();
    const maxSyn = options?.maxSynonyms ?? 3;
    const maxRel = options?.maxRelatedTerms ?? 2;
    return `${key}:${maxSyn}:${maxRel}`;
  }

  /**
   * Add result to cache with LRU eviction
   */
  private addToCache(key: string, result: ExpansionResult): void {
    // Evict oldest entry if cache is full
    if (this.cache.size >= this.maxCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, result);
  }
}
