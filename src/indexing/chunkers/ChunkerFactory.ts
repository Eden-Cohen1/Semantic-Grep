import * as path from "path";
import { Logger } from "../../utils/logger";
import { IChunker } from "./IChunker";
import { TreeSitterChunker } from "./TreeSitterChunker";

/**
 * Factory for creating chunker instances
 * Implements singleton pattern for the TreeSitterChunker instance
 */
export class ChunkerFactory {
  private static logger = new Logger("ChunkerFactory");
  private static treeSitterChunker?: IChunker;

  /**
   * Get the chunker instance for a file
   * @param filePath Path to the file to chunk (used for logging only)
   * @returns TreeSitterChunker instance
   */
  static getChunker(filePath: string): IChunker {
    const extension = path.extname(filePath).slice(1).toLowerCase();

    this.logger.info(
      `[ChunkerFactory] Getting chunker for ${path.basename(
        filePath
      )} (ext: ${extension})`
    );

    return this.getTreeSitterChunker();
  }

  /**
   * Get or create the TreeSitterChunker instance (lazy initialization)
   * @returns TreeSitterChunker instance
   */
  private static getTreeSitterChunker(): IChunker {
    if (!this.treeSitterChunker) {
      this.logger.info("[ChunkerFactory] Initializing TreeSitterChunker...");
      this.treeSitterChunker = new TreeSitterChunker();
      this.logger.info(
        "[ChunkerFactory] ✅ TreeSitterChunker initialized successfully"
      );
    }
    return this.treeSitterChunker;
  }

  /**
   * Clear cached chunker instance (useful for testing)
   */
  static clearCache(): void {
    this.treeSitterChunker = undefined;
    this.logger.debug("Cleared chunker cache");
  }
}
