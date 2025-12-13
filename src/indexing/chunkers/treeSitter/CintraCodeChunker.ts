/**
 * CintraCodeChunker - Token-aware breakpoint-based code chunker
 * Ported from CintraAI/code-chunker with enhancements:
 * - Max chunk size limit with smart splitting
 * - Min chunk size with merging
 * - Overlap between adjacent chunks
 */

import { Logger } from "../../../utils/logger";
import { CintraCodeParser } from "./CintraCodeParser";

// Configuration constants
const MAX_LINES = 300; // Maximum lines per chunk - split larger chunks
const MIN_LINES = 15; // Minimum lines - merge smaller chunks
const OVERLAP_LINES = 10; // Lines of overlap between adjacent chunks
const ENABLE_OVERLAP = true; // Toggle overlap feature

/**
 * Represents a code chunk with metadata
 */
export interface CintraChunk {
  chunkNumber: number;
  code: string;
  startLine: number; // 0-indexed
  endLine: number; // 0-indexed
}

/**
 * Abstract base chunker class
 */
export abstract class Chunker {
  protected encodingName: string;

  constructor(encodingName: string = "gpt-4") {
    this.encodingName = encodingName;
  }

  abstract chunk(content: string, tokenLimit: number): Map<number, string>;
  abstract getChunk(
    chunkedContent: Map<number, string>,
    chunkNumber: number
  ): string | undefined;

  static printChunks(chunks: Map<number, string>): void {
    for (const [chunkNumber, chunkCode] of chunks) {
      console.log(`Chunk ${chunkNumber}:`);
      console.log("=".repeat(40));
      console.log(chunkCode);
      console.log("=".repeat(40));
    }
  }

  static consolidateChunksIntoFile(chunks: Map<number, string>): string {
    return Array.from(chunks.values()).join("\n");
  }

  static countLines(consolidatedChunks: string): number {
    return consolidatedChunks.split("\n").length;
  }
}

/**
 * CintraCodeChunker - Enhanced chunking implementation
 */
export class CintraCodeChunker extends Chunker {
  private logger = new Logger("CintraCodeChunker");
  private fileExtension: string;
  private parser: CintraCodeParser;

  constructor(fileExtension: string, encodingName: string = "gpt-4") {
    super(encodingName);
    this.fileExtension = fileExtension.toLowerCase().replace(".", "");
    this.parser = new CintraCodeParser();
    this.logger.debug(
      `CintraCodeChunker initialized for: ${this.fileExtension}`
    );
  }

  /**
   * Main async chunking method
   */
  async chunkAsync(
    code: string,
    tokenLimit: number
  ): Promise<Map<number, string>> {
    const lines = code.split("\n");

    // Get breakpoints from AST
    let breakpoints = await this.parser.getLinesForPointsOfInterest(
      code,
      this.fileExtension
    );
    let comments = await this.parser.getLinesForComments(
      code,
      this.fileExtension
    );

    breakpoints = [...breakpoints].sort((a, b) => a - b);
    comments = [...comments].sort((a, b) => a - b);

    const commentSet = new Set(comments);

    // Adjust breakpoints to include preceding comments
    const adjustedBreakpoints: number[] = [];
    for (const bp of breakpoints) {
      let currentLine = bp - 1;
      let highestCommentLine: number | null = null;

      while (currentLine >= 0 && commentSet.has(currentLine)) {
        highestCommentLine = currentLine;
        currentLine--;
      }

      adjustedBreakpoints.push(
        highestCommentLine !== null ? highestCommentLine : bp
      );
    }

    const uniqueBreakpoints = [...new Set(adjustedBreakpoints)].sort(
      (a, b) => a - b
    );
    this.logger.debug(`Found ${uniqueBreakpoints.length} breakpoints`);

    // Step 1: Create initial chunks at breakpoints
    let rawChunks = this.createChunksAtBreakpoints(lines, uniqueBreakpoints);

    // Step 2: Split large chunks (> MAX_LINES)
    rawChunks = this.splitLargeChunks(rawChunks);

    // Step 3: Merge small chunks (< MIN_LINES)
    // rawChunks = this.mergeSmallChunks(rawChunks);

    // Step 4: Disable overlap for now to fix line counting
    // rawChunks = this.addOverlap(rawChunks);

    // Convert to Map
    const chunks = new Map<number, string>();
    rawChunks.forEach((chunk, idx) => {
      if (chunk.trim()) {
        chunks.set(idx + 1, chunk);
      }
    });

    this.logger.debug(`Created ${chunks.size} final chunks`);
    return chunks;
  }

  /**
   * Create chunks at breakpoint boundaries
   */
  private createChunksAtBreakpoints(
    lines: string[],
    breakpoints: number[]
  ): string[] {
    const chunks: string[] = [];

    if (breakpoints.length === 0) {
      // No breakpoints - return entire file as one chunk
      chunks.push(lines.join("\n"));
      return chunks;
    }

    // Add implicit breakpoint at start if not present
    if (breakpoints[0] !== 0) {
      breakpoints = [0, ...breakpoints];
    }

    // Create chunks between breakpoints
    for (let i = 0; i < breakpoints.length; i++) {
      const start = breakpoints[i];
      const end =
        i < breakpoints.length - 1 ? breakpoints[i + 1] : lines.length;

      const chunkLines = lines.slice(start, end);
      const chunkText = chunkLines.join("\n");

      if (chunkText.trim()) {
        chunks.push(chunkText);
      }
    }

    return chunks;
  }

  /**
   * Split chunks that exceed MAX_LINES
   */
  private splitLargeChunks(chunks: string[]): string[] {
    const result: string[] = [];

    for (const chunk of chunks) {
      const chunkLines = chunk.split("\n");

      if (chunkLines.length <= MAX_LINES) {
        result.push(chunk);
        continue;
      }

      // Need to split this chunk
      this.logger.debug(`Splitting large chunk of ${chunkLines.length} lines`);
      const subChunks = this.smartSplit(chunkLines, MAX_LINES);
      result.push(...subChunks);
    }

    return result;
  }

  /**
   * Smart split a large chunk at logical boundaries
   */
  private smartSplit(lines: string[], maxLines: number): string[] {
    const chunks: string[] = [];
    let currentStart = 0;

    while (currentStart < lines.length) {
      let currentEnd = Math.min(currentStart + maxLines, lines.length);

      // If we're not at the end, try to find a good split point
      if (currentEnd < lines.length) {
        const splitPoint = this.findSplitPoint(lines, currentStart, currentEnd);
        currentEnd = splitPoint;
      }

      const chunkText = lines.slice(currentStart, currentEnd).join("\n");
      if (chunkText.trim()) {
        chunks.push(chunkText);
      }

      currentStart = currentEnd;
    }

    return chunks;
  }

  /**
   * Find a good split point within a range
   * Prefers: blank lines, closing braces, end of statements
   */
  private findSplitPoint(
    lines: string[],
    start: number,
    idealEnd: number
  ): number {
    // Search backwards from idealEnd for a good split point
    const searchStart = Math.max(start + MIN_LINES, idealEnd - 50);

    for (let i = idealEnd - 1; i >= searchStart; i--) {
      const line = lines[i].trim();

      // Blank line is a great split point
      if (line === "") {
        return i + 1;
      }

      // Closing brace at statement level
      if (line === "}" || line === "};") {
        return i + 1;
      }

      // End of a statement (semicolon at end)
      if (line.endsWith(";") && !line.includes("for") && !line.includes("if")) {
        return i + 1;
      }
    }

    // No good split point found, use idealEnd
    return idealEnd;
  }

  /**
   * Merge chunks smaller than MIN_LINES with adjacent chunks
   */
  private mergeSmallChunks(chunks: string[]): string[] {
    if (chunks.length <= 1) {
      return chunks;
    }

    const result: string[] = [];
    let i = 0;

    while (i < chunks.length) {
      const currentLines = chunks[i].split("\n").length;

      if (currentLines < MIN_LINES && i < chunks.length - 1) {
        // Merge with next chunk
        const merged = chunks[i] + "\n" + chunks[i + 1];
        result.push(merged);
        i += 2;
      } else if (currentLines < MIN_LINES && result.length > 0) {
        // Merge with previous chunk
        const lastIdx = result.length - 1;
        result[lastIdx] = result[lastIdx] + "\n" + chunks[i];
        i++;
      } else {
        result.push(chunks[i]);
        i++;
      }
    }

    return result;
  }

  /**
   * Add overlap between adjacent chunks (raw lines, no markers)
   */
  private addOverlap(chunks: string[]): string[] {
    if (chunks.length <= 1 || !ENABLE_OVERLAP) {
      return chunks;
    }

    const result: string[] = [];

    for (let i = 0; i < chunks.length; i++) {
      if (i > 0 && chunks[i - 1]) {
        // Add overlap from previous chunk (raw lines only)
        const prevLines = chunks[i - 1].split("\n");
        const overlapLines = prevLines.slice(-OVERLAP_LINES);
        const overlapText = overlapLines.join("\n");

        // Prepend overlap without markers
        result.push(`${overlapText}\n${chunks[i]}`);
      } else {
        result.push(chunks[i]);
      }
    }

    return result;
  }

  /**
   * Synchronous chunk method (fallback)
   */
  chunk(content: string, tokenLimit: number): Map<number, string> {
    this.logger.warn("Using sync chunk - prefer chunkAsync");
    const lines = content.split("\n");
    const chunks = new Map<number, string>();

    // Simple fallback: split by MAX_LINES
    let chunkNum = 1;
    for (let i = 0; i < lines.length; i += MAX_LINES) {
      const chunkLines = lines.slice(i, Math.min(i + MAX_LINES, lines.length));
      const chunkText = chunkLines.join("\n");
      if (chunkText.trim()) {
        chunks.set(chunkNum++, chunkText);
      }
    }

    return chunks;
  }

  getChunk(
    chunkedCodebase: Map<number, string>,
    chunkNumber: number
  ): string | undefined {
    return chunkedCodebase.get(chunkNumber);
  }

  /**
   * Get chunk with line information
   */
  async chunkWithMetadata(
    code: string,
    tokenLimit: number
  ): Promise<CintraChunk[]> {
    const chunks = await this.chunkAsync(code, tokenLimit);
    const result: CintraChunk[] = [];

    let currentLine = 0;
    for (const [chunkNumber, chunkCode] of chunks) {
      const chunkLines = chunkCode.split("\n").length;
      result.push({
        chunkNumber,
        code: chunkCode,
        startLine: currentLine,
        endLine: currentLine + chunkLines - 1,
      });
      currentLine += chunkLines;
    }

    return result;
  }

  supportsExtension(): boolean {
    return this.parser.supportsExtension(this.fileExtension);
  }

  dispose(): void {
    this.parser.dispose();
    this.logger.debug("CintraCodeChunker disposed");
  }
}
