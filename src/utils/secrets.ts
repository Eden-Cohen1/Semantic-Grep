/**
 * Secrets Management
 * Wrapper for VSCode secrets API to securely store API keys
 */

import * as vscode from 'vscode';

/**
 * Secret keys used by the extension
 */
export const SECRET_KEYS = {
    OPENAI_API_KEY: 'semantic-grep-openai-api-key'
} as const;

/**
 * Secrets manager for secure storage of API keys
 */
export class SecretsManager {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    /**
     * Store a secret value
     * @param key Secret key
     * @param value Secret value
     */
    async store(key: string, value: string): Promise<void> {
        await this.context.secrets.store(key, value);
    }

    /**
     * Retrieve a secret value
     * @param key Secret key
     * @returns Secret value or undefined if not found
     */
    async get(key: string): Promise<string | undefined> {
        return await this.context.secrets.get(key);
    }

    /**
     * Delete a secret value
     * @param key Secret key
     */
    async delete(key: string): Promise<void> {
        await this.context.secrets.delete(key);
    }

    /**
     * Get OpenAI API key
     */
    async getOpenAIKey(): Promise<string | undefined> {
        return await this.get(SECRET_KEYS.OPENAI_API_KEY);
    }

    /**
     * Store OpenAI API key
     */
    async storeOpenAIKey(apiKey: string): Promise<void> {
        await this.store(SECRET_KEYS.OPENAI_API_KEY, apiKey);
    }

    /**
     * Delete OpenAI API key
     */
    async deleteOpenAIKey(): Promise<void> {
        await this.delete(SECRET_KEYS.OPENAI_API_KEY);
    }
}
