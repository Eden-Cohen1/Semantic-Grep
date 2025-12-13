import * as fs from "fs";
import * as path from "path";
import { Logger } from "../../utils/logger";
import { Config } from "../../utils/config";
import { CodeChunk, ChunkResult, ChunkType } from "../types";
import { IChunker } from "./IChunker";
import { CintraCodeChunker } from "./treeSitter/CintraCodeChunker";

/**
 * Chunks code files using Tree-sitter AST parsing with Cintra-style breakpoint logic
 *
 * This implementation is based on CintraAI/code-chunker approach:
 * - Uses Tree-sitter to identify logical breakpoints (functions, classes, etc.)
 * - Adjusts breakpoints to include preceding comments
 * - Respects token limits while breaking at semantic boundaries
 */
export class TreeSitterChunker implements IChunker {
  private logger = new Logger("TreeSitterChunker");
  private chunkerCache: Map<string, CintraCodeChunker> = new Map();

  // Languages supported by this chunker (web development only)
  private supportedLanguages = ["ts", "tsx", "js", "jsx", "css", "vue"];

  constructor() {
    this.logger.info(
      "TreeSitterChunker initialized with Cintra-style chunking"
    );
  }

  getName(): "tree-sitter" {
    return "tree-sitter";
  }

  supportsLanguage(extension: string): boolean {
    return this.supportedLanguages.includes(extension.toLowerCase());
  }

  /**
   * Get or create a CintraCodeChunker for a specific extension
   */
  private getChunker(extension: string): CintraCodeChunker {
    const ext = extension.toLowerCase();
    if (!this.chunkerCache.has(ext)) {
      this.chunkerCache.set(ext, new CintraCodeChunker(ext));
    }
    return this.chunkerCache.get(ext)!;
  }

  /**
   * Chunk a single file using Tree-sitter AST parsing with breakpoint logic
   */
  async chunkFile(filePath: string): Promise<ChunkResult> {
    const extension = path.extname(filePath).slice(1).toLowerCase();

    // Check if language is supported
    if (!this.supportsLanguage(extension)) {
      this.logger.warn(
        `Unsupported language: ${extension}. File will not be chunked.`
      );
      return {
        chunks: [],
        parseSuccess: false,
        parseMethod: "tree-sitter",
        error: `Unsupported file extension: ${extension}`,
      };
    }

    try {
      const content = await fs.promises.readFile(filePath, "utf-8");

      // Handle empty files
      if (!content || content.trim().length === 0) {
        return {
          chunks: [],
          parseSuccess: true,
          parseMethod: "tree-sitter",
        };
      }

      // Get token limit from config (used as chunk size target)
      const tokenLimit = Config.getChunkSize();

      // Get or create chunker for this extension
      const chunker = this.getChunker(extension);

      // Check if extension is supported by the parser
      if (!chunker.supportsExtension()) {
        this.logger.warn(
          `Parser doesn't support ${extension}. File will not be chunked.`
        );
        return {
          chunks: [],
          parseSuccess: false,
          parseMethod: "tree-sitter",
          error: `Parser doesn't support extension: ${extension}`,
        };
      }

      // Chunk the code using Cintra-style breakpoint logic
      const chunkMap = await chunker.chunkAsync(content, tokenLimit);

      // Convert to CodeChunk format
      const chunks = this.convertToCodeChunks(
        filePath,
        content,
        chunkMap,
        extension
      );

      this.logger.debug(
        `Extracted ${chunks.length} chunks from ${filePath} using Tree-sitter`
      );

      return {
        chunks,
        parseSuccess: true,
        parseMethod: "tree-sitter",
      };
    } catch (error) {
      this.logger.error(`Tree-sitter chunking failed for ${filePath}:`, error);
      return {
        chunks: [],
        parseSuccess: false,
        parseMethod: "tree-sitter",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Convert chunk map to CodeChunk array
   */
  private convertToCodeChunks(
    filePath: string,
    content: string,
    chunkMap: Map<number, string>,
    extension: string
  ): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const lines = content.split("\n");

    // Track current position in the file
    let searchStartLine = 0;

    for (const [_chunkNumber, chunkCode] of chunkMap) {
      if (!chunkCode.trim()) {
        continue;
      }

      // Find the start line of this chunk in the original content
      const chunkFirstLine = chunkCode.split("\n")[0];
      let startLine = searchStartLine;

      // Search for the chunk's first line
      while (startLine < lines.length) {
        if (lines[startLine].trim() === chunkFirstLine.trim()) {
          break;
        }
        startLine++;
      }

      // Calculate end line based on chunk line count
      const chunkLineCount = chunkCode.split("\n").length;
      const endLine = startLine + chunkLineCount - 1;

      // Update search position for next chunk
      searchStartLine = endLine + 1;

      // Detect chunk type from content
      const chunkType = this.detectChunkType(chunkCode, extension);

      // Create CodeChunk (1-indexed lines for compatibility)
      chunks.push({
        id: `${filePath}:${startLine + 1}-${endLine + 1}`,
        filePath,
        startLine: startLine + 1,
        endLine: endLine + 1,
        text: chunkCode.trim(),
        type: chunkType,
        language: extension,
        timestamp: Date.now(),
        chunkIndexInFile: chunks.length, // 0-based index
      });
    }

    return chunks;
  }

  /**
   * Detect the type of code chunk based on content using priority-based classification
   * Priority: jsx > function > class > interface > type > export > import > variable > block
   */
  private detectChunkType(code: string, extension: string): ChunkType {
    // Search entire chunk for patterns (not just first line)
    const codeLines = code.split("\n");

    // Python patterns (priority order)
    if (extension === "py") {
      // Priority 1: Functions/methods
      if (codeLines.some((line) => /^\s*(async\s+)?def\s+\w+/.test(line))) {
        return "function";
      }
      // Priority 2: Classes
      if (codeLines.some((line) => /^\s*class\s+\w+/.test(line))) {
        return "class";
      }
      // Priority 6: Imports
      if (
        codeLines.some(
          (line) =>
            /^\s*import\s+/.test(line) || /^\s*from\s+\w+\s+import/.test(line)
        )
      ) {
        return "import";
      }
    }

    // TypeScript/JavaScript patterns (priority order)
    if (["ts", "tsx", "js", "jsx"].includes(extension)) {
      // Priority 1: JSX elements (for React/Vue components)
      // Check for JSX syntax: <Component, <div, <>, return (<
      if (
        ["tsx", "jsx"].includes(extension) &&
        codeLines.some((line) =>
          /^(?:export\s+(?:default\s+)?)?(?:function\s+|const\s+|let\s+)([A-Z]\w+)/.test(
            line
          )
        )
      ) {
        return "component";
      }
      if (
        ["tsx", "jsx"].includes(extension) &&
        codeLines.some(
          (line) =>
            /<[a-z]+[\s>]/.test(line) || // <div, <span, etc.
            /<>/.test(line) || // Fragment
            /return\s*\(?\s*</.test(line) // return (<div
        )
      ) {
        return "jsx";
      }

      // Priority 2: Functions (regular, arrow, async)
      if (
        codeLines.some(
          (line) =>
            /^\s*(export\s+)?(async\s+)?function\s+\w+/.test(line) ||
            /^\s*(export\s+)?const\s+\w+\s*=\s*(async\s+)?\(/.test(line) ||
            /^\s*(export\s+)?const\s+\w+\s*:\s*\([^)]*\)\s*=>/.test(line)
        )
      ) {
        return "function";
      }
      // Priority 3: Classes
      if (
        codeLines.some((line) =>
          /^\s*(export\s+)?(abstract\s+)?class\s+\w+/.test(line)
        )
      ) {
        return "class";
      }
      // Priority 4: Interfaces
      if (
        codeLines.some((line) => /^\s*(export\s+)?interface\s+\w+/.test(line))
      ) {
        return "interface";
      }
      // Priority 5: Type aliases and enums
      if (
        codeLines.some(
          (line) =>
            /^\s*(export\s+)?type\s+\w+/.test(line) ||
            /^\s*(export\s+)?enum\s+\w+/.test(line)
        )
      ) {
        return "type";
      }
      // Priority 6: Export statements (export default, export { })
      if (
        codeLines.some(
          (line) =>
            /^\s*export\s+default\s+/.test(line) || /^\s*export\s+\{/.test(line)
        )
      ) {
        return "export";
      }
      // Priority 6: Imports
      if (codeLines.some((line) => /^\s*import\s+/.test(line))) {
        return "import";
      }
      // Priority 7: Variables
      if (
        codeLines.some((line) =>
          /^\s*(export\s+)?(const|let|var)\s+\w+/.test(line)
        )
      ) {
        return "variable";
      }
    }

    // CSS patterns
    if (extension === "css") {
      return "block";
    }

    // Vue patterns
    if (extension === "vue") {
      if (codeLines.some((line) => /<script/.test(line))) return "script";
      if (codeLines.some((line) => /<template/.test(line))) return "template";
      if (codeLines.some((line) => /<style/.test(line))) return "css";
    }

    return "block";
  }

  /**
   * Chunk multiple files
   */
  async chunkFiles(filePaths: string[]): Promise<CodeChunk[]> {
    const allChunks: CodeChunk[] = [];

    for (const filePath of filePaths) {
      const result = await this.chunkFile(filePath);
      allChunks.push(...result.chunks);
    }

    this.logger.info(
      `Chunked ${filePaths.length} files into ${allChunks.length} chunks using Tree-sitter`
    );
    return allChunks;
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    for (const chunker of this.chunkerCache.values()) {
      chunker.dispose();
    }
    this.chunkerCache.clear();
    this.logger.debug("TreeSitterChunker disposed");
  }
}
