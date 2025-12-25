# AST Code Chunker - Deep Dive Architecture

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Complete Data Flow](#complete-data-flow)
4. [Key Strategies & Design Decisions](#key-strategies--design-decisions)
5. [Pros & Cons](#pros--cons)
6. [Implementation Details](#implementation-details)
7. [Language Support](#language-support)
8. [Performance Considerations](#performance-considerations)

---

## Overview

The AST Code Chunker is a sophisticated code splitting system that breaks source code into semantically meaningful chunks for embedding and search. Unlike simple line-based or token-count splitting, this chunker uses **Abstract Syntax Tree (AST) parsing** to identify logical breakpoints in code (functions, classes, etc.) and creates chunks that respect the code's structure.

**Key Principle**: Split at semantic boundaries, not arbitrary line numbers.

### What Problem Does It Solve?

When embedding code for semantic search:
- **Problem 1**: Splitting mid-function loses context
- **Problem 2**: Too-large chunks exceed token limits
- **Problem 3**: Missing comments separates documentation from code

**Solution**: AST-based breakpoint detection with smart splitting.

---

## Architecture

### 4-Layer Design

```
┌─────────────────────────────────────────────────────────────┐
│                    TreeSitterChunker                        │
│  (Implements IChunker - Main Entry Point)                   │
│  - Manages ASTCodeChunker instances (one per language)      │
│  - Converts internal chunks → CodeChunk format              │
│  - Post-processes (merges consecutive variables)            │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                   ASTCodeChunker                            │
│  (Core Chunking Logic)                                      │
│  - Creates chunks at breakpoints                            │
│  - Splits large chunks (>300 lines)                         │
│  - Token-aware splitting                                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                   ASTCodeParser                             │
│  (AST Parsing & Breakpoint Detection)                       │
│  - Parses code with Tree-sitter                             │
│  - Identifies points of interest (functions, classes, etc.) │
│  - Attaches comments to following code                      │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                 LanguageRegistry                            │
│  (WASM Grammar Management)                                  │
│  - Lazy-loads Tree-sitter WASM parsers                      │
│  - Maps file extensions → grammar files                     │
│  - Caches loaded parsers                                    │
└─────────────────────────────────────────────────────────────┘
```

### File Structure

```
src/indexing/chunkers/
├── IChunker.ts                    # Interface contract
├── ChunkerFactory.ts              # Singleton factory
├── TreeSitterChunker.ts           # Main implementation
└── treeSitter/
    ├── ASTCodeChunker.ts          # Core chunking logic
    ├── ASTCodeParser.ts           # AST parsing
    ├── LanguageRegistry.ts        # WASM loader
    └── tokenCounter.ts            # Token estimation
```

---

## Complete Data Flow

### Step-by-Step: From File to Chunks

```
1. USER ACTION
   └─> Semantic Grep: Index Workspace

2. INDEXER (src/indexing/indexer.ts)
   └─> For each file:
       ├─> ChunkerFactory.getChunker(filePath)
       └─> chunker.chunkFile(filePath)

3. CHUNKER FACTORY (ChunkerFactory.ts)
   └─> Returns singleton TreeSitterChunker instance

4. TREE-SITTER CHUNKER (TreeSitterChunker.ts:52-132)
   ├─> Read file content
   ├─> Get file extension (.ts, .js, .vue, etc.)
   ├─> Call getChunker(extension) to get/create ASTCodeChunker
   └─> Call chunker.chunkAsync(content, tokenLimit)

5. AST CODE CHUNKER (ASTCodeChunker.ts:90-370)
   ├─> Call parser.getBreakpointsWithTypes(code, extension)
   ├─> Receive Map<lineNumber, astType> of breakpoints
   ├─> Call createChunksAtBreakpoints(lines, breakpoints)
   ├─> Call splitLargeChunks() for chunks >300 lines
   └─> Return Map<chunkNumber, chunkCode>

6. AST CODE PARSER (ASTCodeParser.ts:176-795)
   ├─> Call LanguageRegistry.getParser(extension)
   ├─> Parse code → AST tree
   ├─> extractPointsOfInterest() - Find functions, classes, etc.
   │   ├─> Depth 0: All declarations (top-level)
   │   └─> Depth 1-3: Nested functions only
   ├─> getLinesForComments() - Find comment blocks
   ├─> Adjust breakpoints to include preceding comments
   └─> Return Map<lineNumber, astType>

7. LANGUAGE REGISTRY (LanguageRegistry.ts:20-155)
   ├─> Check cache for loaded parser
   ├─> If not cached:
   │   ├─> Load WASM grammar file
   │   ├─> Initialize Tree-sitter parser
   │   └─> Cache parser
   └─> Return Parser instance

8. BACK TO TREE-SITTER CHUNKER (TreeSitterChunker.ts:103-112)
   ├─> convertToCodeChunks() - Map to CodeChunk format
   │   ├─> For each chunk:
   │   │   ├─> Find line numbers in file
   │   │   ├─> Get AST type from chunker
   │   │   └─> Create CodeChunk object
   │   └─> Return CodeChunk[]
   ├─> mergeConsecutiveVariables() - Group variable declarations
   └─> Return ChunkResult

9. INDEXER
   ├─> Receives CodeChunk[]
   ├─> Sends to EmbeddingGenerator
   └─> Stores in VectorStore (LanceDB)
```

### Example: Chunking a TypeScript File

**Input File** (example.ts):
```typescript
import { Logger } from "./logger";

/**
 * Calculator class
 */
export class Calculator {
    add(a: number, b: number): number {
        return a + b;
    }
}

// Helper function
export function formatResult(n: number): string {
    return `Result: ${n}`;
}
```

**Breakpoints Detected** (0-indexed lines):
- Line 0: Import statement
- Line 2: Comment (attached to line 5)
- Line 5: Class declaration
- Line 11: Comment (attached to line 12)
- Line 12: Function declaration

**Chunks Created**:
1. **Chunk 0** (lines 0-10): Import + Calculator class
2. **Chunk 1** (lines 11-14): formatResult function

**CodeChunk Objects**:
```typescript
{
  id: "example.ts:1-11",
  filePath: "/path/to/example.ts",
  startLine: 1,
  endLine: 11,
  text: "import { Logger } from \"./logger\";\n\n/**\n * Calculator class\n */...",
  type: "class",
  language: "ts",
  chunkIndexInFile: 0,
  timestamp: 1234567890
}
```

---

## Key Strategies & Design Decisions

### 1. Breakpoint-Based Chunking

**Strategy**: Identify semantic boundaries and split there.

**How It Works**:
- Parse code → AST
- Extract "points of interest" (functions, classes, imports, etc.)
- Use these as potential split points
- Never split mid-function

**Why**: Preserves code context and semantic meaning.

### 2. Depth-Aware Extraction

**Different rules for different depths**:

```
Depth 0 (Top-Level):
  - Include: EVERYTHING (functions, classes, imports, exports, variables, types, etc.)
  - Reason: These are primary organizational units

Depth 1-3 (Nested):
  - Include: ONLY functions and method declarations
  - Reason: Nested functions are often callbacks or helpers (important for context)
  - Exclude: Variables, statements (would create too many tiny chunks)

Depth 4+:
  - Include: NOTHING
  - Reason: Too deeply nested, would fragment code excessively
```

**Code Reference**: [ASTCodeParser.ts:489-576](src/indexing/chunkers/treeSitter/ASTCodeParser.ts#L489-L576)

### 3. Comment Attachment

**Strategy**: Comments belong with the code they describe.

**Implementation**:
```typescript
// Find all comment lines
const commentLines = getLinesForComments(code, extension);

// For each breakpoint:
//   - Look backwards for comments
//   - If found, adjust breakpoint to include them
```

**Example**:
```typescript
// Original breakpoint: line 5
5: export class Calculator {

// Comments found: lines 2-4
2: /**
3:  * Calculator class
4:  */

// Adjusted breakpoint: line 2 (includes comments)
```

**Why**: Preserves documentation context for embeddings.

### 4. Smart Splitting for Large Chunks

**Problem**: Some code blocks exceed token limits (e.g., 500-line class).

**Solution**: Split large chunks intelligently.

```typescript
MAX_LINES = 300

if (chunk.lines > MAX_LINES) {
    // Find sub-breakpoints (nested functions)
    // Split at those boundaries
    // Fallback: Split at MAX_LINES if no sub-breakpoints
}
```

**Code Reference**: [ASTCodeChunker.ts:242-337](src/indexing/chunkers/treeSitter/ASTCodeChunker.ts#L242-L337)

### 5. Token-Aware Processing

**Every chunk is measured**:
```typescript
const tokens = countTokens(chunkCode);
// If tokens > tokenLimit, try to split further
```

**Token Counting**: Uses GPT-4 tokenizer approximation (~3.5 chars/token).

**Why**: Embedding models have token limits (e.g., 512, 8192).

### 6. Consecutive Variable Merging

**Problem**: Variables declared separately create tiny chunks.

```typescript
const API_URL = "...";
const API_KEY = "...";
const TIMEOUT = 5000;
```

**Solution**: Merge consecutive variable declarations.

**Code Reference**: [TreeSitterChunker.ts:258-292](src/indexing/chunkers/TreeSitterChunker.ts#L258-L292)

### 7. Type Classification Priority

When determining chunk type, use this priority:

```typescript
jsx > function > class > interface > type > export > import > variable > block
```

**Reason**: If a chunk contains a function AND variables, it's a "function" chunk.

**Code Reference**: [TreeSitterChunker.ts:202-226](src/indexing/chunkers/TreeSitterChunker.ts#L202-L226)

### 8. Vue SFC Special Handling

**Challenge**: Vue Single File Components have `<script>`, `<template>`, `<style>`.

**Solution**:
- Detect `<script lang="ts">` attribute
- Extract script content
- Parse as TypeScript/JavaScript
- Adjust line numbers back to original file

**Code Reference**: [ASTCodeParser.ts:652-745](src/indexing/chunkers/treeSitter/ASTCodeParser.ts#L652-L745)

### 9. Caching Strategy

**Three levels of caching**:

1. **TreeSitterChunker**: Caches ASTCodeChunker instances per extension
   ```typescript
   private chunkerCache: Map<string, ASTCodeChunker> = new Map();
   ```

2. **LanguageRegistry**: Caches loaded Tree-sitter parsers
   ```typescript
   private static parsers: Map<string, Parser> = new Map();
   ```

3. **ChunkerFactory**: Singleton pattern for TreeSitterChunker
   ```typescript
   private static instance: TreeSitterChunker | null = null;
   ```

**Why**: Loading WASM grammars is expensive (~100ms), caching reduces overhead.

---

## Pros & Cons

### Pros ✅

1. **Semantic Accuracy**
   - Chunks respect code structure
   - Never splits functions mid-way
   - Preserves logical units

2. **Context Preservation**
   - Comments attached to code
   - Related code stays together
   - Better embedding quality

3. **Language-Aware**
   - Understands TypeScript, JavaScript, CSS, Vue
   - Can handle language-specific constructs (JSX, decorators, etc.)

4. **Token-Aware**
   - Respects embedding model limits
   - Splits large blocks intelligently
   - Optimizes chunk sizes

5. **Extensible**
   - Easy to add new languages (just add WASM grammar)
   - Clean separation of concerns
   - Well-tested architecture

6. **Fast**
   - Tree-sitter is fast (C library)
   - WASM overhead minimal with caching
   - Processes large files quickly

### Cons ❌

1. **Complexity**
   - More complex than line-based splitting
   - Requires understanding AST concepts
   - More code to maintain

2. **WASM Dependencies**
   - Requires Tree-sitter WASM files (~200KB each)
   - Must bundle with extension
   - Increases package size

3. **Language-Specific**
   - Only works for supported languages
   - Fallback to simple splitting for unsupported files
   - Grammar updates needed for new language features

4. **Parse Errors**
   - Syntax errors in code can break parsing
   - Malformed files may not chunk correctly
   - Requires error handling

5. **Chunk Size Variability**
   - Chunks vary widely in size (10 lines to 300 lines)
   - May not fill embedding context efficiently
   - Some chunks may be too small or too large

---

## Implementation Details

### Configuration Constants

```typescript
// ASTCodeChunker.ts
const MAX_LINES = 300;        // Maximum lines per chunk
const MIN_LINES = 15;         // Minimum lines per chunk (disabled)
const OVERLAP_LINES = 10;     // Lines of overlap (disabled)
const ENABLE_OVERLAP = true;  // Toggle overlap feature (disabled)
```

**Why disabled?**
- Overlap: Created duplicate content, reduced search precision
- Merging small chunks: Natural code structure preferred

### Node Types of Interest

**TypeScript/TSX** (most comprehensive):
```typescript
{
  import_statement, export_statement,
  class_declaration, abstract_class_declaration,
  function_declaration, function_signature,
  interface_declaration, type_alias_declaration,
  enum_declaration, module, ambient_declaration,
  lexical_declaration, variable_declaration,
  jsx_element, jsx_self_closing_element, jsx_fragment
}
```

**JavaScript/JSX** (subset):
```typescript
{
  import_statement, export_statement,
  class_declaration, function_declaration,
  lexical_declaration, variable_declaration,
  jsx_element, jsx_self_closing_element, jsx_fragment
}
```

**CSS**:
```typescript
{
  rule_set, media_statement, keyframes_statement
}
```

**Vue**:
```typescript
{
  script_element, template_element, style_element
}
```

**Code Reference**: [ASTCodeParser.ts:38-103](src/indexing/chunkers/treeSitter/ASTCodeParser.ts#L38-L103)

### JSX Special Handling

**Challenge**: JSX elements can be tiny (`<div />`) or huge (entire component).

**Solution**: Only treat JSX as breakpoint if >3 lines.

```typescript
if (node.type.includes("jsx") && nodeLineSpan > 3) {
    // Treat as breakpoint
}
```

**Code Reference**: [ASTCodeParser.ts:543-547](src/indexing/chunkers/treeSitter/ASTCodeParser.ts#L543-L547)

### Consecutive Import Grouping

**Strategy**: Group consecutive imports together.

```typescript
import { A } from "./a";
import { B } from "./b";
import { C } from "./c";
// These become ONE chunk
```

**Why**: Imports are context, not searchable code.

**Code Reference**: [ASTCodeParser.ts:593-637](src/indexing/chunkers/treeSitter/ASTCodeParser.ts#L593-L637)

### Error Handling

**Three levels of fallback**:

1. **AST Parsing Fails**: Log error, return empty breakpoints
2. **Language Not Supported**: Fall back to simple splitting
3. **File Read Fails**: Return error in ChunkResult

```typescript
try {
    const result = await chunker.chunkFile(filePath);
    if (!result.parseSuccess) {
        // Handle gracefully
    }
} catch (error) {
    // Fallback chunking
}
```

---

## Language Support

### Currently Supported (6 languages)

| Language   | Extension | Grammar       | Notes                          |
|------------|-----------|---------------|--------------------------------|
| TypeScript | .ts       | typescript    | Full support including types   |
| TSX        | .tsx      | typescript    | React + TypeScript             |
| JavaScript | .js       | javascript    | ES6+ features                  |
| JSX        | .jsx      | javascript    | React components               |
| CSS        | .css      | css           | Selectors, media queries       |
| Vue        | .vue      | vue           | SFC (script/template/style)    |

### How to Add a New Language

1. **Install Tree-sitter grammar**:
   ```bash
   npm install tree-sitter-python tree-sitter-wasms
   ```

2. **Add to LanguageRegistry** ([LanguageRegistry.ts:50-65](src/indexing/chunkers/treeSitter/LanguageRegistry.ts#L50-L65)):
   ```typescript
   LANGUAGE_EXTENSION_MAP["py"] = "python";
   WASM_FILE_MAP["python"] = "tree-sitter-python.wasm";
   ```

3. **Add node types** ([ASTCodeParser.ts:38-103](src/indexing/chunkers/treeSitter/ASTCodeParser.ts#L38-L103)):
   ```typescript
   NODE_TYPES_OF_INTEREST["py"] = {
       function_definition: "Function",
       class_definition: "Class",
       // ...
   };
   ```

4. **Add to supported languages** ([TreeSitterChunker.ts:22](src/indexing/chunkers/TreeSitterChunker.ts#L22)):
   ```typescript
   private supportedLanguages = ["ts", "tsx", "js", "jsx", "css", "vue", "py"];
   ```

5. **Test**: Run `npm run test-chunker` with sample files.

---

## Performance Considerations

### Benchmarks (Approximate)

| Operation               | Time      | Notes                     |
|-------------------------|-----------|---------------------------|
| Load WASM grammar       | ~100ms    | Only once per language    |
| Parse 1000-line file    | ~10-20ms  | Tree-sitter is fast       |
| Extract breakpoints     | ~5-10ms   | AST traversal             |
| Create chunks           | ~5ms      | String splitting          |
| **Total per file**      | ~20-35ms  | Cached grammar            |

### Optimization Strategies

1. **Grammar Caching**: Load WASM once, reuse forever
2. **Parser Reuse**: One parser per language
3. **Lazy Loading**: Load grammars only when needed
4. **Chunker Pooling**: One chunker per extension

### Memory Usage

- **Tree-sitter WASM**: ~200KB per language (on disk)
- **Parsed AST**: ~2-5MB for 1000-line file (temporary)
- **Chunker Cache**: ~10KB per language (in memory)

### Scalability

**Tested with**:
- Files up to 10,000 lines
- Workspaces with 1000+ files
- All web languages simultaneously

**Result**: Fast and efficient, no performance degradation.

---

## Future Improvements

### Potential Enhancements

1. **Multi-Language Support**
   - Add Python, Go, Rust, Java, etc.
   - Requires Tree-sitter WASM grammars

2. **Smarter Chunk Sizing**
   - Target specific token counts (e.g., fill 90% of embedding context)
   - Dynamic splitting based on content

3. **Semantic Grouping**
   - Group related functions (e.g., class methods with class)
   - Detect and preserve related code blocks

4. **Incremental Parsing**
   - Only re-parse changed sections
   - Faster indexing for large files

5. **Custom Breakpoint Rules**
   - User-defined chunk boundaries
   - File-specific overrides

---

## Conclusion

The AST Code Chunker represents a sophisticated approach to code splitting that prioritizes **semantic accuracy** over simplicity. By leveraging Tree-sitter's powerful AST parsing capabilities, it creates chunks that:

- ✅ Respect code structure
- ✅ Preserve context and comments
- ✅ Optimize for embedding models
- ✅ Support multiple languages
- ✅ Handle edge cases gracefully

While more complex than line-based splitting, the improved search quality and context preservation make it worthwhile for semantic code search applications.

**Key Takeaway**: Good chunking is crucial for good embeddings, which are crucial for good search results.
