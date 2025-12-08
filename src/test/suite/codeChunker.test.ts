import * as assert from 'assert';
import * as sinon from 'sinon';
import * as fs from 'fs';
import { CodeChunker } from '../../indexing/codeChunker';

suite('CodeChunker Test Suite', () => {
    let sandbox: sinon.SinonSandbox;
    let chunker: CodeChunker;

    setup(() => {
        sandbox = sinon.createSandbox();
        chunker = new CodeChunker();
    });

    teardown(() => {
        sandbox.restore();
    });

    test('should chunk TypeScript functions', async () => {
        // Arrange
        const fileContent = `export function validateEmail(email: string) {
    return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
}

export function validatePassword(password: string) {
    return password.length >= 8;
}`;

        sandbox.stub(fs.promises, 'readFile').resolves(fileContent);

        // Act
        const result = await chunker.chunkFile('/test/file.ts');

        // Assert
        assert.strictEqual(result.chunks.length, 2);
        assert.strictEqual(result.chunks[0].type, 'function');
        assert.strictEqual(result.chunks[0].startLine, 1);
        assert.strictEqual(result.chunks[0].endLine, 3);
        assert.ok(result.chunks[0].text.includes('validateEmail'));

        assert.strictEqual(result.chunks[1].type, 'function');
        assert.strictEqual(result.chunks[1].startLine, 5);
        assert.strictEqual(result.chunks[1].endLine, 7);
        assert.ok(result.chunks[1].text.includes('validatePassword'));
    });

    test('should chunk TypeScript classes', async () => {
        // Arrange
        const fileContent = `export class AuthManager {
    private users: User[] = [];

    addUser(user: User) {
        this.users.push(user);
    }

    removeUser(id: string) {
        this.users = this.users.filter(u => u.id !== id);
    }
}`;

        sandbox.stub(fs.promises, 'readFile').resolves(fileContent);

        // Act
        const result = await chunker.chunkFile('/test/file.ts');

        // Assert
        assert.strictEqual(result.chunks.length, 1);
        assert.strictEqual(result.chunks[0].type, 'class');
        assert.strictEqual(result.chunks[0].startLine, 1);
        assert.ok(result.chunks[0].text.includes('AuthManager'));
        assert.ok(result.chunks[0].text.includes('addUser'));
        assert.ok(result.chunks[0].text.includes('removeUser'));
    });

    test('should chunk arrow functions', async () => {
        // Arrange
        const fileContent = `export const add = (a: number, b: number) => {
    return a + b;
};

export const multiply = (a: number, b: number) => a * b;`;

        sandbox.stub(fs.promises, 'readFile').resolves(fileContent);

        // Act
        const result = await chunker.chunkFile('/test/file.ts');

        // Assert
        assert.strictEqual(result.chunks.length, 2);
        assert.strictEqual(result.chunks[0].type, 'function');
        assert.ok(result.chunks[0].text.includes('add'));
        assert.strictEqual(result.chunks[1].type, 'function');
        assert.ok(result.chunks[1].text.includes('multiply'));
    });

    test('should chunk Python functions', async () => {
        // Arrange
        const fileContent = `def validate_email(email):
    return "@" in email and "." in email

def validate_password(password):
    return len(password) >= 8`;

        sandbox.stub(fs.promises, 'readFile').resolves(fileContent);

        // Act
        const result = await chunker.chunkFile('/test/file.py');

        // Assert
        assert.strictEqual(result.chunks.length, 2);
        assert.strictEqual(result.chunks[0].type, 'function');
        assert.ok(result.chunks[0].text.includes('validate_email'));
        assert.strictEqual(result.chunks[1].type, 'function');
        assert.ok(result.chunks[1].text.includes('validate_password'));
    });

    test('should chunk Python classes', async () => {
        // Arrange
        const fileContent = `class User:
    def __init__(self, name):
        self.name = name

    def greet(self):
        return f"Hello, {self.name}"`;

        sandbox.stub(fs.promises, 'readFile').resolves(fileContent);

        // Act
        const result = await chunker.chunkFile('/test/file.py');

        // Assert
        assert.strictEqual(result.chunks.length, 1);
        assert.strictEqual(result.chunks[0].type, 'class');
        assert.ok(result.chunks[0].text.includes('User'));
        assert.ok(result.chunks[0].text.includes('__init__'));
        assert.ok(result.chunks[0].text.includes('greet'));
    });

    test('should handle nested braces correctly', async () => {
        // Arrange
        const fileContent = `function complex() {
    if (true) {
        const obj = {
            nested: {
                value: 42
            }
        };
        return obj;
    }
}`;

        sandbox.stub(fs.promises, 'readFile').resolves(fileContent);

        // Act
        const result = await chunker.chunkFile('/test/file.js');

        // Assert
        assert.strictEqual(result.chunks.length, 1);
        assert.strictEqual(result.chunks[0].type, 'function');
        assert.strictEqual(result.chunks[0].startLine, 1);
        assert.strictEqual(result.chunks[0].endLine, 10); // Should include closing brace
    });

    test('should fall back to fixed-size chunking for unknown languages', async () => {
        // Arrange
        const fileContent = `Some content
that is
not in a
recognized programming
language format
and should be
chunked by fixed
size instead of
semantic parsing`;

        sandbox.stub(fs.promises, 'readFile').resolves(fileContent);

        // Act
        const result = await chunker.chunkFile('/test/file.unknown');

        // Assert
        assert.ok(result.chunks.length > 0);
        assert.strictEqual(result.chunks[0].type, 'block');
        assert.strictEqual(result.parseMethod, 'fallback');
    });

    test('should skip very small chunks', async () => {
        // Arrange
        const fileContent = `export function a() { return 1; }

export function veryLongFunctionNameWithLotsOfCode(param1, param2, param3) {
    const result = param1 + param2 + param3;
    console.log("Processing:", result);
    return result * 2;
}`;

        sandbox.stub(fs.promises, 'readFile').resolves(fileContent);

        // Act
        const result = await chunker.chunkFile('/test/file.ts');

        // Assert
        // Should skip first function (too small) and only keep the second
        assert.strictEqual(result.chunks.length, 1);
        assert.ok(result.chunks[0].text.includes('veryLongFunctionNameWithLotsOfCode'));
    });

    test('should create correct chunk IDs', async () => {
        // Arrange
        const fileContent = `function test() {
    return true;
}`;

        sandbox.stub(fs.promises, 'readFile').resolves(fileContent);

        // Act
        const result = await chunker.chunkFile('/test/path/file.ts');

        // Assert
        assert.strictEqual(result.chunks.length, 1);
        assert.strictEqual(result.chunks[0].id, '/test/path/file.ts:1-3');
        assert.strictEqual(result.chunks[0].filePath, '/test/path/file.ts');
    });

    test('should handle interfaces and types', async () => {
        // Arrange
        const fileContent = `export interface User {
    id: string;
    name: string;
}

export type UserRole = 'admin' | 'user';`;

        sandbox.stub(fs.promises, 'readFile').resolves(fileContent);

        // Act
        const result = await chunker.chunkFile('/test/file.ts');

        // Assert
        assert.strictEqual(result.chunks.length, 2);
        assert.strictEqual(result.chunks[0].type, 'interface');
        assert.strictEqual(result.chunks[1].type, 'type');
    });

    test('should handle file read errors', async () => {
        // Arrange
        sandbox.stub(fs.promises, 'readFile').rejects(new Error('File not found'));

        // Act
        const result = await chunker.chunkFile('/test/nonexistent.ts');

        // Assert
        assert.strictEqual(result.chunks.length, 0);
        assert.strictEqual(result.parseSuccess, false);
        assert.ok(result.error);
    });

    test('should handle empty files', async () => {
        // Arrange
        sandbox.stub(fs.promises, 'readFile').resolves('');

        // Act
        const result = await chunker.chunkFile('/test/empty.ts');

        // Assert
        assert.strictEqual(result.chunks.length, 0);
        assert.strictEqual(result.parseSuccess, true);
    });

    test('should process multiple files in batch', async () => {
        // Arrange
        const readStub = sandbox.stub(fs.promises, 'readFile');
        readStub.withArgs('/test/file1.ts').resolves('function test1() { return 1; }');
        readStub.withArgs('/test/file2.ts').resolves('function test2() { return 2; }');

        // Act
        const chunks = await chunker.chunkFiles(['/test/file1.ts', '/test/file2.ts']);

        // Assert
        assert.ok(chunks.length >= 2);
        assert.ok(chunks.some(c => c.text.includes('test1')));
        assert.ok(chunks.some(c => c.text.includes('test2')));
    });
});
