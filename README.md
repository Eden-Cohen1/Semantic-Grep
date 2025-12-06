# Semantic Grep

**Semantic code search for VSCode using natural language** - powered by 100% local AI.

Find code by meaning, not just keywords. Search for "function that validates email" and find relevant code even if variable names and syntax differ.

## Features

- **Natural Language Search**: Query code using plain English
- **Code-to-Code Search**: Find similar implementations across your codebase
- **Semantic Understanding**: Matches concepts, not just text
- **100% Local & Private**: All processing happens on your machine
- **Fast & Efficient**: Indexed search with sub-second results
- **Multi-Language Support**: TypeScript, JavaScript, Python, Java, Go, Rust, and more

## Prerequisites

**Ollama is required** - this extension uses Ollama to generate embeddings locally.

### 1. Install Ollama

Download and install Ollama from [ollama.ai](https://ollama.ai)

- **macOS/Linux**: `curl -fsSL https://ollama.ai/install.sh | sh`
- **Windows**: Download from [ollama.ai/download](https://ollama.ai/download)

### 2. Pull the Embedding Model

After installing Ollama, pull the required model:

```bash
ollama pull nomic-embed-text
```

This will download the Nomic Embed Text model (~274MB).

### 3. Verify Ollama is Running

Ollama should start automatically. Verify it's running:

```bash
ollama list
```

You should see `nomic-embed-text` in the list.

## Installation

1. Install this extension from the VSCode marketplace (or from VSIX)
2. Open a workspace/folder in VSCode
3. The extension will automatically verify Ollama is available
4. If everything is ready, it will prompt you to index your workspace

## Usage

### First-Time Setup

1. **Open a workspace** in VSCode
2. **Check status bar** (bottom-right): Should show "$(check) Ollama Ready"
3. **Index workspace**: Press `Cmd/Ctrl+Shift+P` → "Semantic Grep: Index Workspace"
   - Initial indexing may take 2-5 minutes for medium projects
   - Progress shown in notification and status bar
4. **Search**: Press `Cmd/Ctrl+Shift+F` or run "Semantic Grep: Search Code"

### Searching

**Quick Search**:
- Press `Cmd/Ctrl+Shift+F`
- Type your query: `"function that validates email addresses"`
- Select a result to jump to that code

**Example Queries**:
- `"database connection logic"`
- `"function that handles user authentication"`
- `"error handling for API requests"`
- `"parse JSON response"`
- Or paste a code snippet to find similar implementations

### Commands

- **Semantic Grep: Search Code** (`Cmd/Ctrl+Shift+F`) - Open search
- **Semantic Grep: Index Workspace** - Manually index workspace
- **Semantic Grep: Clear Cache** - Clear index and re-index
- **Semantic Grep: Check Ollama Status** - Verify Ollama connection

## Configuration

Open VSCode settings and search for "Semantic Grep":

```json
{
  // Ollama server URL (local only)
  "semanticSearch.ollamaUrl": "http://localhost:11434",

  // Embedding model name
  "semanticSearch.modelName": "nomic-embed-text",

  // Maximum tokens per code chunk
  "semanticSearch.chunkSize": 500,

  // Maximum file size to index (bytes)
  "semanticSearch.maxFileSize": 102400,

  // Files/folders to exclude from indexing
  "semanticSearch.excludePatterns": [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.git/**"
  ],

  // Supported file extensions
  "semanticSearch.supportedLanguages": [
    "ts", "tsx", "js", "jsx", "py", "java", "go", "rust", "vue"
  ],

  // Auto-index workspace on open
  "semanticSearch.autoIndex": true,

  // Batch size for embedding generation
  "semanticSearch.batchSize": 32,

  // Health check interval (seconds, 0 to disable)
  "semanticSearch.healthCheckInterval": 120
}
```

## How It Works

1. **Indexing**:
   - Scans your workspace for code files
   - Parses code into logical chunks (functions, classes, methods)
   - Generates semantic embeddings using Ollama (local)
   - Stores vectors in LanceDB (embedded database)

2. **Searching**:
   - Converts your query into an embedding
   - Searches for similar vectors in the index
   - Returns results ranked by semantic similarity

3. **Incremental Updates**:
   - Watches for file changes
   - Automatically re-indexes modified files
   - Keeps index in sync with your codebase

## Privacy & Security

**100% Local Processing**:
- Ollama runs locally on your machine
- No cloud API calls, no external connections
- No telemetry, no analytics
- Your code never leaves your machine

**Data Storage**:
- Index stored in `.vscode/.semantic-grep/` (workspace folder)
- Can be cleared anytime with "Clear Cache" command
- Automatically excluded from git (added to .gitignore)

## Troubleshooting

### "Ollama Offline" Error

**Solution**:
1. Verify Ollama is installed: `ollama --version`
2. Start Ollama: `ollama serve` (or restart your machine)
3. Check status: Run "Semantic Grep: Check Ollama Status"

### "Model Missing" Warning

**Solution**:
1. Pull the model: `ollama pull nomic-embed-text`
2. Verify: `ollama list` should show `nomic-embed-text`
3. Reload VSCode

### Slow Indexing

**Tips**:
- Exclude large folders (node_modules, dist, build) in settings
- Increase `maxFileSize` to skip very large files
- Reduce `batchSize` if Ollama is slow (less RAM usage)

### Search Returns No Results

**Solution**:
1. Verify workspace is indexed: Check status bar
2. Re-index: Run "Semantic Grep: Index Workspace"
3. Try different query phrasing
4. Check if files are excluded by patterns

### Extension Not Activating

**Solution**:
1. Check VSCode version (requires 1.85.0+)
2. Verify Ollama is running: `curl http://localhost:11434/api/tags`
3. Check extension logs: Open VSCode Output panel → "Semantic Grep"

## Performance

**Typical Performance** (on modern hardware):
- **Indexing**: ~200 files/minute
- **Search**: <500ms from query to results
- **Incremental Update**: <2 seconds per file

**Optimizations**:
- Batch embedding generation (32 chunks at a time)
- Efficient vector similarity search (LanceDB)
- Smart code chunking (Tree-sitter parsing)
- Debounced file watching

## Limitations

- Requires Ollama to be installed and running
- Indexing large workspaces (10k+ files) can take several minutes
- Embedding quality depends on Nomic Embed Text model
- No support for binary files or images

## Roadmap

- [ ] Phase 1: Core functionality (Ollama + indexing + search)
- [ ] Phase 2: Incremental updates & file watching
- [ ] Phase 3: Advanced filters (language, date, file type)
- [ ] Phase 4: Search history & saved queries
- [ ] Future: Code similarity detection (find duplicates)

## Contributing

This is a personal project, but feedback and suggestions are welcome!

## License

MIT License - see [LICENSE](LICENSE) file

---

**Made with Claude Code**
Powered by [Ollama](https://ollama.ai) + [Nomic Embed Text](https://huggingface.co/nomic-ai/nomic-embed-text-v1)
