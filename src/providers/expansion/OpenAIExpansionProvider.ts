/**
 * OpenAI Query Expansion Provider
 * Uses OpenAI GPT models to generate query expansions with synonyms and related terms
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import { IQueryExpansionProvider, ExpansionOptions, ExpansionResult } from './IQueryExpansionProvider';
import { OpenAIExpansionConfig } from '../models/ProviderConfig';
import { RateLimiter } from '../../utils/rateLimit';
import { Logger } from '../../utils/logger';

interface OpenAIChatMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

interface OpenAIChatRequest {
    model: string;
    messages: OpenAIChatMessage[];
    temperature?: number;
    max_tokens?: number;
}

interface OpenAIChatResponse {
    choices: Array<{
        message: {
            content: string;
        };
        finish_reason: string;
    }>;
    usage: {
        prompt_tokens: number;
        completion_tokens: number;
        total_tokens: number;
    };
}

/**
 * OpenAI query expansion provider implementation
 */
export class OpenAIExpansionProvider implements IQueryExpansionProvider {
    readonly providerName = 'openai';
    readonly modelName: string;

    private logger = new Logger('OpenAIExpansionProvider');
    private client: AxiosInstance;
    private config: OpenAIExpansionConfig;
    private rateLimiter: RateLimiter;

    constructor(config: OpenAIExpansionConfig) {
        this.config = config;
        this.modelName = config.model;

        // Create rate limiter (GPT models have lower limits)
        this.rateLimiter = new RateLimiter(200); // 200 requests per minute

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

        this.logger.info(`OpenAI expansion provider initialized: ${config.model}`);
    }

    /**
     * Check if OpenAI API is accessible
     */
    async checkConnection(): Promise<boolean> {
        try {
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
     * Expand a search query with synonyms and related terms
     */
    async expandQuery(query: string, options?: ExpansionOptions): Promise<ExpansionResult> {
        const maxSynonyms = options?.maxSynonyms ?? 3;
        const maxRelatedTerms = options?.maxRelatedTerms ?? 2;
        const contextHint = options?.contextHint ?? 'code search';
        const temperature = options?.temperature ?? this.config.temperature ?? 0.3;
        const timeout = options?.timeout ?? 5000; // 5 second default timeout

        // Wait for rate limit
        await this.rateLimiter.waitForToken();

        try {
            const messages = this.buildExpansionMessages(query, maxSynonyms, maxRelatedTerms, contextHint);

            const requestData: OpenAIChatRequest = {
                model: this.config.model,
                messages,
                temperature,
                max_tokens: 150
            };

            const response = await this.client.post<OpenAIChatResponse>(
                '/chat/completions',
                requestData,
                { timeout }
            );

            const content = response.data.choices[0].message.content;
            const tokensUsed = response.data.usage.total_tokens;

            // Parse the response to extract synonyms and related terms
            const { synonyms, relatedTerms } = this.parseExpansionResponse(content);

            // Combine original query with expansions
            const expandedQuery = this.buildExpandedQuery(query, synonyms, relatedTerms);

            this.logger.debug(`Query expanded: "${query}" → "${expandedQuery}" (${tokensUsed} tokens)`);

            return {
                originalQuery: query,
                synonyms,
                relatedTerms,
                expandedQuery,
                tokensUsed
            };
        } catch (error) {
            this.logger.error('Failed to expand query, using original', error);

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
     * Build chat messages for query expansion
     */
    private buildExpansionMessages(
        query: string,
        maxSynonyms: number,
        maxRelatedTerms: number,
        contextHint: string
    ): OpenAIChatMessage[] {
        return [
            {
                role: 'system',
                content: 'You are a code search assistant. Given a search query, generate relevant synonyms and related technical terms. Respond ONLY with a JSON object, no additional text.'
            },
            {
                role: 'user',
                content: `Query: "${query}"
Context: ${contextHint}

Generate up to ${maxSynonyms} direct synonyms and up to ${maxRelatedTerms} related programming terms.

Respond with a JSON object in this format:
{
    "synonyms": ["term1", "term2"],
    "related": ["term3", "term4"]
}`
            }
        ];
    }

    /**
     * Parse the LLM response to extract synonyms and related terms
     */
    private parseExpansionResponse(response: string): { synonyms: string[]; relatedTerms: string[] } {
        try {
            // Try to extract JSON from the response
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
        // No cleanup needed
    }
}
