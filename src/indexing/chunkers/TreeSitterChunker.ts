import * as fs from "fs";
import * as path from "path";
import Parser from "web-tree-sitter";
import { Logger } from "../../utils/logger";
import { CodeChunk, ChunkResult, ChunkType } from "../types";
import { IChunker } from "./IChunker";
import { TreeSitterParser } from "./treeSitter/TreeSitterParser";
import { LangChainChunker } from "./LangChainChunker";

/**
 * Chunks code files using Tree-sitter AST parsing
 * Provides accurate semantic boundaries for functions, classes, methods, etc.
 */
export class TreeSitterChunker implements IChunker {
  private logger = new Logger("TreeSitterChunker");
  private parser: TreeSitterParser;
  private langchainFallback: LangChainChunker;
  private queryCache: Map<string, Parser.Query | null> = new Map();

  // Languages supported by this chunker
  private supportedLanguages = ["ts", "tsx", "js", "jsx", "vue", "py"];

  constructor() {
    this.parser = new TreeSitterParser();
    this.langchainFallback = new LangChainChunker();
    this.logger.info("TreeSitterChunker initialized");
  }

  getName(): "tree-sitter" {
    return "tree-sitter";
  }

  supportsLanguage(extension: string): boolean {
    return this.supportedLanguages.includes(extension.toLowerCase());
  }

  /**
   * Chunk a single file using Tree-sitter AST parsing
   */
  async chunkFile(filePath: string): Promise<ChunkResult> {
    const extension = path.extname(filePath).slice(1).toLowerCase();

    // Check if language is supported
    if (!this.supportsLanguage(extension)) {
      this.logger.debug(`Falling back to LangChain for unsupported language: ${extension}`);
      return this.langchainFallback.chunkFile(filePath);
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

      // Parse with Tree-sitter
      const tree = await this.parser.parse(content, extension);

      if (!tree) {
        this.logger.debug(`Tree-sitter parse failed for ${filePath}, falling back to LangChain`);
        return this.langchainFallback.chunkFile(filePath);
      }

      // Check for parse errors
      if (this.parser.hasErrors(tree)) {
        const errors = this.parser.getErrors(tree);
        this.logger.warn(
          `Tree-sitter found ${errors.length} parse errors in ${filePath}, falling back to LangChain`
        );
        return this.langchainFallback.chunkFile(filePath);
      }

      // Load query patterns for this language
      const query = await this.loadQuery(extension);

      if (!query) {
        this.logger.debug(`No query patterns for ${extension}, falling back to LangChain`);
        return this.langchainFallback.chunkFile(filePath);
      }

      // Extract chunks using query patterns
      const chunks = this.extractChunks(filePath, content, tree, query, extension);

      this.logger.debug(`Extracted ${chunks.length} chunks from ${filePath} using Tree-sitter`);

      return {
        chunks,
        parseSuccess: true,
        parseMethod: "tree-sitter",
      };
    } catch (error) {
      this.logger.error(`Tree-sitter chunking failed for ${filePath}:`, error);
      return this.langchainFallback.chunkFile(filePath);
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
      `Chunked ${filePaths.length} files into ${allChunks.length} chunks using Tree-sitter`
    );
    return allChunks;
  }

  /**
   * Load query patterns from .scm file for a given language
   */
  private async loadQuery(extension: string): Promise<Parser.Query | null> {
    // Check cache first
    if (this.queryCache.has(extension)) {
      return this.queryCache.get(extension)!;
    }

    try {
      // Map extension to query file name
      const queryFileName = this.getQueryFileName(extension);
      const queryPath = path.join(
        __dirname,
        "treeSitter",
        "queries",
        `${queryFileName}.scm`
      );

      // Check if query file exists
      if (!fs.existsSync(queryPath)) {
        this.logger.warn(`Query file not found: ${queryPath}`);
        this.queryCache.set(extension, null);
        return null;
      }

      // Read query file
      const querySource = await fs.promises.readFile(queryPath, "utf-8");

      // Get language for creating query
      const { LanguageRegistry } = require("./treeSitter/LanguageRegistry");
      const language = await LanguageRegistry.getLanguage(extension);

      if (!language) {
        this.logger.warn(`Language not available for ${extension}`);
        this.queryCache.set(extension, null);
        return null;
      }

      // Create query
      const query = language.query(querySource);
      this.queryCache.set(extension, query);

      this.logger.debug(`Loaded query patterns for ${extension}`);
      return query;
    } catch (error) {
      this.logger.error(`Failed to load query for ${extension}:`, error);
      this.queryCache.set(extension, null);
      return null;
    }
  }

  /**
   * Map file extension to query file name
   */
  private getQueryFileName(extension: string): string {
    const mapping: { [key: string]: string } = {
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      vue: "vue",
      py: "python",
    };

    return mapping[extension.toLowerCase()] || extension;
  }

  /**
   * Extract code chunks from AST using query patterns
   */
  private extractChunks(
    filePath: string,
    content: string,
    tree: Parser.Tree,
    query: Parser.Query,
    language: string
  ): CodeChunk[] {
    const chunks: CodeChunk[] = [];
    const lines = content.split("\n");

    // Execute query to find all matching nodes
    const matches = query.matches(tree.rootNode);

    for (const match of matches) {
      // Find the main capture (the one with the semantic unit)
      const mainCapture = this.findMainCapture(match);

      if (!mainCapture) {
        continue;
      }

      const node = mainCapture.node;
      const captureType = mainCapture.name;

      // Get node position
      const startLine = node.startPosition.row + 1; // 1-indexed
      const endLine = node.endPosition.row + 1; // 1-indexed

      // Extract text
      const chunkText = node.text;

      // Skip very small chunks (likely noise)
      if (chunkText.trim().length < 10) {
        continue;
      }

      // Extract context (comments, decorators)
      const context = this.extractContext(node, lines, startLine);

      // Combine context with chunk text if available
      const fullText = context ? `${context}\n${chunkText}` : chunkText;

      // Determine chunk type
      const chunkType = this.mapCaptureToChunkType(captureType);

      // Create chunk
      chunks.push(
        this.createChunk(
          filePath,
          startLine,
          endLine,
          fullText.trim(),
          chunkType,
          language
        )
      );
    }

    return chunks;
  }

  /**
   * Find the main capture from a query match
   * Main captures are: @function, @class, @method, @interface, @type, etc.
   */
  private findMainCapture(match: Parser.QueryMatch): Parser.QueryCapture | null {
    // Priority order for captures
    const priority = [
      "function",
      "class",
      "method",
      "interface",
      "type",
      "namespace",
      "const",
      "script",
      "template",
      "style",
    ];

    for (const captureName of priority) {
      const capture = match.captures.find((c) => c.name === captureName);
      if (capture) {
        return capture;
      }
    }

    // Return first capture if no priority match
    return match.captures[0] || null;
  }

  /**
   * Map query capture name to ChunkType
   */
  private mapCaptureToChunkType(captureName: string): ChunkType {
    const mapping: { [key: string]: ChunkType } = {
      function: "function",
      class: "class",
      method: "method",
      interface: "interface",
      type: "type",
      const: "variable",
      namespace: "namespace",
      script: "block",
      template: "block",
      style: "block",
    };

    return mapping[captureName] || "block";
  }

  /**
   * Extract context (comments, decorators) above a code unit
   */
  private extractContext(
    node: Parser.SyntaxNode,
    lines: string[],
    startLine: number
  ): string | null {
    const contextLines: string[] = [];
    let lineIdx = startLine - 2; // Start from line before the node (0-indexed)

    // Look backward for comments and decorators
    while (lineIdx >= 0) {
      const line = lines[lineIdx];
      const trimmed = line.trim();

      // Stop if we hit an empty line after collecting context
      if (contextLines.length > 0 && trimmed === "") {
        break;
      }

      // Check if this is a comment
      if (
        trimmed.startsWith("//") ||
        trimmed.startsWith("/*") ||
        trimmed.startsWith("*") ||
        trimmed.endsWith("*/") ||
        trimmed.startsWith("#") // Python comments
      ) {
        contextLines.unshift(line);
        lineIdx--;
        continue;
      }

      // Check if this is a decorator (Python or TypeScript)
      if (trimmed.startsWith("@")) {
        contextLines.unshift(line);
        lineIdx--;
        continue;
      }

      // Stop if we hit a non-context line
      if (trimmed !== "") {
        break;
      }

      lineIdx--;
    }

    return contextLines.length > 0 ? contextLines.join("\n") : null;
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

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.parser.dispose();
    this.queryCache.clear();
    this.logger.debug("TreeSitterChunker disposed");
  }
}
