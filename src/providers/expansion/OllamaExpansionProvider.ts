/**
 * Ollama Query Expansion Provider
 * Uses Ollama LLM to generate query expansions with synonyms and related terms
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { IQueryExpansionProvider, ExpansionOptions, ExpansionResult } from './IQueryExpansionProvider';
import { OllamaExpansionConfig } from '../models/ProviderConfig';
import { Logger } from '../../utils/logger';

interface OllamaGenerateRequest {
    model: string;
    prompt: string;
    stream: boolean;
    options?: {
        temperature?: number;
    };
}

interface OllamaGenerateResponse {
    model: string;
    created_at: string;
    response: string;
    done: boolean;
}

/**
 * Ollama query expansion provider implementation
 */
export class OllamaExpansionProvider implements IQueryExpansionProvider {
    readonly providerName = 'ollama';
    readonly modelName: string;

    private logger = new Logger('OllamaExpansionProvider');
    private client: AxiosInstance;
    private config: OllamaExpansionConfig;

    constructor(config: OllamaExpansionConfig) {
        this.config = config;
        this.modelName = config.model;

        // Create axios instance
        this.client = axios.create({
            baseURL: config.url,
            timeout: 30000, // 30 seconds for text generation
            headers: {
                'Content-Type': 'application/json'
            }
        });

        this.logger.info(`Ollama expansion provider initialized: ${config.model} @ ${config.url}`);
    }

    /**
     * Check if Ollama is running and accessible
     */
    async checkConnection(): Promise<boolean> {
        try {
            const response = await this.client.get('/api/tags', {
                timeout: 5000
            });
            return response.status === 200;
        } catch (error) {
            this.logger.debug('Connection check failed', error);
            return false;
        }
    }

    /**
     * Expand a search query with synonyms and related terms
     */
    async expandQuery(query: string, options?: ExpansionOptions): Promise<ExpansionResult> {
        const maxSynonyms = options?.maxSynonyms ?? 3;
        const maxRelatedTerms = options?.maxRelatedTerms ?? 2;
        const contextHint = options?.contextHint ?? 'code search';
        const temperature = options?.temperature ?? this.config.temperature ?? 0.3;
        const timeout = options?.timeout ?? 5000; // 5 second default timeout

        try {
            const prompt = this.buildExpansionPrompt(query, maxSynonyms, maxRelatedTerms, contextHint);

            const response = await this.client.post<OllamaGenerateResponse>(
                '/api/generate',
                {
                    model: this.config.model,
                    prompt,
                    stream: false,
                    options: {
                        temperature
                    }
                } as OllamaGenerateRequest,
                {
                    timeout
                }
            );

            // Parse the response to extract synonyms and related terms
            const { synonyms, relatedTerms } = this.parseExpansionResponse(response.data.response);

            // Combine original query with expansions
            const expandedQuery = this.buildExpandedQuery(query, synonyms, relatedTerms);

            this.logger.debug(`Query expanded: "${query}" → "${expandedQuery}"`);

            return {
                originalQuery: query,
                synonyms,
                relatedTerms,
                expandedQuery
            };
        } catch (error) {
            // Provide helpful error message for common issues
            if (axios.isAxiosError(error) && error.response?.status === 404) {
                this.logger.error(
                    `Model '${this.config.model}' not found. Please pull it with: ollama pull ${this.config.model}`
                );
            } else {
                this.logger.error('Failed to expand query, using original', error);
            }

            // Fallback to original query on error
            return {
                originalQuery: query,
                synonyms: [],
                relatedTerms: [],
                expandedQuery: query
            };
        }
    }

    /**
     * Build prompt for query expansion
     */
    private buildExpansionPrompt(
        query: string,
        maxSynonyms: number,
        maxRelatedTerms: number,
        contextHint: string
    ): string {
        return `You are a code search assistant. Given a search query, generate relevant synonyms and related technical terms.

Query: "${query}"
Context: ${contextHint}

Generate up to ${maxSynonyms} direct synonyms and up to ${maxRelatedTerms} related programming terms.

Respond ONLY with a JSON object in this exact format (no explanation):
{
    "synonyms": ["term1", "term2"],
    "related": ["term3", "term4"]
}`;
    }

    /**
     * Parse the LLM response to extract synonyms and related terms
     */
    private parseExpansionResponse(response: string): { synonyms: string[]; relatedTerms: string[] } {
        try {
            // Try to extract JSON from the response
            // Sometimes LLMs include extra text, so we need to extract the JSON part
            const jsonMatch = response.match(/\{[\s\S]*\}/);
            if (!jsonMatch) {
                this.logger.warn('No JSON found in response, returning empty expansion');
                return { synonyms: [], relatedTerms: [] };
            }

            const parsed = JSON.parse(jsonMatch[0]);

            const synonyms = Array.isArray(parsed.synonyms) ? parsed.synonyms : [];
            const relatedTerms = Array.isArray(parsed.related) ? parsed.related : [];

            return {
                synonyms: synonyms.filter((s: string | any[]) => typeof s === 'string' && s.length > 0),
                relatedTerms: relatedTerms.filter((r: string | any[]) => typeof r === 'string' && r.length > 0)
            };
        } catch (error) {
            this.logger.error('Failed to parse expansion response', error);
            return { synonyms: [], relatedTerms: [] };
        }
    }

    /**
     * Build expanded query by combining original with synonyms and related terms
     */
    private buildExpandedQuery(query: string, synonyms: string[], relatedTerms: string[]): string {
        // Combine all terms, with original query first
        const allTerms = [query, ...synonyms, ...relatedTerms];

        // Join with spaces (will be embedded as single query)
        return allTerms.join(' ');
    }

    /**
     * Clean up resources
     */
    async dispose(): Promise<void> {
        // No cleanup needed for Ollama
    }
}
