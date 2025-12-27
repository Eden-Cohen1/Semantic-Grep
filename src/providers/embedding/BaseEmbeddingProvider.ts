/**
 * Base Embedding Provider
 * Abstract class with common functionality for all embedding providers
 */

import { IEmbeddingProvider, EmbeddingOptions } from './IEmbeddingProvider';
import { EmbeddingModelConfig } from '../models/EmbeddingModels';

/**
 * Abstract base class for embedding providers
 * Provides common functionality like preprocessing and normalization
 */
export abstract class BaseEmbeddingProvider implements IEmbeddingProvider {
    abstract readonly providerName: string;
    abstract readonly modelConfig: EmbeddingModelConfig;

    abstract checkConnection(): Promise<boolean>;
    abstract isModelAvailable(): Promise<boolean>;
    abstract generateEmbedding(text: string, options?: EmbeddingOptions): Promise<any>;
    abstract generateEmbeddings(texts: string[], options?: EmbeddingOptions): Promise<any>;

    /**
     * Normalize a vector to unit length using L2 normalization
     * @param vector Vector to normalize
     * @returns Normalized vector
     */
    normalizeVector(vector: number[]): number[] {
        const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));

        if (magnitude === 0) {
            return vector;
        }

        return vector.map(val => val / magnitude);
    }

    /**
     * Preprocess text before embedding
     * - Splits camelCase and snake_case identifiers
     * - Adds task-specific prefixes (if supported by model)
     * @param text Text to preprocess
     * @param options Optional parameters
     * @returns Preprocessed text
     */
    preprocessText(text: string, options?: EmbeddingOptions): string {
        let processed = text;

        // Apply code preprocessing if enabled (default: true)
        if (options?.preprocessCode !== false) {
            processed = this.preprocessCodeForEmbedding(processed);
        }

        // Add task-specific prefix if supported by the model
        if (this.modelConfig.taskPrefixSupported && options?.isQuery !== undefined) {
            const prefix = options.isQuery
                ? this.modelConfig.queryPrefix
                : this.modelConfig.documentPrefix;

            if (prefix) {
                processed = `${prefix} ${processed}`;
            }
        }

        return processed;
    }

    /**
     * Preprocess code by splitting identifiers for better embedding
     * - Converts camelCase to separate words (getUserData → get User Data)
     * - Converts snake_case to separate words (user_id → user id)
     * - Normalizes whitespace
     * @param code Code text to preprocess
     * @returns Preprocessed code
     */
    protected preprocessCodeForEmbedding(code: string): string {
        // Split camelCase: myVariable → my Variable
        let processed = code.replace(/([a-z])([A-Z])/g, '$1 $2');

        // Split PascalCase: MyClass → My Class
        processed = processed.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');

        // Replace snake_case underscores with spaces
        processed = processed.replace(/_/g, ' ');

        // Replace hyphens with spaces
        processed = processed.replace(/-/g, ' ');

        // Normalize whitespace
        processed = processed.replace(/\s+/g, ' ').trim();

        return processed;
    }

    /**
     * Clean up resources
     * Can be overridden by subclasses if needed
     */
    async dispose(): Promise<void> {
        // Default: no cleanup needed
    }
}
