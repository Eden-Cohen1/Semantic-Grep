import * as assert from 'assert';
import * as sinon from 'sinon';
import { BatchProcessor } from '../../ollama/batchProcessor';
import { OllamaClient } from '../../ollama/ollamaClient';
import { teardown } from 'mocha';

suite('BatchProcessor Test Suite', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    test('should process texts in batches', async () => {
        // Arrange
        const processor = new BatchProcessor({ batchSize: 2 });
        const texts = ['text1', 'text2', 'text3'];

        const mockEmbedding1 = [0.1, 0.2, 0.3];
        const mockEmbedding2 = [0.4, 0.5, 0.6];
        const mockEmbedding3 = [0.7, 0.8, 0.9];

        const generateStub = sandbox.stub(OllamaClient.prototype, 'generateEmbeddings');
        generateStub.onFirstCall().resolves([[...mockEmbedding1], [...mockEmbedding2]]);
        generateStub.onSecondCall().resolves([[...mockEmbedding3]]);

        // Act
        const result = await processor.processTexts(texts);

        // Assert
        assert.strictEqual(result.successCount, 3);
        assert.strictEqual(result.failureCount, 0);
        assert.strictEqual(result.embeddings.length, 3);
        assert.deepStrictEqual(result.embeddings[0], mockEmbedding1);
        assert.deepStrictEqual(result.embeddings[1], mockEmbedding2);
        assert.deepStrictEqual(result.embeddings[2], mockEmbedding3);
        assert.strictEqual(generateStub.callCount, 2); // 2 batches
    });

    test('should retry failed batches with exponential backoff', async () => {
        // Arrange
        const processor = new BatchProcessor({ batchSize: 2, maxRetries: 3 });
        const texts = ['text1', 'text2'];

        const generateStub = sandbox.stub(OllamaClient.prototype, 'generateEmbeddings');
        generateStub.onFirstCall().rejects(new Error('Network error'));
        generateStub.onSecondCall().rejects(new Error('Network error'));
        generateStub.onThirdCall().resolves([[0.1, 0.2], [0.3, 0.4]]);

        const clock = sandbox.useFakeTimers();

        // Act
        const promise = processor.processTexts(texts);

        // Fast-forward through retry delays
        await clock.tickAsync(1000); // First retry delay
        await clock.tickAsync(2000); // Second retry delay
        const result = await promise;

        // Assert
        assert.strictEqual(generateStub.callCount, 3);
        assert.strictEqual(result.successCount, 2);
        assert.strictEqual(result.failureCount, 0);

        clock.restore();
    });

    test('should fall back to individual processing on batch failure', async () => {
        // Arrange
        const processor = new BatchProcessor({ batchSize: 2, maxRetries: 1 });
        const texts = ['text1', 'text2'];

        const generateBatchStub = sandbox.stub(OllamaClient.prototype, 'generateEmbeddings');
        generateBatchStub.rejects(new Error('Batch failed'));

        const generateSingleStub = sandbox.stub(OllamaClient.prototype, 'generateEmbedding');
        generateSingleStub.onFirstCall().resolves([0.1, 0.2]);
        generateSingleStub.onSecondCall().resolves([0.3, 0.4]);

        // Act
        const result = await processor.processTexts(texts);

        // Assert
        assert.strictEqual(result.successCount, 2);
        assert.strictEqual(generateSingleStub.callCount, 2);
    });

    test('should track failed items correctly', async () => {
        // Arrange
        const processor = new BatchProcessor({ batchSize: 2 });
        const texts = ['text1', 'text2', 'text3'];

        const generateBatchStub = sandbox.stub(OllamaClient.prototype, 'generateEmbeddings');
        generateBatchStub.onFirstCall().resolves([[0.1, 0.2], []]);  // Second item failed
        generateBatchStub.onSecondCall().resolves([[0.3, 0.4]]);

        // Act
        const result = await processor.processTexts(texts);

        // Assert
        assert.strictEqual(result.successCount, 2);
        assert.strictEqual(result.failureCount, 1);
        assert.deepStrictEqual(result.failedIndices, [1]);
    });

    test('should report progress during processing', async () => {
        // Arrange
        const processor = new BatchProcessor({ batchSize: 2 });
        const texts = ['text1', 'text2', 'text3', 'text4'];

        const generateStub = sandbox.stub(OllamaClient.prototype, 'generateEmbeddings');
        generateStub.resolves([[0.1], [0.2]]);

        const progressUpdates: Array<{ current: number; total: number }> = [];
        const onProgress = (current: number, total: number) => {
            progressUpdates.push({ current, total });
        };

        // Act
        await processor.processTexts(texts, onProgress);

        // Assert
        assert.strictEqual(progressUpdates.length, 2);
        assert.deepStrictEqual(progressUpdates[0], { current: 2, total: 4 });
        assert.deepStrictEqual(progressUpdates[1], { current: 4, total: 4 });
    });

    test('should reduce batch size on repeated failures', async () => {
        // Arrange
        const processor = new BatchProcessor({ batchSize: 4 });
        const texts = ['text1', 'text2', 'text3', 'text4', 'text5'];

        const generateStub = sandbox.stub(OllamaClient.prototype, 'generateEmbeddings');
        generateStub.onFirstCall().rejects(new Error('Batch too large'));

        const generateSingleStub = sandbox.stub(OllamaClient.prototype, 'generateEmbedding');
        generateSingleStub.resolves([0.1, 0.2]);

        // Act
        await processor.processTexts(texts);

        // Assert - batch size should be reduced after failure
        assert.strictEqual(processor.getBatchSize(), 2); // 4 / 2 = 2
    });

    test('should handle empty input', async () => {
        // Arrange
        const processor = new BatchProcessor();

        // Act
        const result = await processor.processTexts([]);

        // Assert
        assert.strictEqual(result.successCount, 0);
        assert.strictEqual(result.failureCount, 0);
        assert.strictEqual(result.embeddings.length, 0);
    });

    test('should adjust batch size dynamically', () => {
        // Arrange
        const processor = new BatchProcessor({ batchSize: 32 });

        // Act & Assert - Increase
        processor.adjustBatchSize(true);
        assert.strictEqual(processor.getBatchSize(), 40); // 32 * 1.25

        // Act & Assert - Decrease
        processor.adjustBatchSize(false);
        assert.strictEqual(processor.getBatchSize(), 20); // 40 / 2
    });

    test('should not exceed max batch size', () => {
        // Arrange
        const processor = new BatchProcessor({ batchSize: 90 });

        // Act
        processor.adjustBatchSize(true); // Would be 112, but capped at 100

        // Assert
        assert.strictEqual(processor.getBatchSize(), 100);
    });

    test('should not go below min batch size', () => {
        // Arrange
        const processor = new BatchProcessor({ batchSize: 1 });

        // Act
        processor.adjustBatchSize(false); // Would be 0.5, but capped at 1

        // Assert
        assert.strictEqual(processor.getBatchSize(), 1);
    });
});
