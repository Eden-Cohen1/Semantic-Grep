import { ChunkResult, CodeChunk } from "../types";

/**
 * Interface for code chunking implementations
 * Allows pluggable chunker strategies (LangChain, Tree-sitter, etc.)
 */
export interface IChunker {
    /**
     * Chunk a single file
     * @param filePath Absolute path to the file to chunk
     * @returns Promise resolving to ChunkResult with chunks and metadata
     */
    chunkFile(filePath: string): Promise<ChunkResult>;

    /**
     * Chunk multiple files
     * @param filePaths Array of absolute file paths to chunk
     * @returns Promise resolving to array of all CodeChunks
     */
    chunkFiles(filePaths: string[]): Promise<CodeChunk[]>;

    /**
     * Check if this chunker supports a given language/file extension
     * @param extension File extension (without dot, e.g., "ts", "py")
     * @returns true if this chunker can handle the language
     */
    supportsLanguage(extension: string): boolean;

    /**
     * Get the name of this chunker implementation
     * @returns Chunker name for identification and logging
     */
    getName(): "tree-sitter" | "langchain" | "fallback";
}
