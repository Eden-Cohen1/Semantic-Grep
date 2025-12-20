import * as fs from "fs";
import * as path from "path";
import { Logger } from "../../utils/logger";
import { Config } from "../../utils/config";
import { CodeChunk, ChunkResult, ChunkType } from "../types";
import { IChunker } from "./IChunker";
import { ASTCodeChunker } from "./treeSitter/ASTCodeChunker";

/**
 * Chunks code files using Tree-sitter AST parsing with AST-based breakpoint logic
 *
 * This implementation is based on CintraAI/code-chunker approach:
 * - Uses Tree-sitter to identify logical breakpoints (functions, classes, etc.)
 * - Adjusts breakpoints to include preceding comments
 * - Respects token limits while breaking at semantic boundaries
 */
export class TreeSitterChunker implements IChunker {
  private logger = new Logger("TreeSitterChunker");
  private chunkerCache: Map<string, ASTCodeChunker> = new Map();

  // Languages supported by this chunker (web development only)
  private supportedLanguages = ["ts", "tsx", "js", "jsx", "css", "vue"];

  constructor() {
    this.logger.info(
      "TreeSitterChunker initialized with AST-based chunking"
    );
  }

  getName(): "tree-sitter" {
    return "tree-sitter";
  }

  supportsLanguage(extension: string): boolean {
    return this.supportedLanguages.includes(extension.toLowerCase());
  }

  /**
   * Get or create an ASTCodeChunker for a specific extension
   */
  private getChunker(extension: string): ASTCodeChunker {
    const ext = extension.toLowerCase();
    if (!this.chunkerCache.has(ext)) {
      this.chunkerCache.set(ext, new ASTCodeChunker(ext));
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

      // Chunk the code using AST-based breakpoint logic
      const chunkMap = await chunker.chunkAsync(content, tokenLimit);

      // Convert to CodeChunk format
      let chunks = this.convertToCodeChunks(
        filePath,
        content,
        chunkMap,
        extension,
        chunker
      );

      // Merge consecutive variable declarations together
      chunks = this.mergeConsecutiveVariables(chunks, content);

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
    extension: string,
    chunker: ASTCodeChunker
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

      // Try to get AST-derived type first, fallback to content detection
      const astType = chunker.getBreakpointType(startLine);
      const chunkType = astType
        ? this.mapAstTypeToChunkType(astType)
        : this.detectChunkType(chunkCode, extension);

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
   * Merge consecutive variable declaration chunks into single chunks
   * Similar to how imports are grouped together
   */
  private mergeConsecutiveVariables(
    chunks: CodeChunk[],
    content: string
  ): CodeChunk[] {
    if (chunks.length <= 1) {
      return chunks;
    }

    const merged: CodeChunk[] = [];
    let i = 0;

    while (i < chunks.length) {
      const currentChunk = chunks[i];

      // Check if this is a variable chunk and if we can merge with next chunks
      if (currentChunk.type === "variable") {
        const variableGroup: CodeChunk[] = [currentChunk];
        let j = i + 1;

        // Collect consecutive variable chunks
        while (j < chunks.length && chunks[j].type === "variable") {
          // Check if chunks are actually consecutive (no gaps)
          const prevChunk = variableGroup[variableGroup.length - 1];
          const nextChunk = chunks[j];

          // Allow small gaps (blank lines, comments) between variables
          const lineGap = nextChunk.startLine - prevChunk.endLine - 1;
          if (lineGap <= 2) {
            variableGroup.push(nextChunk);
            j++;
          } else {
            break;
          }
        }

        // If we found multiple consecutive variables, merge them
        if (variableGroup.length > 1) {
          const firstChunk = variableGroup[0];
          const lastChunk = variableGroup[variableGroup.length - 1];

          // Extract the combined text from the original content
          const lines = content.split("\n");
          const startLine = firstChunk.startLine - 1; // Convert to 0-indexed
          const endLine = lastChunk.endLine - 1; // Convert to 0-indexed
          const combinedText = lines.slice(startLine, endLine + 1).join("\n");

          merged.push({
            id: `${firstChunk.filePath}:${firstChunk.startLine}-${lastChunk.endLine}`,
            filePath: firstChunk.filePath,
            startLine: firstChunk.startLine,
            endLine: lastChunk.endLine,
            text: combinedText.trim(),
            type: "variable",
            language: firstChunk.language,
            timestamp: Date.now(),
            chunkIndexInFile: merged.length,
          });

          i = j; // Skip all merged chunks
        } else {
          // Single variable chunk, keep as is
          merged.push({ ...currentChunk, chunkIndexInFile: merged.length });
          i++;
        }
      } else {
        // Not a variable chunk, keep as is
        merged.push({ ...currentChunk, chunkIndexInFile: merged.length });
        i++;
      }
    }

    this.logger.debug(
      `Merged consecutive variables: ${chunks.length} chunks → ${merged.length} chunks`
    );

    return merged;
  }

  /**
   * Map AST-derived type strings to ChunkType
   */
  private mapAstTypeToChunkType(astType: string): ChunkType {
    const typeMap: Record<string, ChunkType> = {
      "Function": "function",
      "Class": "class",
      "Abstract Class": "class",
      "Interface": "interface",
      "Type Alias": "type",
      "Enum": "type",
      "Import": "import",
      "Export": "export",
      "Variable": "variable",
      "JSX": "jsx",
      "Template": "template", // Vue template
      "Script": "script", // Vue script (should not happen now)
      "Style": "css", // Vue style
      "Rule": "css", // CSS rule
      "Media Query": "css",
      "Keyframes": "css",
    };

    return typeMap[astType] || "block";
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
