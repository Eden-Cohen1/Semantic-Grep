import * as assert from 'assert';
import * as sinon from 'sinon';
import fg from 'fast-glob';
import * as fs from 'fs';
import { FileScanner } from '../../indexing/fileScanner';

suite('FileScanner Test Suite', () => {
    let sandbox: sinon.SinonSandbox;
    let scanner: FileScanner;

    setup(() => {
        sandbox = sinon.createSandbox();
        scanner = new FileScanner();
    });

    teardown(() => {
        sandbox.restore();
    });

    test('should find files matching patterns', async () => {
        // Arrange
        const mockFiles = [
            'c:/test/src/index.ts',
            'c:/test/src/utils.ts',
            'c:/test/src/api.js'
        ];

        sandbox.stub(fg, 'default' as any).resolves(mockFiles);
        const statStub = sandbox.stub(fs.promises, 'stat');
        mockFiles.forEach(file => {
            statStub.withArgs(file).resolves({ size: 1000, isFile: () => true } as any);
        });

        // Act
        const result = await scanner.scanDirectory('c:/test', {
            supportedLanguages: ['ts', 'js'],
            maxFileSize: 100000
        });

        // Assert
        assert.strictEqual(result.files.length, 3);
        assert.ok(result.files.includes('c:/test/src/index.ts'));
    });

    test('should filter files by size', async () => {
        // Arrange
        const mockFiles = [
            'c:/test/small.ts',
            'c:/test/large.ts'
        ];

        sandbox.stub(fg, 'default' as any).resolves(mockFiles);
        const statStub = sandbox.stub(fs.promises, 'stat');
        statStub.withArgs('c:/test/small.ts').resolves({ size: 1000, isFile: () => true } as any);
        statStub.withArgs('c:/test/large.ts').resolves({ size: 200000, isFile: () => true } as any);

        // Act
        const result = await scanner.scanDirectory('c:/test', {
            supportedLanguages: ['ts'],
            maxFileSize: 100000 // 100KB max
        });

        // Assert
        assert.strictEqual(result.files.length, 1);
        assert.ok(result.files.includes('c:/test/small.ts'));
        assert.strictEqual(result.skippedFiles, 1);
    });

    test('should skip empty files', async () => {
        // Arrange
        const mockFiles = [
            'c:/test/empty.ts',
            'c:/test/normal.ts'
        ];

        sandbox.stub(fg, 'default' as any).resolves(mockFiles);
        const statStub = sandbox.stub(fs.promises, 'stat');
        statStub.withArgs('c:/test/empty.ts').resolves({ size: 0, isFile: () => true } as any);
        statStub.withArgs('c:/test/normal.ts').resolves({ size: 1000, isFile: () => true } as any);

        // Act
        const result = await scanner.scanDirectory('c:/test', {
            supportedLanguages: ['ts']
        });

        // Assert
        assert.strictEqual(result.files.length, 1);
        assert.ok(result.files.includes('c:/test/normal.ts'));
        assert.strictEqual(result.skippedFiles, 1);
        assert.ok(result.skippedReasons.has('Empty file'));
    });

    test('should apply exclusion patterns', async () => {
        // Arrange
        const mockFiles = [
            'c:/test/src/index.ts',
            'c:/test/node_modules/lib.ts'
        ];

        const globStub = sandbox.stub(fg, 'default' as any);
        globStub.callsFake(async () => {
            // Simulate fast-glob filtering out node_modules
            return mockFiles.filter(f => !f.includes('node_modules'));
        });

        const statStub = sandbox.stub(fs.promises, 'stat');
        statStub.resolves({ size: 1000, isFile: () => true } as any);

        // Act
        const result = await scanner.scanDirectory('c:/test', {
            supportedLanguages: ['ts'],
            excludePatterns: ['**/node_modules/**']
        });

        // Assert
        assert.strictEqual(result.files.length, 1);
        assert.ok(result.files.includes('c:/test/src/index.ts'));
    });

    test('should check if file is supported', () => {
        // Arrange & Act & Assert
        assert.strictEqual(scanner.isSupported('test.ts', ['ts', 'js']), true);
        assert.strictEqual(scanner.isSupported('test.js', ['ts', 'js']), true);
        assert.strictEqual(scanner.isSupported('test.py', ['ts', 'js']), false);
        assert.strictEqual(scanner.isSupported('test.txt', ['ts', 'js']), false);
    });

    test('should get file extension correctly', () => {
        // Arrange & Act & Assert
        assert.strictEqual(scanner.getExtension('file.ts'), 'ts');
        assert.strictEqual(scanner.getExtension('path/to/file.js'), 'js');
        assert.strictEqual(scanner.getExtension('file.test.ts'), 'ts');
        assert.strictEqual(scanner.getExtension('noextension'), '');
    });

    test('should check if file is excluded by pattern', () => {
        // Arrange
        const excludePatterns = ['**/node_modules/**', '**/dist/**', '**/*.test.ts'];

        // Act & Assert
        assert.strictEqual(scanner.isExcluded('src/node_modules/lib.ts', excludePatterns), true);
        assert.strictEqual(scanner.isExcluded('src/dist/bundle.js', excludePatterns), true);
        assert.strictEqual(scanner.isExcluded('src/file.test.ts', excludePatterns), true);
        assert.strictEqual(scanner.isExcluded('src/normal.ts', excludePatterns), false);
    });

    test('should calculate total size correctly', async () => {
        // Arrange
        const mockFiles = [
            'c:/test/file1.ts',
            'c:/test/file2.ts'
        ];

        sandbox.stub(fg, 'default' as any).resolves(mockFiles);
        const statStub = sandbox.stub(fs.promises, 'stat');
        statStub.withArgs('c:/test/file1.ts').resolves({ size: 1000, isFile: () => true } as any);
        statStub.withArgs('c:/test/file2.ts').resolves({ size: 2000, isFile: () => true } as any);

        // Act
        const result = await scanner.scanDirectory('c:/test', {
            supportedLanguages: ['ts']
        });

        // Assert
        assert.strictEqual(result.totalSize, 3000);
    });

    test('should handle file access errors gracefully', async () => {
        // Arrange
        const mockFiles = [
            'c:/test/good.ts',
            'c:/test/bad.ts'
        ];

        sandbox.stub(fg, 'default' as any).resolves(mockFiles);
        const statStub = sandbox.stub(fs.promises, 'stat');
        statStub.withArgs('c:/test/good.ts').resolves({ size: 1000, isFile: () => true } as any);
        statStub.withArgs('c:/test/bad.ts').rejects(new Error('Permission denied'));

        // Act
        const result = await scanner.scanDirectory('c:/test', {
            supportedLanguages: ['ts']
        });

        // Assert
        assert.strictEqual(result.files.length, 1);
        assert.strictEqual(result.skippedFiles, 1);
        assert.ok(result.skippedReasons.has('File access error'));
    });

    test('should format scan result correctly', async () => {
        // Arrange
        const result = {
            files: ['file1.ts', 'file2.ts'],
            totalSize: 3000,
            skippedFiles: 1,
            skippedReasons: new Map([['File too large', 1]])
        };

        // Act
        const formatted = scanner.formatScanResult(result);

        // Assert
        assert.ok(formatted.includes('Found 2 indexable files'));
        assert.ok(formatted.includes('Skipped 1 files'));
        assert.ok(formatted.includes('File too large: 1'));
    });

    test('should format bytes to human-readable string', () => {
        // This tests the private formatBytes method indirectly through formatScanResult
        // Arrange
        const result = {
            files: ['file.ts'],
            totalSize: 1048576, // 1 MB
            skippedFiles: 0,
            skippedReasons: new Map()
        };

        // Act
        const formatted = scanner.formatScanResult(result);

        // Assert
        assert.ok(formatted.includes('1.00 MB'));
    });
});
