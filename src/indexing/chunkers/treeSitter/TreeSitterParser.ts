import Parser from "web-tree-sitter";
import { Logger } from "../../../utils/logger";
import { LanguageRegistry } from "./LanguageRegistry";

/**
 * Wraps web-tree-sitter Parser with error handling and lifecycle management
 * Manages parser state and language switching
 */
export class TreeSitterParser {
    private logger = new Logger("TreeSitterParser");
    private parser: Parser | null = null;
    private currentLanguage: string | null = null;

    /**
     * Parse file content into a syntax tree
     * @param content File content to parse
     * @param extension File extension (without dot) to determine language
     * @returns Parsed tree or null if parsing fails
     */
    async parse(content: string, extension: string): Promise<Parser.Tree | null> {
        try {
            // Get language grammar
            const language = await LanguageRegistry.getLanguage(extension);
            if (!language) {
                this.logger.debug(`No language grammar available for ${extension}`);
                return null;
            }

            // Create parser if needed
            if (!this.parser) {
                this.parser = new Parser();
                this.logger.debug('Created new Parser instance');
            }

            // Set language if changed
            if (this.currentLanguage !== extension) {
                this.parser.setLanguage(language);
                this.currentLanguage = extension;
                this.logger.debug(`Set parser language to ${extension}`);
            }

            // Parse content
            const startTime = Date.now();
            const tree = this.parser.parse(content);
            const parseTime = Date.now() - startTime;

            this.logger.debug(`Parsed ${content.length} chars in ${parseTime}ms`);

            return tree;
        } catch (error) {
            this.logger.error(`Tree-sitter parse error for ${extension}:`, error);
            return null;
        }
    }

    /**
     * Check if the parser has syntax errors in the tree
     * @param tree Parsed tree to check
     * @returns true if tree contains errors
     */
    hasErrors(tree: Parser.Tree): boolean {
        return tree.rootNode.hasError;
    }

    /**
     * Get error nodes from the tree
     * @param tree Parsed tree
     * @returns Array of error nodes
     */
    getErrors(tree: Parser.Tree): Parser.SyntaxNode[] {
        const errors: Parser.SyntaxNode[] = [];

        const walk = (node: Parser.SyntaxNode) => {
            if (node.type === 'ERROR' || node.isMissing) {
                errors.push(node);
            }
            for (const child of node.children) {
                walk(child);
            }
        };

        walk(tree.rootNode);
        return errors;
    }

    /**
     * Cleanup parser resources
     * Important: Call this when done to free WASM memory
     */
    dispose(): void {
        if (this.parser) {
            this.parser.delete();
            this.parser = null;
            this.currentLanguage = null;
            this.logger.debug('Parser disposed');
        }
    }

    /**
     * Check if parser is initialized
     */
    isInitialized(): boolean {
        return this.parser !== null;
    }
}
