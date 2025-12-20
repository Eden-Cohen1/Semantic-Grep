import * as vscode from "vscode";
import { ChunkerFactory } from "../indexing/chunkers/ChunkerFactory";
import { countTokens } from "../indexing/chunkers/treeSitter/tokenCounter";
import { ASTCodeParser } from "../indexing/chunkers/treeSitter/ASTCodeParser";
import * as path from "path";
import * as fs from "fs";

/**
 * Command to test the Chunker on files in the workspace
 * Usage: Run "Semantic Grep: Test Chunker on Current File" from command palette
 */
export async function testChunkerCommand(uri?: vscode.Uri) {

  // Get the file to test
  let fileUri: vscode.Uri | undefined = uri;

  if (!fileUri) {
    // If not called with a URI, try to get the active editor
    const editor = vscode.window.activeTextEditor;
    if (editor) {
      fileUri = editor.document.uri;
    }
  }

  if (!fileUri) {
    vscode.window.showErrorMessage(
      "No file selected. Please open a file first."
    );
    return;
  }

  const filePath = fileUri.fsPath;
  const fileName = path.basename(filePath);

  // Show progress
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: `Chunking ${fileName}...`,
      cancellable: false,
    },
    async (progress) => {
      // Get appropriate chunker for this file
      const chunker = ChunkerFactory.getChunker(filePath);

      try {
        const result = await chunker.chunkFile(filePath);

        // Create output channel to show results
        const output = vscode.window.createOutputChannel(
          "Chunker Test Results"
        );
        output.clear();
        output.show();

        output.appendLine("=".repeat(80));
        output.appendLine(`📄 File: ${fileName}`);
        output.appendLine(`📍 Path: ${filePath}`);
        output.appendLine("=".repeat(80));
        output.appendLine("");

        // Read file to get total size info
        const fileContent = await fs.promises.readFile(filePath, "utf-8");
        const fileLines = fileContent.split("\n").length;
        const fileChars = fileContent.length;
        const fileTokens = countTokens(fileContent);

        output.appendLine(`📏 File Size:`);
        output.appendLine(`   Lines:      ${fileLines}`);
        output.appendLine(`   Characters: ${fileChars}`);
        output.appendLine(`   Tokens:     ${fileTokens} (estimated)`);
        output.appendLine("");

        // Debug: Show detected breakpoints
        const ext = path.extname(filePath).slice(1).toLowerCase();
        const parser = new ASTCodeParser();
        const breakpoints = await parser.getLinesForPointsOfInterest(fileContent, ext);
        const nodeTypes = await parser.debugNodeTypes(fileContent, ext);
        parser.dispose();

        output.appendLine(`🔍 Debug - AST Node Types (top-level):`);
        nodeTypes.forEach(nt => output.appendLine(`   ${nt}`));
        output.appendLine("");
        output.appendLine(`🎯 Detected Breakpoints (0-indexed lines): [${breakpoints.join(", ")}]`);
        output.appendLine("");

        output.appendLine(`📦 Chunking Results:`);
        output.appendLine(`   Chunks found: ${result.chunks.length}`);
        output.appendLine(`   Parse method: ${result.parseMethod}`);
        output.appendLine(`   Parse success: ${result.parseSuccess}`);
        output.appendLine(`   Chunker used: ${chunker.getName()}`);
        output.appendLine(`   Method: Cintra-style (breakpoint-based)`);

        if (result.error) {
          output.appendLine(`❌ Error: ${result.error}`);
          return;
        }

        output.appendLine("");
        output.appendLine("📊 Chunk Details:");
        output.appendLine("=".repeat(80));

        // Group chunks by type
        const chunksByType: { [key: string]: number } = {};
        result.chunks.forEach((chunk) => {
          chunksByType[chunk.type] = (chunksByType[chunk.type] || 0) + 1;
        });

        output.appendLine("");
        output.appendLine("Chunks by type:");
        Object.entries(chunksByType)
          .sort((a, b) => b[1] - a[1])
          .forEach(([type, count]) => {
            output.appendLine(`  ${type.padEnd(12)}: ${count}`);
          });

        output.appendLine("");
        output.appendLine("Individual chunks:");
        output.appendLine("");

        result.chunks.forEach((chunk, idx) => {
          const chunkLines = chunk.text.split("\n").length;
          const chunkTokens = countTokens(chunk.text);

          output.appendLine(`Chunk ${idx + 1}/${result.chunks.length}:`);
          output.appendLine(`  Type:       ${chunk.type}`);
          output.appendLine(`  Lines:      ${chunk.startLine}-${chunk.endLine} (${chunkLines} lines)`);
          output.appendLine(`  Characters: ${chunk.text.length}`);
          output.appendLine(`  Tokens:     ${chunkTokens} (estimated)`);
          output.appendLine(`  ID:         ${chunk.id}`);
          output.appendLine(`  Preview:`);

          // Show first 5 lines of the chunk
          const lines = chunk.text.split("\n").slice(0, 5);
          lines.forEach((line) => {
            output.appendLine(`    ${line}`);
          });

          if (chunk.text.split("\n").length > 5) {
            output.appendLine(
              `    ... (${chunk.text.split("\n").length - 5} more lines)`
            );
          }

          output.appendLine("");
        });

        output.appendLine("=".repeat(80));
        output.appendLine(
          `✅ Chunking complete! Found ${result.chunks.length} chunks.`
        );
        output.appendLine("=".repeat(80));

        vscode.window.showInformationMessage(
          `Found ${result.chunks.length} chunks in ${fileName}`
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Error chunking file: ${errorMsg}`);
      }
    }
  );
}

/**
 * Command to test the chunker on multiple files in the workspace
 */
export async function testChunkerOnWorkspace() {
  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

  if (!workspaceFolder) {
    vscode.window.showErrorMessage("No workspace folder open");
    return;
  }

  // Find source code files, excluding third-party and generated code
  const files = await vscode.workspace.findFiles(
    "**/*.{ts,tsx,js,jsx,py,vue}",
    "{**/node_modules/**,**/dist/**,**/build/**,**/out/**,**/.git/**,**/coverage/**,**/.next/**,**/.nuxt/**,**/.cache/**,**/vendor/**,**/venv/**,**/.venv/**,**/env/**,**/.vscode/**,**/.idea/**,**/.vs/**,**/*.min.js,**/*.bundle.js,**/webpack.config.*,**/vite.config.*,**/rollup.config.*,**/next.config.*,**/tailwind.config.*,**/*config.js,**/*config.ts,**/package.json,**/package-lock.json,**/yarn.lock,**/pnpm-lock.yaml,**/tsconfig.json}",
    100 // Limit to 100 files to avoid huge output files
  );

  if (files.length === 0) {
    vscode.window.showWarningMessage("No TypeScript or JavaScript files found");
    return;
  }

  const output = vscode.window.createOutputChannel("Chunker Workspace Test");
  output.clear();
  output.show();

  output.appendLine("🔍 Testing Chunker on workspace files");
  output.appendLine("=".repeat(80));
  output.appendLine("");

  let totalChunks = 0;
  const chunksByType: { [key: string]: number } = {};
  const allChunks: any[] = [];

  for (const file of files) {
    const fileName = path.basename(file.fsPath);
    output.appendLine(`Processing: ${fileName}...`);

    // Get appropriate chunker for this file
    const chunker = ChunkerFactory.getChunker(file.fsPath);

    try {
      const result = await chunker.chunkFile(file.fsPath);
      totalChunks += result.chunks.length;

      result.chunks.forEach((chunk) => {
        chunksByType[chunk.type] = (chunksByType[chunk.type] || 0) + 1;
        allChunks.push(chunk);
      });

      output.appendLine(`  ✓ Found ${result.chunks.length} chunks (${chunker.getName()})`);
    } catch (error) {
      output.appendLine(`  ✗ Error: ${error}`);
    }
  }

  output.appendLine("");
  output.appendLine("=".repeat(80));
  output.appendLine("📊 Summary Statistics");
  output.appendLine("=".repeat(80));
  output.appendLine("");
  output.appendLine(`Files processed: ${files.length}`);
  output.appendLine(`Total chunks: ${totalChunks}`);
  output.appendLine(
    `Average chunks per file: ${(totalChunks / files.length).toFixed(1)}`
  );
  output.appendLine("");
  output.appendLine("Chunks by type:");
  Object.entries(chunksByType)
    .sort((a, b) => b[1] - a[1])
    .forEach(([type, count]) => {
      const bar = "█".repeat(Math.ceil(count / 5));
      output.appendLine(
        `  ${type.padEnd(12)}: ${count.toString().padStart(4)} ${bar}`
      );
    });

  // Save chunks to JSON file
  const outputFilePath = path.join(
    workspaceFolder.uri.fsPath,
    "chunks-output.json"
  );
  const outputData = {
    metadata: {
      timestamp: new Date().toISOString(),
      filesProcessed: files.length,
      totalChunks: totalChunks,
      averageChunksPerFile: (totalChunks / files.length).toFixed(1),
      chunksByType: Object.fromEntries(
        Object.entries(chunksByType).sort((a, b) => b[1] - a[1])
      ),
    },
    chunks: allChunks,
  };

  try {
    await fs.promises.writeFile(
      outputFilePath,
      JSON.stringify(outputData, null, 2),
      "utf-8"
    );

    output.appendLine("");
    output.appendLine("=".repeat(80));
    output.appendLine(`💾 Saved chunks to: ${outputFilePath}`);
    output.appendLine("=".repeat(80));
    output.appendLine("");
    output.appendLine(
      "Note: File not auto-opened (may be large). Open manually if needed."
    );

    // Show file location in explorer
    await vscode.commands.executeCommand(
      "revealFileInOS",
      vscode.Uri.file(outputFilePath)
    );

    vscode.window.showInformationMessage(
      `Processed ${files.length} files, found ${totalChunks} chunks. Saved to chunks-output.json (${(
        JSON.stringify(outputData).length /
        1024 /
        1024
      ).toFixed(1)}MB)`
    );
  } catch (error) {
    output.appendLine(`❌ Error saving file: ${error}`);
    vscode.window.showErrorMessage(`Failed to save chunks: ${error}`);
  }
}
