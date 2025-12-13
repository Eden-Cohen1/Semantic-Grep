/**
 * Represents a chunk of code extracted from a file
 */
export interface CodeChunk {
  /** Unique identifier: "filepath:startLine-endLine" */
  id: string;

  /** Absolute path to the file */
  filePath: string;

  /** Starting line number (1-indexed) */
  startLine: number;

  /** Ending line number (1-indexed) */
  endLine: number;

  /** Raw code text */
  text: string;

  /** Type of code chunk */
  type: ChunkType;

  /** File extension/language */
  language: string;

  /** Timestamp when chunk was created */
  timestamp: number;

  /** 0-based index of this chunk within the file */
  chunkIndexInFile: number;

  /** Embedding vector (added after embedding generation) */
  vector?: number[];
}

/**
 * Type of code chunk
 */
export type ChunkType =
  | "function"
  | "method"
  | "class"
  | "interface"
  | "type"
  | "namespace"
  | "const"
  | "variable"
  | "import"
  | "export"
  | "jsx"
  | "component"
  | "block"
  | "template"
  | "script"
  | "css"
  | "unknown";

/**
 * Result of chunking a file
 */
export interface ChunkResult {
  chunks: CodeChunk[];
  parseSuccess: boolean;
  parseMethod: "tree-sitter" | "fallback" | "langchain";
  error?: string;
}
