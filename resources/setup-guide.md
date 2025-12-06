# Semantic Grep - Setup Guide

Welcome to Semantic Grep! This guide will help you get started with semantic code search in VSCode.

## Prerequisites

Semantic Grep requires **Ollama** to be installed and running on your machine. Ollama is a local AI runtime that runs the embedding model privately on your computer.

### Step 1: Install Ollama

**Choose your platform:**

#### macOS
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

#### Linux
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

#### Windows
Download the installer from [ollama.ai/download](https://ollama.ai/download)

### Step 2: Verify Ollama is Running

After installation, Ollama should start automatically. Verify it's running:

```bash
ollama --version
```

You should see the version number (e.g., `0.1.17`).

### Step 3: Pull the Embedding Model

Semantic Grep uses the Nomic Embed Text model for generating embeddings. Pull the model:

```bash
ollama pull nomic-embed-text
```

This will download the model (~274MB). Wait for it to complete.

### Step 4: Verify Model Installation

Check that the model is installed:

```bash
ollama list
```

You should see `nomic-embed-text` in the list of installed models.

---

## First-Time Setup in VSCode

### Step 1: Open a Workspace

Open a folder or workspace in VSCode. Semantic Grep works best with code projects.

### Step 2: Check Extension Status

Look at the **status bar** (bottom-right corner). You should see:
- `$(check) Ollama Ready` - Everything is working!
- `$(warning) Model Missing` - Run `ollama pull nomic-embed-text`
- `$(error) Ollama Offline` - Start Ollama or check installation

### Step 3: Index Your Workspace

Before searching, you need to index your code:

1. Open the **Command Palette** (`Cmd/Ctrl+Shift+P`)
2. Run: **"Semantic Grep: Index Workspace"**
3. Wait for indexing to complete (progress shown in status bar)

**Note**: First-time indexing may take 2-5 minutes depending on project size.

### Step 4: Start Searching

Press `Cmd/Ctrl+Shift+F` (or run "Semantic Grep: Search Code") and enter your query:

**Example queries:**
- `"function that validates email addresses"`
- `"database connection logic"`
- `"error handling for API requests"`

Select a result to jump to that code!

---

## Troubleshooting

### "Ollama Offline" Error

**Possible causes:**
1. Ollama is not installed
2. Ollama is not running
3. Ollama is running on a different port

**Solutions:**
1. Install Ollama (see Step 1 above)
2. Start Ollama: `ollama serve`
3. Check if Ollama is running: `curl http://localhost:11434/api/tags`

### "Model Missing" Warning

**Cause**: Nomic Embed Text model is not installed

**Solution**:
```bash
ollama pull nomic-embed-text
```

### Indexing is Slow

**Tips:**
1. Exclude large folders (node_modules, dist, build) in settings
2. Reduce `semanticSearch.maxFileSize` to skip very large files
3. Close resource-heavy applications
4. Check Ollama is not busy with other tasks

### Search Returns No Results

**Possible causes:**
1. Workspace is not indexed
2. Query is too specific or uses wrong terminology
3. Relevant code is excluded by patterns

**Solutions:**
1. Run "Semantic Grep: Index Workspace"
2. Try different query phrasing (e.g., "email validation" instead of "validateEmail")
3. Check `semanticSearch.excludePatterns` in settings

### Extension Won't Activate

**Checklist:**
1. VSCode version 1.85.0 or higher
2. Ollama is running: `ollama list`
3. Model is installed: `ollama list` shows `nomic-embed-text`
4. Check extension logs: Open Output panel → "Semantic Grep"

---

## Configuration

### Open Settings

1. Open VSCode Settings (`Cmd/Ctrl+,`)
2. Search for "Semantic Grep"

### Key Settings

**Ollama URL** (default: `http://localhost:11434`)
- Change if Ollama is running on a different port

**Model Name** (default: `nomic-embed-text`)
- Don't change unless you know what you're doing

**Chunk Size** (default: 500)
- Larger = more context, slower indexing
- Smaller = faster indexing, less context

**Max File Size** (default: 100KB)
- Files larger than this are skipped during indexing
- Increase if you have large source files

**Exclude Patterns** (default: node_modules, dist, build, .git)
- Add more patterns to skip unwanted files
- Example: `**/test/**` to exclude test files

**Auto Index** (default: true)
- Automatically index workspace on open
- Disable if you prefer manual control

---

## Privacy & Security

**100% Local Processing:**
- Ollama runs entirely on your machine
- No cloud API calls, no external connections
- Your code never leaves your computer

**Data Storage:**
- Index stored in `.vscode/.semantic-grep/` in your workspace
- Automatically excluded from git
- Can be cleared anytime with "Clear Cache" command

**No Telemetry:**
- No usage tracking, no analytics
- No data sent to any server

---

## Getting Help

### View Logs
1. Open Output panel: `View → Output`
2. Select "Semantic Grep" from dropdown
3. Check for error messages

### Check Ollama Status
Run command: "Semantic Grep: Check Ollama Status"

### Common Commands
- **Search Code**: `Cmd/Ctrl+Shift+F`
- **Index Workspace**: Command Palette → "Semantic Grep: Index Workspace"
- **Clear Cache**: Command Palette → "Semantic Grep: Clear Cache"
- **Check Health**: Command Palette → "Semantic Grep: Check Ollama Status"

---

## Next Steps

1. **Index your workspace** (first time only)
2. **Try a search** - Press `Cmd/Ctrl+Shift+F`
3. **Explore settings** to customize behavior
4. **Check status bar** to monitor connection and index status

Enjoy semantic code search!
