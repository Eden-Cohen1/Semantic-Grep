/**
 * Standalone test script for batch embedding generation
 * This version doesn't require VSCode environment
 * Run with: node test-batch-embeddings-standalone.js
 */

const axios = require('axios');

// Simple logger for standalone testing
class SimpleLogger {
    constructor(component) {
        this.component = component;
    }

    info(message, ...args) {
        console.log(`[INFO] [${this.component}] ${message}`, ...args);
    }

    debug(message, ...args) {
        console.log(`[DEBUG] [${this.component}] ${message}`, ...args);
    }

    warn(message, ...args) {
        console.warn(`[WARN] [${this.component}] ${message}`, ...args);
    }

    error(message, error) {
        console.error(`[ERROR] [${this.component}] ${message}`, error);
    }
}

// Simple Ollama client for testing
class SimpleOllamaClient {
    constructor() {
        this.baseUrl = 'http://localhost:11434';
        this.logger = new SimpleLogger('OllamaClient');
        this.client = axios.create({
            baseURL: this.baseUrl,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    async checkConnection() {
        try {
            const response = await this.client.get('/api/tags', { timeout: 5000 });
            return response.status === 200;
        } catch (error) {
            this.logger.debug('Connection check failed', error.message);
            return false;
        }
    }

    async generateEmbedding(text) {
        try {
            const response = await this.client.post('/api/embeddings', {
                model: 'nomic-embed-text',
                prompt: text
            });
            return response.data.embedding;
        } catch (error) {
            this.logger.error('Failed to generate embedding', error);
            throw error;
        }
    }

    async generateEmbeddings(texts) {
        const embeddings = [];
        for (let i = 0; i < texts.length; i++) {
            try {
                const embedding = await this.generateEmbedding(texts[i]);
                embeddings.push(embedding);
            } catch (error) {
                this.logger.error(`Failed to generate embedding for text ${i}`, error);
                embeddings.push([]);
            }
        }
        return embeddings;
    }
}

// Simple batch processor for testing
class SimpleBatchProcessor {
    constructor(batchSize = 32) {
        this.logger = new SimpleLogger('BatchProcessor');
        this.client = new SimpleOllamaClient();
        this.batchSize = batchSize;
        this.delayBetweenBatches = 100;
        this.maxRetries = 3;
    }

    async processTexts(texts, onProgress) {
        this.logger.info(`Processing ${texts.length} texts in batches of ${this.batchSize}`);

        const embeddings = new Array(texts.length);
        const failedIndices = [];
        let successCount = 0;
        let processedCount = 0;

        const batches = this.createBatches(texts);
        this.logger.info(`Created ${batches.length} batches`);

        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
            const batch = batches[batchIndex];
            this.logger.info(`Processing batch ${batchIndex + 1}/${batches.length}`);

            try {
                const batchEmbeddings = await this.processBatchWithRetry(batch.texts);

                for (let i = 0; i < batch.texts.length; i++) {
                    const originalIndex = batch.startIndex + i;
                    embeddings[originalIndex] = batchEmbeddings[i];

                    if (batchEmbeddings[i].length > 0) {
                        successCount++;
                    } else {
                        failedIndices.push(originalIndex);
                    }
                }

                processedCount += batch.texts.length;

                if (onProgress) {
                    onProgress(processedCount, texts.length);
                }

                if (batchIndex < batches.length - 1) {
                    await this.sleep(this.delayBetweenBatches);
                }
            } catch (error) {
                this.logger.error(`Batch ${batchIndex + 1} failed completely`, error);

                for (let i = 0; i < batch.texts.length; i++) {
                    const originalIndex = batch.startIndex + i;
                    embeddings[originalIndex] = [];
                    failedIndices.push(originalIndex);
                }

                processedCount += batch.texts.length;

                if (onProgress) {
                    onProgress(processedCount, texts.length);
                }
            }
        }

        const failureCount = failedIndices.length;
        this.logger.info(`Batch processing complete: ${successCount} succeeded, ${failureCount} failed`);

        return {
            embeddings,
            failedIndices,
            successCount,
            failureCount
        };
    }

    async processBatchWithRetry(texts) {
        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                return await this.client.generateEmbeddings(texts);
            } catch (error) {
                this.logger.warn(`Batch retry ${attempt + 1}/${this.maxRetries}`, error.message);
                const delay = Math.pow(2, attempt) * 1000;
                await this.sleep(delay);
            }
        }

        this.logger.warn('Batch processing failed, falling back to individual processing');
        return await this.client.generateEmbeddings(texts);
    }

    createBatches(texts) {
        const batches = [];
        for (let i = 0; i < texts.length; i += this.batchSize) {
            batches.push({
                texts: texts.slice(i, i + this.batchSize),
                startIndex: i
            });
        }
        return batches;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    getBatchSize() {
        return this.batchSize;
    }
}

// Sample code chunks
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
    console.log('=' .repeat(80));

    try {
        // Check Ollama connection
        const client = new SimpleOllamaClient();
        console.log('📡 Checking Ollama connection...');
        const isConnected = await client.checkConnection();

        if (!isConnected) {
            console.error('❌ Ollama is not running or not accessible at http://localhost:11434');
            console.log('\n⚠️  Please ensure:');
            console.log('   1. Ollama is installed and running');
            console.log('   2. The nomic-embed-text model is pulled: ollama pull nomic-embed-text');
            process.exit(1);
        }

        console.log('✅ Ollama is connected\n');
        console.log('=' .repeat(80));

        // Create batch processor
        const batchSize = 32;
        const processor = new SimpleBatchProcessor(batchSize);

        console.log(`\n📦 Processing ${sampleChunks.length} code chunks`);
        console.log(`⚙️  Batch size: ${batchSize}`);
        const estimatedTime = Math.ceil(sampleChunks.length / batchSize) * 2;
        console.log(`⏱️  Estimated time: ~${estimatedTime} seconds\n`);
        console.log('=' .repeat(80));

        // Extract texts
        const texts = sampleChunks.map(chunk => chunk.text);

        // Track progress
        const startTime = Date.now();

        const result = await processor.processTexts(texts, (current, total) => {
            const percentage = Math.round((current / total) * 100);
            const bar = '█'.repeat(Math.floor(percentage / 2)) +
                       '░'.repeat(50 - Math.floor(percentage / 2));
            process.stdout.write(`\r📊 Progress: [${bar}] ${percentage}% (${current}/${total})`);
        });

        const endTime = Date.now();
        const duration = ((endTime - startTime) / 1000).toFixed(2);

        console.log('\n\n' + '='.repeat(80));
        console.log('✨ Embedding Generation Complete!\n');

        console.log(`📈 Summary:`);
        console.log(`   ✅ Successful: ${result.successCount}`);
        console.log(`   ❌ Failed: ${result.failureCount}`);
        console.log(`   ⏱️  Duration: ${duration}s`);
        console.log(`   ⚡ Speed: ${(result.successCount / parseFloat(duration)).toFixed(2)} chunks/sec\n`);

        console.log('=' .repeat(80));

        // Display results
        console.log('\n📝 Detailed Results:\n');

        sampleChunks.forEach((chunk, index) => {
            const embedding = result.embeddings[index];
            const codePreview = chunk.text.split('\n')[0].substring(0, 60);

            console.log(`${index + 1}. ${chunk.id}`);
            console.log(`   Type: ${chunk.type} | Language: ${chunk.language}`);
            console.log(`   Code: ${codePreview}...`);

            if (embedding && embedding.length > 0) {
                console.log(`   ✅ Embedding: [${embedding.length} dimensions]`);
                console.log(`   Sample: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);

                // Calculate magnitude
                const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
                console.log(`   Magnitude: ${magnitude.toFixed(4)}`);
            } else {
                console.log(`   ❌ No embedding generated`);
            }
            console.log('');
        });

        if (result.failedIndices.length > 0) {
            console.log('⚠️  Failed chunks:');
            result.failedIndices.forEach(index => {
                console.log(`   - ${sampleChunks[index].id}`);
            });
            console.log('');
        }

        console.log('=' .repeat(80));
        console.log('✅ Test completed successfully!');

    } catch (error) {
        console.error('\n❌ Error during testing:', error.message);
        if (error.stack) {
            console.error('\nStack trace:', error.stack);
        }
        process.exit(1);
    }
}

// Run the test
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
