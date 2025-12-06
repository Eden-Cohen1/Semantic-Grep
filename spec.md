# Semantic Grep VSCode Extension - Project Specification

## Project Overview
A VSCode extension that enables semantic search across codebases using the Nomic Embed Text model via Ollama. Users can search for code using natural language queries or code snippets, finding semantically similar code even when variable names or exact syntax differ.

## Prerequisites
- **Ollama installed and running** (Required)
- **Nomic Embed Text model**: `ollama pull nomic-embed-text`
- VSCode 1.85.0 or higher
- At least 4GB RAM available

## Core Features

### 1. Semantic Code Search
- Natural language queries: "function that validates email addresses"
- Code-to-code search: Find similar implementations
- Cross-file search across entire workspace
- Support for multiple programming languages
- Results ranked by semantic similarity with scores

### 2. Code Indexing
- Automatic workspace indexing on startup (with user confirmation)
- Incremental indexing on file changes
- Smart code chunking at function/class level using Tree-sitter
- Fallback to fixed-size chunks when parsing fails
- Progress indication during indexing
- Respect .gitignore and configurable exclusions

### 3. Ollama Integration
- Health check on extension activation
- Verify Ollama is running and accessible
- Verify nomic-embed-text model is installed
- Clear error messages with setup instructions if unavailable
- Batch embedding generation (32 chunks at a time)
- Retry logic with exponential backoff for failed requests
- Connection status in status bar

### 4. User Interface
- Command palette integration
- Quick pick results with preview and similarity scores
- Navigate to result on selection
- Syntax-highlighted code previews
- Status bar showing: connection status, index progress, number of indexed chunks
- Keyboard shortcut: Cmd/Ctrl+Shift+F for search

### 5. Performance Optimizations
- Batch processing for embedding generation
- Debounced file watching for incremental updates
- Configurable chunk size and batch size
- Memory-efficient processing for large codebases
- Only index files under configurable size limit (default 100KB)

## Technical Architecture

### Tech Stack
- **Language**: TypeScript
- **Extension API**: VSCode Extension API
- **Embedding Model**: Nomic Embed Text (768-dimensional vectors)
- **Model Runtime**: Ollama (required dependency)
- **Vector Database**: LanceDB (embedded, file-based)
- **Code Parsing**: Tree-sitter for intelligent chunking
- **Build Tool**: esbuild

### Project Structure
```
semantic-code-search/
├── src/
│   ├── extension.ts              # Extension entry point
│   ├── commands/
│   │   ├── searchCommand.ts      # Search command handler
│   │   ├── indexCommand.ts       # Indexing command handler
│   │   └── clearCacheCommand.ts  # Cache management
│   ├── indexing/
│   │   ├── indexer.ts            # Main indexing orchestrator
│   │   ├── codeChunker.ts        # Code chunking logic (Tree-sitter)
│   │   ├── fileScanner.ts        # Workspace file discovery
│   │   └── embeddingGenerator.ts # Batch embedding generation
│   ├── search/
│   │   ├── searcher.ts           # Search orchestrator
│   │   ├── vectorStore.ts        # LanceDB wrapper
│   │   └── resultRanker.ts       # Result ranking/filtering
│   ├── ui/
│   │   ├── searchView.ts         # Quick pick results display
│   │   ├── statusBar.ts          # Status bar integration
│   │   └── welcomeView.ts        # First-time setup guidance
│   ├── ollama/
│   │   ├── ollamaClient.ts       # Ollama API client
│   │   ├── healthCheck.ts        # Connection and model verification
│   │   └── batchProcessor.ts     # Batch embedding optimization
│   └── utils/
│       ├── config.ts             # Extension configuration
│       ├── logger.ts             # Logging utilities
│       └── cache.ts              # Cache management
├── resources/
│   └── setup-guide.md            # User setup instructions
├── package.json
├── tsconfig.json
└── README.md
```

## Implementation Phases

### Phase 1: Foundation & Ollama Integration
**Goal**: Verify Ollama is available and ready

- Extension activation with Ollama health check
- Check if Ollama is running at http://localhost:11434
- Verify nomic-embed-text model is installed
- Show setup instructions if dependencies missing
- Create Ollama client wrapper for embedding API
- Implement batch processing for embeddings
- Add retry logic for failed requests
- Status bar showing connection state
- Register commands in package.json

**Success Criteria**:
- Extension only activates if Ollama is available
- Clear error messages guide users to setup
- Status bar shows Ollama connection status

### Phase 2: Code Indexing
**Goal**: Build and store vector embeddings for workspace code

- Scan workspace files respecting exclusions
- Parse code files using Tree-sitter (TypeScript, JavaScript, Python, etc.)
- Extract functions, classes, methods as chunks
- Fallback to fixed-size chunking if parsing fails
- Generate embeddings via Ollama in batches
- Store in LanceDB with metadata (file path, line numbers, language, type)
- Show progress notification during indexing
- Handle large workspaces efficiently

**Success Criteria**:
- Index 1,000 files in under 5 minutes
- Progress shown to user
- All chunks stored with proper metadata

### Phase 3: Search Implementation
**Goal**: Enable semantic search with natural language queries

- Accept search query via input box
- Generate query embedding via Ollama
- Perform vector similarity search in LanceDB (cosine similarity)
- Return top 20 results with similarity scores
- Display in Quick Pick with file, line, and preview
- Navigate to selected result in editor
- Highlight the relevant code section

**Success Criteria**:
- Search completes in under 500ms
- Results are relevant and ranked by similarity
- Navigation works smoothly

### Phase 4: Incremental Indexing & Polish
**Goal**: Keep index up-to-date and improve UX

- Watch file changes (create, update, delete)
- Debounce updates (1 second delay)
- Re-index only changed files
- Remove deleted files from index
- Add keyboard shortcuts
- Improve error handling
- Add command to manually re-index workspace
- Add command to clear cache

**Success Criteria**:
- File changes reflected in index within 2 seconds
- No performance impact during editing
- All edge cases handled gracefully

## Data Models

### Code Chunk
- `id`: Unique identifier (filepath:startLine-endLine)
- `filePath`: Absolute path to file
- `startLine`: Starting line number
- `endLine`: Ending line number
- `text`: Raw code text
- `type`: function | class | method | block
- `language`: File language/extension
- `vector`: 768-dimensional embedding array
- `timestamp`: Index time

### Search Result
- All Code Chunk fields
- `similarity`: Similarity score (0-1)
- `_distance`: Distance metric from LanceDB

## Configuration Options

### Extension Settings
- `semanticSearch.ollamaUrl`: Ollama server URL (default: http://localhost:11434)
- `semanticSearch.modelName`: Embedding model name (default: nomic-embed-text)
- `semanticSearch.chunkSize`: Max tokens per chunk (default: 500)
- `semanticSearch.maxFileSize`: Max file size to index in bytes (default: 102400)
- `semanticSearch.excludePatterns`: Glob patterns to exclude (default: node_modules, dist, build, .git)
- `semanticSearch.supportedLanguages`: File extensions to index (default: ts, js, py, java, go, rust, vue)
- `semanticSearch.autoIndex`: Auto-index on workspace open (default: true)
- `semanticSearch.batchSize`: Batch size for embeddings (default: 32)

### Commands
- `semanticSearch.search`: Open search interface (Ctrl/Cmd+Shift+F)
- `semanticSearch.indexWorkspace`: Manually index workspace
- `semanticSearch.clearCache`: Clear all cached data
- `semanticSearch.checkHealth`: Check Ollama status

## Error Handling

### Ollama Not Available
- Show error message: "Semantic Grep requires Ollama to be running"
- Provide buttons: "Install Ollama" | "Open Setup Guide"
- Do not activate extension
- Update status bar to show offline state

### Model Not Installed
- Show warning: "Nomic Embed Text model not found"
- Provide buttons: "Pull Model" | "Show Command"
- Open terminal and run: `ollama pull nomic-embed-text`

### Connection Lost During Operation
- Catch fetch errors gracefully
- Show notification: "Lost connection to Ollama"
- Pause indexing if in progress
- Allow user to retry or cancel

### File System Errors
- Log errors for files that can't be read
- Continue indexing other files
- Show summary of skipped files

## Performance Targets

- **Initial indexing**: 10,000 code chunks in under 5 minutes (with GPU)
- **Search latency**: Under 500ms from query to results
- **Incremental update**: File changes indexed within 2 seconds
- **Memory usage**: Under 500MB during indexing
- **Extension size**: Under 10MB (excluding node_modules)

## Testing Strategy

### Unit Tests
- Ollama health check logic
- Code chunking with Tree-sitter
- Batch embedding processing
- Vector similarity calculations

### Integration Tests
- Full indexing workflow on sample project
- Search end-to-end
- Incremental indexing on file change
- Error handling when Ollama unavailable

### Performance Tests
- Index 1,000 file workspace
- Search response time
- Memory usage during indexing

## Success Criteria

**Functional**:
- ✅ Extension activates only if Ollama available
- ✅ Index medium workspace (1k files) in under 5 minutes
- ✅ Search returns results in under 500ms
- ✅ Find semantically similar code with different naming
- ✅ Works offline after initial model download
- ✅ Incremental updates work correctly

**Quality**:
- ✅ No crashes if Ollama stops during operation
- ✅ Graceful recovery if connection lost
- ✅ Clear progress indication during indexing
- ✅ Helpful error messages with actionable steps

**UX**:
- ✅ One-click setup instructions if Ollama missing
- ✅ Intuitive search interface
- ✅ Fast result navigation
- ✅ Status bar shows clear state

## Dependencies

### Runtime
- `@lancedb/lancedb`: Vector database
- `fast-glob`: File system scanning
- `web-tree-sitter`: Code parsing

### Development
- `typescript`: Language
- `@types/vscode`: VSCode API types
- `esbuild`: Bundling
- `@vscode/test-electron`: Testing

## Future Enhancements (Post-MVP)
- Search filters (language, file type, date range)
- Support for more embedding models
- Search history
- Code similarity detection (find duplicates)
