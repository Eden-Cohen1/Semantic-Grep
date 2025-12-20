/**
 * Test script for Cintra-style code chunking
 * Run this to verify the chunker works correctly
 */

import * as path from "path";
import { TreeSitterChunker } from "../indexing/chunkers/TreeSitterChunker";
import { CintraCodeChunker } from "../indexing/chunkers/treeSitter/CintraCodeChunker";
import { countTokens } from "../indexing/chunkers/treeSitter/tokenCounter";

// Sample TypeScript code for testing
const SAMPLE_TS_CODE = `
import { Logger } from "./logger";

/**
 * Sample class for testing chunker
 */
export class Calculator {
    private logger: Logger;

    constructor() {
        this.logger = new Logger("Calculator");
    }

    /**
     * Add two numbers
     */
    add(a: number, b: number): number {
        this.logger.info(\`Adding \${a} + \${b}\`);
        return a + b;
    }

    /**
     * Subtract two numbers
     */
    subtract(a: number, b: number): number {
        this.logger.info(\`Subtracting \${a} - \${b}\`);
        return a - b;
    }

    /**
     * Multiply two numbers
     */
    multiply(a: number, b: number): number {
        return a * b;
    }
}

// Helper function
export function formatResult(result: number): string {
    return \`Result: \${result}\`;
}
`;

// Sample Python code for testing
const SAMPLE_PY_CODE = `
import os
from typing import List

class DataProcessor:
    """
    Processes data from various sources
    """

    def __init__(self, config):
        self.config = config
        self.data = []

    def load_data(self, filepath: str) -> List[dict]:
        """
        Load data from a file
        """
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"File not found: {filepath}")

        with open(filepath, 'r') as f:
            data = json.load(f)

        return data

    def process(self, data: List[dict]) -> List[dict]:
        """
        Process the loaded data
        """
        processed = []
        for item in data:
            if self._validate(item):
                processed.append(self._transform(item))
        return processed

    def _validate(self, item: dict) -> bool:
        return 'id' in item and 'value' in item

    def _transform(self, item: dict) -> dict:
        return {
            'id': item['id'],
            'value': item['value'] * 2
        }

def main():
    processor = DataProcessor({'debug': True})
    data = processor.load_data('data.json')
    result = processor.process(data)
    print(f"Processed {len(result)} items")
`;

/**
 * Test 1: Token Counter
 */
function testTokenCounter() {
    console.log("=".repeat(60));
    console.log("TEST 1: Token Counter");
    console.log("=".repeat(60));

    const testStrings = [
        "Hello, world!",
        "function add(a, b) { return a + b; }",
        "const myVariable = 123;",
        SAMPLE_TS_CODE.substring(0, 200),
    ];

    for (const text of testStrings) {
        const tokens = countTokens(text);
        console.log(`Text: ${text.substring(0, 50)}...`);
        console.log(`Tokens: ${tokens}`);
        console.log(`Chars: ${text.length}`);
        console.log(`Ratio: ${(text.length / tokens).toFixed(2)} chars/token`);
        console.log();
    }
}

/**
 * Test 2: CintraCodeChunker - TypeScript
 */
async function testCintraChunkerTS() {
    console.log("=".repeat(60));
    console.log("TEST 2: CintraCodeChunker - TypeScript");
    console.log("=".repeat(60));

    const chunker = new CintraCodeChunker("ts");
    const tokenLimit = 100; // Small limit to force multiple chunks

    console.log(`Token limit: ${tokenLimit}`);
    console.log(`Code length: ${SAMPLE_TS_CODE.length} characters\n`);

    const chunks = await chunker.chunkAsync(SAMPLE_TS_CODE, tokenLimit);

    console.log(`Generated ${chunks.size} chunks:\n`);

    for (const [chunkNum, chunkCode] of chunks) {
        const tokens = countTokens(chunkCode);
        const lines = chunkCode.split("\n").length;
        console.log(`--- Chunk ${chunkNum} ---`);
        console.log(`Lines: ${lines} | Tokens: ${tokens}`);
        console.log(`First line: ${chunkCode.split("\n")[0].trim()}`);
        console.log();
    }

    chunker.dispose();
}

/**
 * Test 3: CintraCodeChunker - Python
 */
async function testCintraChunkerPy() {
    console.log("=".repeat(60));
    console.log("TEST 3: CintraCodeChunker - Python");
    console.log("=".repeat(60));

    const chunker = new CintraCodeChunker("py");
    const tokenLimit = 80;

    console.log(`Token limit: ${tokenLimit}`);
    console.log(`Code length: ${SAMPLE_PY_CODE.length} characters\n`);

    const chunks = await chunker.chunkAsync(SAMPLE_PY_CODE, tokenLimit);

    console.log(`Generated ${chunks.size} chunks:\n`);

    for (const [chunkNum, chunkCode] of chunks) {
        const tokens = countTokens(chunkCode);
        const lines = chunkCode.split("\n").length;
        console.log(`--- Chunk ${chunkNum} ---`);
        console.log(`Lines: ${lines} | Tokens: ${tokens}`);
        console.log(`First line: ${chunkCode.split("\n")[0].trim()}`);
        console.log();
    }

    chunker.dispose();
}

/**
 * Test 4: Full chunk content display
 */
async function testFullChunkDisplay() {
    console.log("=".repeat(60));
    console.log("TEST 4: Full Chunk Display - TypeScript");
    console.log("=".repeat(60));

    const chunker = new CintraCodeChunker("ts");
    const tokenLimit = 150;

    const chunks = await chunker.chunkAsync(SAMPLE_TS_CODE, tokenLimit);

    for (const [chunkNum, chunkCode] of chunks) {
        console.log(`\n${"=".repeat(40)}`);
        console.log(`Chunk ${chunkNum} (${countTokens(chunkCode)} tokens)`);
        console.log("=".repeat(40));
        console.log(chunkCode);
    }

    chunker.dispose();
}

/**
 * Test 5: Chunk with metadata
 */
async function testChunkWithMetadata() {
    console.log("=".repeat(60));
    console.log("TEST 5: Chunk with Metadata");
    console.log("=".repeat(60));

    const chunker = new CintraCodeChunker("ts");
    const tokenLimit = 100;

    const chunksWithMeta = await chunker.chunkWithMetadata(SAMPLE_TS_CODE, tokenLimit);

    for (const chunk of chunksWithMeta) {
        console.log(`\nChunk ${chunk.chunkNumber}:`);
        console.log(`  Lines: ${chunk.startLine}-${chunk.endLine}`);
        console.log(`  Tokens: ${countTokens(chunk.code)}`);
        console.log(`  Preview: ${chunk.code.split("\n")[0].substring(0, 50)}...`);
    }

    chunker.dispose();
}

/**
 * Main test runner
 */
async function runTests() {
    console.log("\n");
    console.log("*".repeat(60));
    console.log("CINTRA CODE CHUNKER TESTS");
    console.log("*".repeat(60));
    console.log("\n");

    try {
        // Run all tests
        testTokenCounter();
        await testCintraChunkerTS();
        await testCintraChunkerPy();
        await testFullChunkDisplay();
        await testChunkWithMetadata();

        console.log("\n");
        console.log("*".repeat(60));
        console.log("ALL TESTS COMPLETED");
        console.log("*".repeat(60));
    } catch (error) {
        console.error("\n❌ Test failed:", error);
        if (error instanceof Error) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

// Run tests if executed directly
if (require.main === module) {
    runTests();
}

export { runTests };
