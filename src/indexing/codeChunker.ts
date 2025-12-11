import * as fs from "fs";
import * as path from "path";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Logger } from "../utils/logger";
import { Config } from "../utils/config";
import { CodeChunk, ChunkResult, ChunkType } from "./types";

/**
 * Chunks code files into semantic units using LangChain's RecursiveCharacterTextSplitter
 * Supports TypeScript, JavaScript, JSX, Python, and Vue files
 */
export class CodeChunker {
  private logger = new Logger("CodeChunker");
  private chunkSize: number;
  private chunkOverlap: number;

  constructor() {
    this.chunkSize = Config.getChunkSize();
    this.chunkOverlap = Math.floor(this.chunkSize * 0.15); // 15% overlap for context
    this.logger.info(
      `CodeChunker initialized with chunk size: ${this.chunkSize}, overlap: ${this.chunkOverlap}`
    );
  }

  /**
   * Chunk a single file
   */
  async chunkFile(filePath: string): Promise<ChunkResult> {
    try {
      const content = await fs.promises.readFile(filePath, "utf-8");
      const extension = path.extname(filePath).slice(1);

      // Handle empty files
      if (!content || content.trim().length === 0) {
        return {
          chunks: [],
          parseSuccess: true,
          parseMethod: "langchain",
        };
      }

      // Map file extension to LangChain language
      const language = this.mapExtensionToLanguage(extension);

      if (!language) {
        // Unsupported language, use generic text splitting
        return this.fallbackChunk(filePath, content, extension);
      }

      // Use LangChain's RecursiveCharacterTextSplitter
      const splitter = RecursiveCharacterTextSplitter.fromLanguage(
        language as any,
        {
          chunkSize: this.chunkSize,
          chunkOverlap: this.chunkOverlap,
        }
      );

      const texts = await splitter.splitText(content);

      this.logger.debug(`LangChain created ${texts.length} text chunks for ${filePath}`);

      // Convert LangChain text chunks to our CodeChunk format
      const chunks = this.convertTextsToChunks(
        filePath,
        content,
        texts,
        extension
      );

      this.logger.debug(`Converted to ${chunks.length} chunks for ${filePath}`);

      return {
        chunks,
        parseSuccess: true,
        parseMethod: "langchain",
      };
    } catch (error) {
      this.logger.error(`Failed to chunk file: ${filePath}`, error);
      return {
        chunks: [],
        parseSuccess: false,
        parseMethod: "langchain",
        error: error instanceof Error ? error.message : String(error),
      };
    }
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
      `Chunked ${filePaths.length} files into ${allChunks.length} chunks`
    );
    return allChunks;
  }

  /**
   * Map file extension to LangChain supported language
   */
  private mapExtensionToLanguage(extension: string): string | null {
    const mapping: { [key: string]: string } = {
      ts: "js", // TypeScript -> use JS splitter
      tsx: "js", // TSX -> use JS splitter
      js: "js", // JavaScript
      jsx: "js", // JSX
      vue: "js", // Vue (for script sections)
      py: "python", // Python
    };

    return mapping[extension.toLowerCase()] || null;
  }

  /**
   * Convert LangChain text chunks to our CodeChunk format
   */
  private convertTextsToChunks(
    filePath: string,
    fullContent: string,
    texts: string[],
    language: string
  ): CodeChunk[] {
    const chunks: CodeChunk[] = [];

    for (const chunkText of texts) {
      // Calculate line numbers by finding the chunk position in the original content
      const { startLine, endLine } = this.calculateLineNumbers(
        fullContent,
        chunkText
      );

      // Detect chunk type based on content
      const type = this.detectChunkType(chunkText, language);

      chunks.push(
        this.createChunk(
          filePath,
          startLine,
          endLine,
          chunkText,
          type,
          language
        )
      );
    }

    return chunks;
  }

  /**
   * Calculate line numbers for a chunk within the full content
   */
  private calculateLineNumbers(
    fullContent: string,
    chunkText: string
  ): { startLine: number; endLine: number } {
    // Find the position of the chunk in the full content
    const chunkIndex = fullContent.indexOf(chunkText);

    if (chunkIndex === -1) {
      // Chunk not found (shouldn't happen), return defaults
      return { startLine: 1, endLine: 1 };
    }

    // Count newlines before the chunk to get start line
    const beforeChunk = fullContent.substring(0, chunkIndex);
    const startLine = (beforeChunk.match(/\n/g) || []).length + 1;

    // Count newlines in the chunk to get end line
    const linesInChunk = (chunkText.match(/\n/g) || []).length;
    const endLine = startLine + linesInChunk;

    return { startLine, endLine };
  }

  /**
   * Detect chunk type based on content patterns
   */
  private detectChunkType(content: string, language: string): ChunkType {
    const trimmed = content.trim();
    const firstLine = trimmed.split("\n")[0];

    // TypeScript/JavaScript patterns
    if (["ts", "tsx", "js", "jsx", "vue"].includes(language)) {
      if (
        /^\s*(export\s+)?(async\s+)?function\s+\w+/.test(firstLine) ||
        /^\s*(export\s+)?const\s+\w+\s*=\s*(\([^)]*\)|[^=]+)\s*=>/.test(
          firstLine
        )
      ) {
        return "function";
      }
      if (/^\s*(export\s+)?(abstract\s+)?class\s+\w+/.test(firstLine)) {
        return "class";
      }
      if (/^\s*(export\s+)?interface\s+\w+/.test(firstLine)) {
        return "interface";
      }
      if (/^\s*(export\s+)?type\s+\w+/.test(firstLine)) {
        return "type";
      }
      if (
        /^\s*(public|private|protected|static|async)?\s*\w+\s*\([^)]*\)\s*[:{]/.test(
          firstLine
        )
      ) {
        return "method";
      }
    }

    // Python patterns
    if (language === "py") {
      if (/^\s*def\s+\w+\s*\(/.test(firstLine)) {
        return "function";
      }
      if (/^\s*class\s+\w+/.test(firstLine)) {
        return "class";
      }
    }

    return "block";
  }

  /**
   * Fallback chunking for unsupported languages
   */
  private fallbackChunk(
    filePath: string,
    content: string,
    language: string
  ): ChunkResult {
    const chunks: CodeChunk[] = [];
    const lines = content.split("\n");

    let currentChunk: string[] = [];
    let currentSize = 0;
    let chunkStartLine = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineSize = line.length;

      if (currentSize + lineSize > this.chunkSize && currentChunk.length > 0) {
        // Create chunk
        chunks.push(
          this.createChunk(
            filePath,
            chunkStartLine,
            i, // End at previous line
            currentChunk.join("\n"),
            "block",
            language
          )
        );

        // Start new chunk with overlap
        const overlapLines = Math.floor(this.chunkOverlap / 50);
        currentChunk = currentChunk.slice(-overlapLines);
        currentSize = currentChunk.reduce((sum, l) => sum + l.length, 0);
        chunkStartLine = i - overlapLines + 1;
      }

      currentChunk.push(line);
      currentSize += lineSize;
    }

    // Add final chunk
    if (currentChunk.length > 0) {
      chunks.push(
        this.createChunk(
          filePath,
          chunkStartLine,
          lines.length,
          currentChunk.join("\n"),
          "block",
          language
        )
      );
    }

    return {
      chunks,
      parseSuccess: false,
      parseMethod: "fallback",
    };
  }

  /**
   * Create a CodeChunk object
   */
  private createChunk(
    filePath: string,
    startLine: number,
    endLine: number,
    text: string,
    type: ChunkType,
    language: string
  ): CodeChunk {
    return {
      id: `${filePath}:${startLine}-${endLine}`,
      filePath,
      startLine,
      endLine,
      text: text.trim(),
      type,
      language,
      timestamp: Date.now(),
    };
  }
}
