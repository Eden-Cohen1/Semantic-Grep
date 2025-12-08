import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { Config } from '../utils/config';
import { CodeChunk, ChunkResult, ChunkType } from './types';

/**
 * Chunks code files into semantic units
 * Uses Tree-sitter when available, falls back to regex-based chunking
 */
export class CodeChunker {
    private logger = new Logger('CodeChunker');
    private chunkSize: number;
    private overlapTokens: number;

    constructor() {
        this.chunkSize = Config.getChunkSize();
        this.overlapTokens = 50; // Overlap between chunks for context
        this.logger.info(`CodeChunker initialized with chunk size: ${this.chunkSize}`);
    }

    /**
     * Chunk a single file
     */
    async chunkFile(filePath: string): Promise<ChunkResult> {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const language = path.extname(filePath).slice(1);

            // Try semantic chunking first (Tree-sitter would go here)
            // For now, use regex-based semantic chunking
            const chunks = this.semanticChunk(filePath, content, language);

            if (chunks.length > 0) {
                return {
                    chunks,
                    parseSuccess: true,
                    parseMethod: 'fallback' // Will be 'tree-sitter' when implemented
                };
            }

            // Fall back to fixed-size chunking
            const fixedChunks = this.fixedSizeChunk(filePath, content, language);
            return {
                chunks: fixedChunks,
                parseSuccess: false,
                parseMethod: 'fallback'
            };

        } catch (error) {
            this.logger.error(`Failed to chunk file: ${filePath}`, error);
            return {
                chunks: [],
                parseSuccess: false,
                parseMethod: 'fallback',
                error: error instanceof Error ? error.message : String(error)
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

        this.logger.info(`Chunked ${filePaths.length} files into ${allChunks.length} chunks`);
        return allChunks;
    }

    /**
     * Semantic chunking using regex patterns
     * Extracts functions, classes, methods, etc.
     */
    private semanticChunk(
        filePath: string,
        content: string,
        language: string
    ): CodeChunk[] {
        const chunks: CodeChunk[] = [];
        const lines = content.split('\n');

        // Determine chunking strategy based on language
        if (['ts', 'tsx', 'js', 'jsx'].includes(language)) {
            chunks.push(...this.chunkJavaScriptLike(filePath, content, lines, language));
        } else if (language === 'py') {
            chunks.push(...this.chunkPython(filePath, content, lines, language));
        } else {
            // Fallback to fixed-size for unsupported languages
            return this.fixedSizeChunk(filePath, content, language);
        }

        return chunks;
    }

    /**
     * Chunk JavaScript/TypeScript code
     */
    private chunkJavaScriptLike(
        filePath: string,
        content: string,
        lines: string[],
        language: string
    ): CodeChunk[] {
        const chunks: CodeChunk[] = [];

        // Patterns for different code structures
        const patterns = {
            // Function declarations: function foo() { ... }
            functionDecl: /^\s*(export\s+)?(async\s+)?function\s+(\w+)/,

            // Arrow functions: const foo = () => { ... }
            arrowFunction: /^\s*(export\s+)?const\s+(\w+)\s*=\s*(\([^)]*\)|[^=]+)\s*=>/,

            // Class declarations: class Foo { ... }
            classDecl: /^\s*(export\s+)?(abstract\s+)?class\s+(\w+)/,

            // Interface/Type: interface Foo { ... } or type Foo = { ... }
            interfaceType: /^\s*(export\s+)?(interface|type)\s+(\w+)/,

            // Methods in classes: methodName() { ... }
            method: /^\s*(public|private|protected|static|async)?\s*(\w+)\s*\([^)]*\)\s*[:{]/
        };

        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            let chunkType: ChunkType | null = null;
            let match: RegExpMatchArray | null = null;

            // Check which pattern matches
            if ((match = line.match(patterns.functionDecl))) {
                chunkType = 'function';
            } else if ((match = line.match(patterns.arrowFunction))) {
                chunkType = 'function';
            } else if ((match = line.match(patterns.classDecl))) {
                chunkType = 'class';
            } else if ((match = line.match(patterns.interfaceType))) {
                chunkType = match[2] === 'interface' ? 'interface' : 'type';
            }

            if (chunkType && match) {
                // Find the end of this block
                const startLine = i + 1; // 1-indexed
                const endLine = this.findBlockEnd(lines, i);

                if (endLine > i) {
                    const chunkText = lines.slice(i, endLine + 1).join('\n');

                    // Only create chunk if it's not too small or too large
                    if (chunkText.length > 20 && chunkText.length < this.chunkSize * 10) {
                        chunks.push(this.createChunk(
                            filePath,
                            startLine,
                            endLine + 1, // 1-indexed
                            chunkText,
                            chunkType,
                            language
                        ));
                    }

                    i = endLine + 1;
                    continue;
                }
            }

            i++;
        }

        return chunks;
    }

    /**
     * Chunk Python code
     */
    private chunkPython(
        filePath: string,
        content: string,
        lines: string[],
        language: string
    ): CodeChunk[] {
        const chunks: CodeChunk[] = [];

        const patterns = {
            // Function: def foo(): ...
            function: /^\s*def\s+(\w+)\s*\(/,

            // Class: class Foo: ...
            class: /^\s*class\s+(\w+)/,
        };

        let i = 0;
        while (i < lines.length) {
            const line = lines[i];
            let chunkType: ChunkType | null = null;

            if (patterns.function.test(line)) {
                chunkType = 'function';
            } else if (patterns.class.test(line)) {
                chunkType = 'class';
            }

            if (chunkType) {
                const startLine = i + 1;
                const endLine = this.findPythonBlockEnd(lines, i);

                if (endLine > i) {
                    const chunkText = lines.slice(i, endLine + 1).join('\n');

                    if (chunkText.length > 20 && chunkText.length < this.chunkSize * 10) {
                        chunks.push(this.createChunk(
                            filePath,
                            startLine,
                            endLine + 1,
                            chunkText,
                            chunkType,
                            language
                        ));
                    }

                    i = endLine + 1;
                    continue;
                }
            }

            i++;
        }

        return chunks;
    }

    /**
     * Find the end of a code block (for JS/TS using braces)
     */
    private findBlockEnd(lines: string[], startIdx: number): number {
        let braceCount = 0;
        let inBlock = false;

        for (let i = startIdx; i < lines.length; i++) {
            const line = lines[i];

            for (const char of line) {
                if (char === '{') {
                    braceCount++;
                    inBlock = true;
                } else if (char === '}') {
                    braceCount--;
                    if (inBlock && braceCount === 0) {
                        return i;
                    }
                }
            }
        }

        return startIdx;
    }

    /**
     * Find the end of a Python block (using indentation)
     */
    private findPythonBlockEnd(lines: string[], startIdx: number): number {
        if (startIdx >= lines.length) return startIdx;

        const startLine = lines[startIdx];
        const startIndent = startLine.search(/\S/);

        for (let i = startIdx + 1; i < lines.length; i++) {
            const line = lines[i];

            // Empty lines don't break the block
            if (line.trim() === '') continue;

            const indent = line.search(/\S/);

            // If we find a line at same or less indentation, block ends
            if (indent <= startIndent) {
                return i - 1;
            }
        }

        return lines.length - 1;
    }

    /**
     * Fixed-size chunking as fallback
     * Splits content into chunks of approximately chunkSize tokens
     */
    private fixedSizeChunk(
        filePath: string,
        content: string,
        language: string
    ): CodeChunk[] {
        const chunks: CodeChunk[] = [];
        const lines = content.split('\n');

        let currentChunk: string[] = [];
        let currentSize = 0;
        let chunkStartLine = 1;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineSize = line.length;

            if (currentSize + lineSize > this.chunkSize && currentChunk.length > 0) {
                // Create chunk
                chunks.push(this.createChunk(
                    filePath,
                    chunkStartLine,
                    i, // End at previous line
                    currentChunk.join('\n'),
                    'block',
                    language
                ));

                // Start new chunk with overlap
                const overlapLines = Math.min(this.overlapTokens / 50, currentChunk.length);
                currentChunk = currentChunk.slice(-overlapLines);
                currentSize = currentChunk.reduce((sum, l) => sum + l.length, 0);
                chunkStartLine = i - overlapLines + 1;
            }

            currentChunk.push(line);
            currentSize += lineSize;
        }

        // Add final chunk
        if (currentChunk.length > 0) {
            chunks.push(this.createChunk(
                filePath,
                chunkStartLine,
                lines.length,
                currentChunk.join('\n'),
                'block',
                language
            ));
        }

        return chunks;
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
            timestamp: Date.now()
        };
    }
}
