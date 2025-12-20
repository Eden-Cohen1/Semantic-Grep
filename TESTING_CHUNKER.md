# Testing the Cintra Code Chunker

This guide explains how to test the new Cintra-style code chunking implementation.

## Quick Test (Recommended)

Run the automated test suite:

```bash
npm run test-chunker
```

This will:
1. Compile the TypeScript code
2. Run comprehensive tests on the chunker
3. Show you token counts, chunk sizes, and example outputs

## What the Tests Cover

The test suite includes:

### Test 1: Token Counter
- Verifies token counting works correctly
- Shows character-to-token ratios
- Tests on various code snippets

### Test 2: TypeScript Chunking
- Tests chunking on sample TypeScript code
- Includes classes, methods, comments, and imports
- Shows how code is split into logical chunks

### Test 3: Python Chunking
- Tests chunking on sample Python code
- Includes classes, functions, docstrings
- Demonstrates comment inclusion

### Test 4: Full Chunk Display
- Shows complete chunk contents
- Helps verify logical boundaries are respected

### Test 5: Chunk Metadata
- Tests line number tracking
- Verifies chunk positioning

## Manual Testing in VS Code

### Option 1: Through the Extension

1. **Open VS Code** with your extension loaded (F5 to debug)
2. **Index your workspace**:
   - Press `Ctrl+Shift+P` (or `Cmd+Shift+P` on Mac)
   - Run: `Semantic Grep: Index Workspace`
3. **Check the output panel** to see chunking logs
4. **Search for code**:
   - Press `Ctrl+Shift+P`
   - Run: `Semantic Grep: Search Code`

### Option 2: Test on Specific Files

Create a test file and watch how it chunks:

```typescript
// test-file.ts
import { Logger } from "./logger";

/**
 * This is a test class
 * to see how chunking works
 */
export class TestClass {
    private value: number = 0;

    constructor() {
        console.log("Test class created");
    }

    /**
     * Test method 1
     */
    method1(): void {
        this.value++;
    }

    /**
     * Test method 2
     */
    method2(): void {
        this.value--;
    }
}

// Standalone function
export function helperFunction() {
    return "helper";
}
```

Then index the workspace and check the logs.

## Configuration

You can adjust the chunk size in VS Code settings:

1. Open Settings (Ctrl+,)
2. Search for "Semantic Search"
3. Modify `semanticSearch.chunkSize` (default: 500 tokens)

Try different values:
- **100 tokens** - More, smaller chunks (good for precise search)
- **500 tokens** - Balanced (default)
- **1000 tokens** - Fewer, larger chunks (more context per chunk)

## Understanding the Output

When you run `npm run test-chunker`, you'll see output like:

```
--- Chunk 1 ---
Lines: 15 | Tokens: 89
First line: import { Logger } from "./logger";
```

This tells you:
- **Chunk number**: Sequential identifier
- **Lines**: How many lines in this chunk
- **Tokens**: Estimated token count (should be ≤ limit)
- **First line**: Preview of chunk content

## Verifying Correct Behavior

✅ **Good signs:**
- Chunks respect the token limit (may slightly exceed for logical completeness)
- Comments appear with their associated code
- Functions/classes aren't split mid-way
- Imports are grouped logically

❌ **Problems to watch for:**
- Functions cut in half
- Comments separated from their code
- Extremely large chunks (way over limit)
- Empty chunks

## Comparing with Old Implementation

To compare with the old query-based approach:

1. Change `preferredChunker` setting to `"langchain"`
2. Re-index your workspace
3. Note the difference in chunk sizes and boundaries

The Cintra approach should produce more balanced chunks that respect both semantic boundaries AND token limits.

## Troubleshooting

### Test fails with "Language parser not found"
- Make sure Tree-sitter WASM files are installed
- Run: `npm install`

### Chunks seem too large/small
- Adjust the `tokenLimit` in the test file
- Check the `chunkSize` config in VS Code settings

### Parser errors for specific languages
- Check which languages are supported in `CintraCodeParser.ts`
- Currently supports: TypeScript, JavaScript, Python, Go, Ruby, PHP, CSS, Vue

## Next Steps

After testing:
1. Try it on your real codebase
2. Adjust the chunk size to your needs
3. Verify search quality improves with better chunking
4. Report any issues with specific file types

## Manual Inspection

You can also manually inspect how a file is chunked:

```typescript
import { CintraCodeChunker } from "./src/indexing/chunkers/treeSitter/CintraCodeChunker";
import * as fs from "fs";

const chunker = new CintraCodeChunker("ts");
const code = fs.readFileSync("path/to/your/file.ts", "utf-8");
const chunks = await chunker.chunkAsync(code, 500);

console.log(`File split into ${chunks.size} chunks`);
chunks.forEach((code, num) => {
    console.log(`\n=== Chunk ${num} ===`);
    console.log(code);
});
```

## Performance Testing

For large files, time the chunking:

```typescript
const start = Date.now();
const chunks = await chunker.chunkAsync(largeCode, 500);
const duration = Date.now() - start;
console.log(`Chunked ${largeCode.length} chars in ${duration}ms`);
```

The Tree-sitter approach should be fast even for large files.
