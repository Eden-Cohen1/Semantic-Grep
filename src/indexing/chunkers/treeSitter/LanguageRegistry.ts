import Parser from "web-tree-sitter";
import * as path from "path";
import { Logger } from "../../../utils/logger";

/**
 * Manages Tree-sitter language grammars and WASM loading
 * Implements lazy loading and caching for optimal performance
 */
export class LanguageRegistry {
    private static logger = new Logger("LanguageRegistry");
    private static initialized = false;
    private static languages = new Map<string, Parser.Language>();

    /**
     * Map file extensions to grammar names
     * Extension (without dot) -> Grammar name
     */
    private static extensionMap: Record<string, string> = {
        'ts': 'typescript',
        'tsx': 'tsx',
        'js': 'javascript',
        'jsx': 'javascript',
        'css': 'css',
        'vue': 'vue'
    };

    /**
     * Map grammar names to WASM file paths (relative to project root)
     * Grammar name -> WASM path from node_modules
     */
    private static grammarFiles: Record<string, string> = {
        'typescript': 'node_modules/tree-sitter-typescript/tree-sitter-typescript.wasm',
        'tsx': 'node_modules/tree-sitter-typescript/tree-sitter-tsx.wasm',
        'javascript': 'node_modules/tree-sitter-javascript/tree-sitter-javascript.wasm',
        'css': 'node_modules/tree-sitter-css/tree-sitter-css.wasm',
        'vue': 'node_modules/tree-sitter-vue/tree-sitter-vue.wasm'
    };

    /**
     * Initialize Tree-sitter WASM runtime
     * Must be called before using any parsers
     */
    static async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            this.logger.info('Initializing Tree-sitter');

            // Initialize web-tree-sitter
            // By default, it will load tree-sitter.wasm from node_modules
            await Parser.init();

            this.initialized = true;
            this.logger.info('Tree-sitter initialized successfully');
        } catch (error) {
            this.logger.error('Failed to initialize Tree-sitter:', error);
            throw error;
        }
    }

    /**
     * Get language grammar for a file extension (lazy load)
     * @param extension File extension without dot (e.g., "ts", "py")
     * @returns Parser.Language instance or null if not supported
     */
    static async getLanguage(extension: string): Promise<Parser.Language | null> {
        // Ensure Tree-sitter is initialized
        await this.initialize();

        // Get grammar name from extension
        const grammarName = this.extensionMap[extension.toLowerCase()];
        if (!grammarName) {
            this.logger.debug(`No grammar mapping for extension: ${extension}`);
            return null;
        }

        // Check cache
        if (this.languages.has(grammarName)) {
            this.logger.debug(`Using cached grammar for ${grammarName}`);
            return this.languages.get(grammarName)!;
        }

        // Load WASM file
        try {
            const wasmRelativePath = this.grammarFiles[grammarName];
            if (!wasmRelativePath) {
                this.logger.warn(`No WASM file defined for grammar: ${grammarName}`);
                return null;
            }

            this.logger.info(`Loading Tree-sitter grammar: ${grammarName}`);

            // Construct absolute path to WASM file
            // __dirname points to out/indexing/chunkers/treeSitter
            // We need to go up to project root: ../../../..
            const projectRoot = path.join(__dirname, '..', '..', '..', '..');
            const wasmPath = path.join(projectRoot, wasmRelativePath);

            this.logger.debug(`WASM path: ${wasmPath}`);

            // Load the language
            const language = await Parser.Language.load(wasmPath);

            // Cache it
            this.languages.set(grammarName, language);
            this.logger.info(`Successfully loaded grammar: ${grammarName}`);

            return language;
        } catch (error) {
            this.logger.error(`Failed to load grammar for ${grammarName}:`, error);
            return null;
        }
    }

    /**
     * Check if an extension is supported
     * @param extension File extension without dot
     * @returns true if we have a grammar for this extension
     */
    static supportsExtension(extension: string): boolean {
        return extension.toLowerCase() in this.extensionMap;
    }

    /**
     * Get all supported extensions
     * @returns Array of supported file extensions
     */
    static getSupportedExtensions(): string[] {
        return Object.keys(this.extensionMap);
    }

    /**
     * Clear the language cache (useful for testing or reloading)
     */
    static clearCache(): void {
        this.languages.clear();
        this.logger.info('Cleared language cache');
    }

    /**
     * Reset the registry (for testing)
     */
    static reset(): void {
        this.initialized = false;
        this.languages.clear();
        this.logger.info('Reset LanguageRegistry');
    }
}
