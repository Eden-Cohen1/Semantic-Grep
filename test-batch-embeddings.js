/**
 * Test script for batch embedding generation
 * Run with: node test-batch-embeddings.js
 */

const { EmbeddingGenerator } = require('./out/indexing/embeddingGenerator');
const { Logger } = require('./out/utils/logger');

// Sample code chunks to test
const sampleChunks = [
    {
        id: 'test1.ts:1-5',
        filePath: '/test/example1.ts',
        startLine: 1,
        endLine: 5,
        text: `function validateEmail(email: string): boolean {
    const regex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    return regex.test(email);
}`,
        type: 'function',
        language: 'ts',
        timestamp: Date.now(),
        chunkIndexInFile: 0
    },
    {
        id: 'test2.ts:1-4',
        filePath: '/test/example2.ts',
        startLine: 1,
        endLine: 4,
        text: `async function fetchUserData(userId: number) {
    const response = await fetch(\`/api/users/\${userId}\`);
    return response.json();
}`,
        type: 'function',
        language: 'ts',
        timestamp: Date.now(),
        chunkIndexInFile: 0
    },
    {
        id: 'test3.ts:1-6',
        filePath: '/test/example3.ts',
        startLine: 1,
        endLine: 6,
        text: `class UserRepository {
    constructor(private db: Database) {}

    async findById(id: number): Promise<User | null> {
        return this.db.query('SELECT * FROM users WHERE id = ?', [id]);
    }
}`,
        type: 'class',
        language: 'ts',
        timestamp: Date.now(),
        chunkIndexInFile: 0
    },
    {
        id: 'test4.py:1-3',
        filePath: '/test/example4.py',
        startLine: 1,
        endLine: 3,
        text: `def calculate_average(numbers):
    return sum(numbers) / len(numbers) if numbers else 0`,
        type: 'function',
        language: 'py',
        timestamp: Date.now(),
        chunkIndexInFile: 0
    },
    {
        id: 'test5.js:1-5',
        filePath: '/test/example5.js',
        startLine: 1,
        endLine: 5,
        text: `function debounce(fn, delay) {
    let timeoutId;
    return (...args) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn(...args), delay);
    };
}`,
        type: 'function',
        language: 'js',
        timestamp: Date.now(),
        chunkIndexInFile: 0
    }
];

async function main() {
    console.log('🚀 Testing Batch Embedding Generation\n');
    console.log('=' .repeat(60));

    try {
        // Check if Ollama is available first
        const { OllamaClient } = require('./out/ollama/ollamaClient');
        const client = new OllamaClient();

        console.log('📡 Checking Ollama connection...');
        const isConnected = await client.checkConnection();

        if (!isConnected) {
            console.error('❌ Ollama is not running or not accessible at http://localhost:11434');
            console.log('\nPlease ensure:');
            console.log('1. Ollama is installed and running');
            console.log('2. The nomic-embed-text model is pulled: ollama pull nomic-embed-text');
            process.exit(1);
        }

        console.log('✅ Ollama is connected\n');
        console.log('=' .repeat(60));

        // Create embedding generator
        const generator = new EmbeddingGenerator();

        console.log(`\n📦 Processing ${sampleChunks.length} code chunks`);
        console.log(`⚙️  Batch size: ${generator.getBatchSize()}`);
        console.log(`⏱️  Estimated time: ~${generator.estimateProcessingTime(sampleChunks.length)} seconds\n`);
        console.log('=' .repeat(60));

        // Track progress
        let lastProgress = 0;
        const startTime = Date.now();

        const result = await generator.generateEmbeddings(
            sampleChunks,
            (progress) => {
                const bar = '█'.repeat(Math.floor(progress.percentage / 2)) +
                           '░'.repeat(50 - Math.floor(progress.percentage / 2));
                process.stdout.write(`\r📊 Progress: [${bar}] ${progress.percentage}% (${progress.current}/${progress.total})`);
            }
        );

        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);

        console.log('\n\n' + '='.repeat(60));
        console.log('✨ Embedding Generation Complete!\n');

        console.log(`📈 Summary:`);
        console.log(`   ✅ Successful: ${result.successCount}`);
        console.log(`   ❌ Failed: ${result.failureCount}`);
        console.log(`   ⏱️  Duration: ${duration}s`);
        console.log(`   ⚡ Speed: ${(result.successCount / parseFloat(duration)).toFixed(2)} chunks/sec\n`);

        console.log('=' .repeat(60));

        // Display results for each chunk
        console.log('\n📝 Detailed Results:\n');

        result.chunks.forEach((chunk, index) => {
            console.log(`${index + 1}. ${chunk.id}`);
            console.log(`   Type: ${chunk.type}`);
            console.log(`   Language: ${chunk.language}`);
            console.log(`   Code preview: ${chunk.text.substring(0, 50)}...`);

            if (chunk.vector) {
                console.log(`   ✅ Embedding: [${chunk.vector.length} dimensions]`);
                console.log(`   Sample values: [${chunk.vector.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
            } else {
                console.log(`   ❌ No embedding generated`);
            }
            console.log('');
        });

        if (result.failedChunks.length > 0) {
            console.log('⚠️  Failed chunks:');
            result.failedChunks.forEach(chunk => {
                console.log(`   - ${chunk.id}`);
            });
        }

        console.log('=' .repeat(60));
        console.log('\n✅ Test completed successfully!');

    } catch (error) {
        console.error('\n❌ Error during testing:', error.message);
        console.error('\nStack trace:', error.stack);
        process.exit(1);
    }
}

// Run the test
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
