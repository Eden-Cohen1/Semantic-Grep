import * as path from "path";
import { Config } from "../../utils/config";
import { Logger } from "../../utils/logger";
import { IChunker } from "./IChunker";

/**
 * Factory for creating chunker instances based on configuration and language support
 * Implements lazy initialization and singleton pattern for chunker instances
 */
export class ChunkerFactory {
    private static logger = new Logger("ChunkerFactory");
    private static treeSitterChunker?: IChunker;
    private static langchainChunker?: IChunker;

    /**
     * Get the appropriate chunker for a file based on configuration and language support
     * @param filePath Path to the file to chunk
     * @returns IChunker instance (TreeSitterChunker or LangChainChunker)
     */
    static getChunker(filePath: string): IChunker {
        const extension = path.extname(filePath).slice(1).toLowerCase();
        const preference = Config.getPreferredChunker();
        const treeSitterEnabled = Config.getTreeSitterEnabled();

        this.logger.debug(
            `Getting chunker for ${filePath} (ext: ${extension}, preference: ${preference}, treeSitterEnabled: ${treeSitterEnabled})`
        );

        // If tree-sitter is disabled, use LangChain
        if (!treeSitterEnabled) {
            this.logger.debug("Tree-sitter disabled, using LangChain");
            return this.getLangChainChunker();
        }

        // If user explicitly wants LangChain, use it
        if (preference === "langchain") {
            this.logger.debug("User preference: LangChain");
            return this.getLangChainChunker();
        }

        // Auto mode or explicit tree-sitter preference
        if (preference === "auto" || preference === "tree-sitter") {
            const tsChunker = this.getTreeSitterChunker();
            if (tsChunker && tsChunker.supportsLanguage(extension)) {
                this.logger.debug(`Using Tree-sitter for ${extension}`);
                return tsChunker;
            } else {
                this.logger.debug(
                    `Tree-sitter doesn't support ${extension}, falling back to LangChain`
                );
            }
        }

        // Fallback to LangChain
        return this.getLangChainChunker();
    }

    /**
     * Get or create the TreeSitterChunker instance (lazy initialization)
     * @returns TreeSitterChunker instance or undefined if not available
     */
    private static getTreeSitterChunker(): IChunker | undefined {
        if (!this.treeSitterChunker) {
            try {
                // Lazy import to avoid loading Tree-sitter if not needed
                // This will be implemented in Phase 3
                // For now, return undefined since TreeSitterChunker doesn't exist yet
                this.logger.debug("TreeSitterChunker not yet implemented");
                return undefined;
            } catch (error) {
                this.logger.error("Failed to initialize TreeSitterChunker", error);
                return undefined;
            }
        }
        return this.treeSitterChunker;
    }

    /**
     * Get or create the LangChainChunker instance (lazy initialization)
     * @returns LangChainChunker instance
     */
    private static getLangChainChunker(): IChunker {
        if (!this.langchainChunker) {
            // Lazy import LangChainChunker
            // This will be the refactored CodeChunker
            const { LangChainChunker } = require("./LangChainChunker");
            this.langchainChunker = new LangChainChunker();
            this.logger.debug("Initialized LangChainChunker");
        }
        // Non-null assertion: we know it's initialized above
        return this.langchainChunker!;
    }

    /**
     * Clear cached chunker instances (useful for testing)
     */
    static clearCache(): void {
        this.treeSitterChunker = undefined;
        this.langchainChunker = undefined;
        this.logger.debug("Cleared chunker cache");
    }
}
