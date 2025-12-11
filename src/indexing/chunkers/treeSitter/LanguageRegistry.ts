import Parser from "web-tree-sitter";
import * as path from "path";
import * as vscode from "vscode";
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
        'py': 'python',
        'vue': 'vue'
    };

    /**
     * Map grammar names to WASM file names
     * Grammar name -> WASM filename
     */
    private static grammarFiles: Record<string, string> = {
        'typescript': 'tree-sitter-typescript.wasm',
        'tsx': 'tree-sitter-tsx.wasm',
        'javascript': 'tree-sitter-javascript.wasm',
        'python': 'tree-sitter-python.wasm',
        'vue': 'tree-sitter-vue.wasm'
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
            // Get extension path
            const extension = vscode.extensions.getExtension('your-publisher-name.semantic-grep');
            if (!extension) {
                throw new Error('Extension not found - cannot locate WASM files');
            }

            const extensionPath = extension.extensionPath;
            const wasmPath = path.join(extensionPath, 'out', 'grammars');

            this.logger.info(`Initializing Tree-sitter with WASM path: ${wasmPath}`);

            // Initialize web-tree-sitter with locateFile callback
            await Parser.init({
                locateFile(scriptName: string, scriptDirectory: string) {
                    // Always load from our grammars directory
                    if (scriptName === 'tree-sitter.wasm') {
                        // Main tree-sitter WASM is in node_modules
                        return path.join(extensionPath, 'node_modules', 'web-tree-sitter', 'tree-sitter.wasm');
                    }
                    // Language WASM files are in out/grammars
                    return path.join(wasmPath, scriptName);
                }
            });

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
            const wasmFile = this.grammarFiles[grammarName];
            if (!wasmFile) {
                this.logger.warn(`No WASM file defined for grammar: ${grammarName}`);
                return null;
            }

            this.logger.info(`Loading Tree-sitter grammar: ${grammarName} (${wasmFile})`);

            // Get extension path
            const extension_vscode = vscode.extensions.getExtension('your-publisher-name.semantic-grep');
            if (!extension_vscode) {
                throw new Error('Extension not found');
            }

            const wasmPath = path.join(extension_vscode.extensionPath, 'out', 'grammars', wasmFile);

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
