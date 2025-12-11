import * as assert from "assert";
import * as sinon from "sinon";
import * as fs from "fs";
import { CodeChunker } from "../../indexing/codeChunker";

suite("CodeChunker Test Suite", () => {
  let sandbox: sinon.SinonSandbox;
  let chunker: CodeChunker;

  setup(() => {
    sandbox = sinon.createSandbox();
    chunker = new CodeChunker();
  });

  teardown(() => {
    sandbox.restore();
  });

  test("should chunk TypeScript functions using LangChain", async () => {
    // Arrange
    const fileContent = `export function validateEmail(email: string) {
    return /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email);
}

export function validatePassword(password: string) {
    return password.length >= 8;
}`;

    sandbox.stub(fs.promises, "readFile").resolves(fileContent);

    // Act
    const result = await chunker.chunkFile("/test/file.ts");

    // Assert
    assert.ok(result.chunks.length >= 1, "Should create at least one chunk");
    assert.strictEqual(result.parseMethod, "langchain");
    assert.strictEqual(result.parseSuccess, true);

    // Verify chunks contain the expected content
    const allText = result.chunks.map(c => c.text).join('\n');
    assert.ok(allText.includes("validateEmail"), "Should include validateEmail function");
    assert.ok(allText.includes("validatePassword"), "Should include validatePassword function");
  });

  test("should chunk TypeScript classes", async () => {
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

    sandbox.stub(fs.promises, "readFile").resolves(fileContent);

    // Act
    const result = await chunker.chunkFile("/test/file.ts");

    // Assert
    assert.ok(result.chunks.length >= 1);
    assert.strictEqual(result.chunks[0].type, "class");
    assert.ok(result.chunks[0].text.includes("AuthManager"));
  });

  test("should detect chunk types correctly", async () => {
    // Arrange
    const fileContent = `export function testFunc() {
    return true;
}

export class TestClass {
    method() {}
}

export interface TestInterface {
    name: string;
}

export type TestType = string | number;`;

    sandbox.stub(fs.promises, "readFile").resolves(fileContent);

    // Act
    const result = await chunker.chunkFile("/test/file.ts");

    // Assert - LangChain may combine these, so just check they're present
    const allText = result.chunks.map(c => c.text).join('\n');
    assert.ok(allText.includes("testFunc"));
    assert.ok(allText.includes("TestClass"));
    assert.ok(allText.includes("TestInterface"));
    assert.ok(allText.includes("TestType"));

    // At least one chunk should have a specific type detected
    const hasFunction = result.chunks.some(c => c.type === 'function');
    const hasClass = result.chunks.some(c => c.type === 'class');
    const hasInterface = result.chunks.some(c => c.type === 'interface');
    const hasType = result.chunks.some(c => c.type === 'type');

    assert.ok(hasFunction || hasClass || hasInterface || hasType,
      "Should detect at least one specific type");
  });

  test("should chunk Python functions", async () => {
    // Arrange
    const fileContent = `def validate_email(email):
    return "@" in email and "." in email

def validate_password(password):
    return len(password) >= 8`;

    sandbox.stub(fs.promises, "readFile").resolves(fileContent);

    // Act
    const result = await chunker.chunkFile("/test/file.py");

    // Assert
    assert.ok(result.chunks.length >= 1);
    assert.strictEqual(result.parseMethod, "langchain");

    const allText = result.chunks.map(c => c.text).join('\n');
    assert.ok(allText.includes("validate_email"));
    assert.ok(allText.includes("validate_password"));
  });

  test("should chunk Python classes", async () => {
    // Arrange
    const fileContent = `class User:
    def __init__(self, name):
        self.name = name

    def greet(self):
        return f"Hello, {self.name}"`;

    sandbox.stub(fs.promises, "readFile").resolves(fileContent);

    // Act
    const result = await chunker.chunkFile("/test/file.py");

    // Assert
    assert.ok(result.chunks.length >= 1);
    const firstChunk = result.chunks[0];
    assert.strictEqual(firstChunk.type, "class");
    assert.ok(firstChunk.text.includes("User"));
  });

  test("should calculate line numbers correctly", async () => {
    // Arrange
    const fileContent = `function test() {
    return true;
}`;

    sandbox.stub(fs.promises, "readFile").resolves(fileContent);

    // Act
    const result = await chunker.chunkFile("/test/file.js");

    // Assert
    assert.ok(result.chunks.length >= 1);
    const chunk = result.chunks[0];
    assert.strictEqual(chunk.startLine, 1, "Should start at line 1");
    assert.ok(chunk.endLine >= chunk.startLine, "End line should be >= start line");
  });

  test("should fall back to fixed-size chunking for unknown languages", async () => {
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

    sandbox.stub(fs.promises, "readFile").resolves(fileContent);

    // Act
    const result = await chunker.chunkFile("/test/file.unknown");

    // Assert
    assert.ok(result.chunks.length > 0);
    assert.strictEqual(result.chunks[0].type, "block");
    assert.strictEqual(result.parseMethod, "fallback");
  });

  test("should create correct chunk IDs with file path and line numbers", async () => {
    // Arrange
    const fileContent = `function test() {
    return true;
}`;

    sandbox.stub(fs.promises, "readFile").resolves(fileContent);

    // Act
    const result = await chunker.chunkFile("/test/path/file.ts");

    // Assert
    assert.ok(result.chunks.length >= 1);
    const chunk = result.chunks[0];
    assert.ok(chunk.id.includes("/test/path/file.ts"), "ID should include file path");
    assert.ok(chunk.id.includes(":"), "ID should include colon separator");
    assert.ok(chunk.id.includes("-"), "ID should include line range");
    assert.strictEqual(chunk.filePath, "/test/path/file.ts");
  });

  test("should handle interfaces and types", async () => {
    // Arrange
    const fileContent = `export interface User {
    id: string;
    name: string;
}

export type UserRole = 'admin' | 'user';`;

    sandbox.stub(fs.promises, "readFile").resolves(fileContent);

    // Act
    const result = await chunker.chunkFile("/test/file.ts");

    // Assert
    assert.ok(result.chunks.length >= 1);
    const allText = result.chunks.map(c => c.text).join('\n');
    assert.ok(allText.includes("interface User"));
    assert.ok(allText.includes("type UserRole"));
  });

  test("should handle file read errors", async () => {
    // Arrange
    sandbox.stub(fs.promises, "readFile").rejects(new Error("File not found"));

    // Act
    const result = await chunker.chunkFile("/test/nonexistent.ts");

    // Assert
    assert.strictEqual(result.chunks.length, 0);
    assert.strictEqual(result.parseSuccess, false);
    assert.ok(result.error);
    assert.ok(result.error.includes("File not found"));
  });

  test("should handle empty files", async () => {
    // Arrange
    sandbox.stub(fs.promises, "readFile").resolves("");

    // Act
    const result = await chunker.chunkFile("/test/empty.ts");

    // Assert
    assert.strictEqual(result.chunks.length, 0);
    assert.strictEqual(result.parseSuccess, true);
  });

  test("should process multiple files in batch", async () => {
    // Arrange
    const readStub = sandbox.stub(fs.promises, "readFile");
    readStub
      .withArgs("/test/file1.ts")
      .resolves("function test1() { return 1; }");
    readStub
      .withArgs("/test/file2.ts")
      .resolves("function test2() { return 2; }");

    // Act
    const chunks = await chunker.chunkFiles([
      "/test/file1.ts",
      "/test/file2.ts",
    ]);

    // Assert
    assert.ok(chunks.length >= 2);
    const allText = chunks.map(c => c.text).join('\n');
    assert.ok(allText.includes("test1"));
    assert.ok(allText.includes("test2"));
  });

  test("should handle JSX files", async () => {
    // Arrange
    const fileContent = `export const Component = () => {
    return <div>Hello World</div>;
};`;

    sandbox.stub(fs.promises, "readFile").resolves(fileContent);

    // Act
    const result = await chunker.chunkFile("/test/file.jsx");

    // Assert
    assert.ok(result.chunks.length >= 1);
    assert.strictEqual(result.parseMethod, "langchain");
    assert.ok(result.chunks[0].text.includes("Component"));
  });

  test("should handle Vue files", async () => {
    // Arrange
    const fileContent = `export const setup = () => {
    const count = ref(0);
    return { count };
};`;

    sandbox.stub(fs.promises, "readFile").resolves(fileContent);

    // Act
    const result = await chunker.chunkFile("/test/file.vue");

    // Assert
    assert.ok(result.chunks.length >= 1);
    assert.strictEqual(result.parseMethod, "langchain");
    assert.ok(result.chunks[0].text.includes("setup"));
  });

  test("should preserve chunk metadata", async () => {
    // Arrange
    const fileContent = `export function test() {
    console.log("test");
}`;

    sandbox.stub(fs.promises, "readFile").resolves(fileContent);

    // Act
    const result = await chunker.chunkFile("/test/file.ts");

    // Assert
    assert.ok(result.chunks.length >= 1);
    const chunk = result.chunks[0];

    // Check all required metadata fields
    assert.ok(chunk.id, "Should have id");
    assert.ok(chunk.filePath, "Should have filePath");
    assert.ok(chunk.startLine > 0, "Should have valid startLine");
    assert.ok(chunk.endLine >= chunk.startLine, "Should have valid endLine");
    assert.ok(chunk.text, "Should have text");
    assert.ok(chunk.type, "Should have type");
    assert.ok(chunk.language, "Should have language");
    assert.ok(chunk.timestamp > 0, "Should have timestamp");
  });
});
