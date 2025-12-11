// Simple test script for TreeSitterChunker
const path = require('path');

// Set up paths
const testFile = path.join(__dirname, 'test-sample.ts');

async function testTreeSitterChunker() {
    try {
        console.log('Testing TreeSitterChunker...\n');

        // Import the factory
        const { ChunkerFactory } = require('./out/indexing/chunkers/ChunkerFactory');

        // Get chunker for TypeScript file
        const chunker = ChunkerFactory.getChunker(testFile);
        console.log(`Using chunker: ${chunker.getName()}\n`);

        // Chunk the file
        console.log(`Chunking file: ${testFile}\n`);
        const result = await chunker.chunkFile(testFile);

        console.log('=== CHUNKING RESULT ===');
        console.log(`Parse success: ${result.parseSuccess}`);
        console.log(`Parse method: ${result.parseMethod}`);
        console.log(`Number of chunks: ${result.chunks.length}\n`);

        // Display chunks
        result.chunks.forEach((chunk, index) => {
            console.log(`--- Chunk ${index + 1} ---`);
            console.log(`Type: ${chunk.type}`);
            console.log(`Lines: ${chunk.startLine}-${chunk.endLine}`);
            console.log(`ID: ${chunk.id}`);
            console.log(`Text preview: ${chunk.text.substring(0, 100)}...`);
            console.log('');
        });

        console.log('✓ Test completed successfully!');
    } catch (error) {
        console.error('✗ Test failed:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

testTreeSitterChunker();
