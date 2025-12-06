# Semantic Grep - Development Plan

## Project Overview
VSCode extension for semantic code search using **100% local** tools:
- **Ollama** (local AI runtime) - REQUIRED dependency
- **Nomic Embed Text** model (768-dim embeddings)
- **LanceDB** (embedded vector database)
- **Tree-sitter** (local code parsing)

**Privacy First**: No external APIs, no telemetry, all processing happens locally.

---

## Phase 1: Foundation & Ollama Integration (Week 1)
**Status**: 🔴 Not Started
**Goal**: Verify Ollama is available and establish reliable connection

### 1.1 Extension Activation & Health Check
**Files**: `src/extension.ts`, `src/ollama/healthCheck.ts`

**Tasks**:
- [ ] Create extension entry point with activation event (`*`)
- [ ] Implement Ollama health check on activation
  - [ ] Check if Ollama is running at `http://localhost:11434`
  - [ ] GET `/api/tags` to verify service is responding
  - [ ] Parse response to check if `nomic-embed-text` model is installed
- [ ] Handle startup scenarios:
  - ✅ **Ollama running + model installed**: Proceed normally
  - ⚠️ **Ollama running + model missing**: Show warning with terminal command
  - ❌ **Ollama not running**: Show error with setup instructions

**Error Handling**:
```typescript
// Scenario 1: Ollama not running
- Show error notification: "Semantic Grep requires Ollama to be running"
- Provide buttons: [Install Ollama] [Open Setup Guide]
- Status bar: "$(error) Ollama Offline"
- Disable all commands

// Scenario 2: Model not installed
- Show warning: "Nomic Embed Text model not found"
- Provide buttons: [Pull Model] [Show Command]
- If user clicks "Pull Model": Open terminal and run `ollama pull nomic-embed-text`
- Status bar: "$(warning) Model Missing"

// Scenario 3: All good
- Status bar: "$(check) Ollama Ready"
- Enable all commands
```

**Success Criteria**:
- Extension activates only if Ollama is available
- Clear error messages with actionable steps
- Status bar shows connection state

---

### 1.2 Ollama Client Implementation
**Files**: `src/ollama/ollamaClient.ts`

**Tasks**:
- [ ] Create `OllamaClient` class with methods:
  - [ ] `checkHealth()`: Verify Ollama is running
  - [ ] `listModels()`: Get installed models via `/api/tags`
  - [ ] `generateEmbedding(text: string)`: Single embedding
  - [ ] `generateEmbeddings(texts: string[])`: Batch embeddings
- [ ] Implement retry logic with exponential backoff
  - Max retries: 3
  - Backoff: 1s, 2s, 4s
- [ ] Add request timeout (30 seconds for batch operations)
- [ ] Error handling for:
  - Network errors (ECONNREFUSED)
  - Timeout errors
  - Invalid responses
  - Model not found

**API Endpoints**:
```typescript
// Health check
GET http://localhost:11434/api/tags
Response: { models: [{ name: "nomic-embed-text", ... }] }

// Generate embedding
POST http://localhost:11434/api/embeddings
Body: { model: "nomic-embed-text", prompt: "code text here" }
Response: { embedding: [0.123, -0.456, ...] } // 768 dimensions
```

**Success Criteria**:
- Successful embedding generation for single text
- Batch processing works for 32 texts
- Graceful error handling with retry logic

---

### 1.3 Batch Processing Optimization
**Files**: `src/ollama/batchProcessor.ts`

**Tasks**:
- [ ] Create `BatchProcessor` class
- [ ] Implement batching logic:
  - Configurable batch size (default: 32)
  - Sequential batch processing (no concurrency to avoid overwhelming Ollama)
  - Progress callback for UI updates
- [ ] Handle partial failures:
  - If batch fails, retry failed items individually
  - Log failed items for debugging
  - Continue with successful items
- [ ] Add rate limiting:
  - 100ms delay between batches (configurable)
  - Monitor Ollama response times
  - Adjust batch size dynamically if errors occur

**Success Criteria**:
- Process 1000 chunks in under 2 minutes
- Handle partial failures gracefully
- Progress updates visible to user

---

### 1.4 Status Bar Integration
**Files**: `src/ui/statusBar.ts`

**Tasks**:
- [ ] Create status bar item showing:
  - Ollama connection status (icon + text)
  - Index progress during indexing
  - Number of indexed chunks
- [ ] Status states:
  - `$(check) Ollama Ready | 1,234 chunks`
  - `$(sync~spin) Indexing... 45%`
  - `$(warning) Model Missing`
  - `$(error) Ollama Offline`
- [ ] Click handler: Open health check dialog
- [ ] Auto-update on state changes

**Success Criteria**:
- Status bar always shows current state
- Visual feedback during long operations
- Clickable for more details

---

### 1.5 Periodic Health Checks
**Files**: `src/ollama/healthCheck.ts`

**Tasks**:
- [ ] Implement periodic health check (configurable interval, default: 2 minutes)
- [ ] Monitor Ollama availability during session
- [ ] Handle mid-session failures:
  - Show notification: "Lost connection to Ollama"
  - Pause indexing if in progress
  - Disable search commands
  - Provide "Retry" button
- [ ] Auto-reconnect when Ollama comes back online
- [ ] Update status bar in real-time

**Success Criteria**:
- Detects when Ollama stops mid-session
- Graceful degradation (no crashes)
- Auto-recovery when Ollama restarts

---

## Phase 2: Code Indexing (Week 2)
**Status**: 🔴 Not Started
**Goal**: Build vector index of workspace code

### 2.1 File Scanner
**Files**: `src/indexing/fileScanner.ts`

**Tasks**:
- [ ] Scan workspace for supported files
- [ ] Respect `.gitignore` patterns
- [ ] Apply user-configured exclusions (node_modules, dist, etc.)
- [ ] Filter by file extensions (ts, js, py, etc.)
- [ ] Filter by file size (skip files > 100KB by default)
- [ ] Return list of files to index

**Dependencies**:
- `fast-glob` for file system scanning

**Success Criteria**:
- Correctly identifies indexable files
- Respects all exclusion patterns
- Handles large workspaces (10k+ files)

---

### 2.2 Code Chunker with Tree-sitter
**Files**: `src/indexing/codeChunker.ts`

**Tasks**:
- [ ] Initialize Tree-sitter WASM parsers
  - Bundle parsers for: TypeScript, JavaScript, Python
  - Load parsers asynchronously
- [ ] Parse code files into AST
- [ ] Extract chunks at semantic boundaries:
  - **Functions**: Full function body
  - **Classes**: Full class definition
  - **Methods**: Individual methods
  - **Top-level blocks**: Imports, exports, etc.
- [ ] Fallback to fixed-size chunking if parsing fails
  - 500 tokens per chunk (configurable)
  - Overlap of 50 tokens between chunks
- [ ] Include metadata for each chunk:
  - `id`: `filepath:startLine-endLine`
  - `filePath`: Absolute path
  - `startLine`, `endLine`: Line numbers
  - `text`: Raw code
  - `type`: function | class | method | block
  - `language`: File extension
  - `timestamp`: Index time

**Success Criteria**:
- TypeScript/JavaScript files parsed correctly
- Python files parsed correctly
- Fallback chunking works for unsupported languages
- Each chunk has complete metadata

---

### 2.3 Embedding Generator
**Files**: `src/indexing/embeddingGenerator.ts`

**Tasks**:
- [ ] Process code chunks in batches
- [ ] Call `OllamaClient.generateEmbeddings()` for batches
- [ ] Handle failures and retries
- [ ] Return chunk + embedding pairs
- [ ] Progress reporting for UI

**Success Criteria**:
- Generate embeddings for 1000 chunks in under 2 minutes
- Handle partial failures
- Memory efficient (stream processing)

---

### 2.4 LanceDB Integration
**Files**: `src/search/vectorStore.ts`

**Tasks**:
- [ ] Initialize LanceDB
  - Storage location: `.vscode/.semantic-grep/index.lance`
  - Per-workspace storage
- [ ] Create schema:
  ```typescript
  {
    id: string,
    filePath: string,
    startLine: number,
    endLine: number,
    text: string,
    type: string,
    language: string,
    timestamp: number,
    vector: Float32Array(768) // Nomic Embed Text dimension
  }
  ```
- [ ] Implement methods:
  - `insert(chunks)`: Bulk insert with embeddings
  - `search(queryVector, limit)`: Cosine similarity search
  - `delete(filePath)`: Remove file from index
  - `clear()`: Clear entire index
  - `count()`: Get number of indexed chunks
- [ ] Create index on `vector` column for fast search

**Success Criteria**:
- Store 10k chunks successfully
- Search returns results in <500ms
- Proper cleanup on file deletion

---

### 2.5 Indexing Orchestrator
**Files**: `src/indexing/indexer.ts`, `src/commands/indexCommand.ts`

**Tasks**:
- [ ] Implement full workspace indexing
  1. Scan files (FileScanner)
  2. Chunk code (CodeChunker)
  3. Generate embeddings (EmbeddingGenerator)
  4. Store in LanceDB (VectorStore)
- [ ] Show progress notification
  - "Indexing workspace... 234/1000 files"
  - Cancellable operation
- [ ] Handle errors gracefully
  - Log files that failed to index
  - Continue with remaining files
  - Show summary: "Indexed 980/1000 files (20 skipped)"
- [ ] Register command: `semanticSearch.indexWorkspace`
- [ ] Auto-index on workspace open (if enabled in settings)

**Success Criteria**:
- Index medium workspace (1k files) in under 5 minutes
- Progress indication works
- Cancellation works correctly

---

## Phase 3: Search Implementation (Week 3)
**Status**: 🔴 Not Started
**Goal**: Enable semantic search with natural language

### 3.1 Search Orchestrator
**Files**: `src/search/searcher.ts`, `src/commands/searchCommand.ts`

**Tasks**:
- [ ] Implement search flow:
  1. Get query from user (input box)
  2. Generate query embedding via Ollama
  3. Search LanceDB for similar vectors
  4. Return top 20 results with scores
- [ ] Calculate similarity scores (cosine similarity)
- [ ] Filter results by minimum threshold (0.5)
- [ ] Register command: `semanticSearch.search`
- [ ] Keyboard shortcut: Ctrl/Cmd+Shift+F

**Success Criteria**:
- Search completes in <500ms
- Results ranked by relevance
- No false positives below threshold

---

### 3.2 Result Ranking
**Files**: `src/search/resultRanker.ts`

**Tasks**:
- [ ] Implement result ranking logic:
  - Primary: Similarity score
  - Secondary: Recency (newer files ranked higher)
  - Tertiary: File type (exact language match preferred)
- [ ] Deduplication:
  - If multiple chunks from same file, show best match first
  - Group by file for better UX
- [ ] Apply filters:
  - Minimum similarity threshold
  - Maximum results limit

**Success Criteria**:
- Best matches always appear first
- Deduplication works correctly
- Filters applied consistently

---

### 3.3 Search UI
**Files**: `src/ui/searchView.ts`

**Tasks**:
- [ ] Create Quick Pick interface showing:
  - File name and path
  - Line numbers
  - Code preview (syntax highlighted)
  - Similarity score (percentage)
- [ ] Format: `[filename.ts:42-58] (87%) function validateEmail() { ... }`
- [ ] On selection:
  - Open file in editor
  - Navigate to line
  - Highlight code range
- [ ] Handle empty results:
  - Show message: "No results found. Try a different query."
  - Suggest re-indexing workspace

**Success Criteria**:
- Results display clearly
- Navigation works smoothly
- Code preview is readable

---

### 3.4 Code Navigation
**Files**: `src/ui/searchView.ts`

**Tasks**:
- [ ] Open file in editor on selection
- [ ] Navigate to specific line range
- [ ] Highlight selected code
- [ ] Reveal in editor (scroll to view)
- [ ] Focus editor after navigation

**Success Criteria**:
- One-click navigation
- Correct line highlighted
- Smooth user experience

---

## Phase 4: Incremental Indexing & Polish (Week 4)
**Status**: 🔴 Not Started
**Goal**: Keep index up-to-date and improve UX

### 4.1 File Watcher
**Files**: `src/indexing/fileWatcher.ts`

**Tasks**:
- [ ] Watch workspace for file changes
- [ ] Debounce updates (1 second delay)
- [ ] Handle events:
  - **Create**: Index new file
  - **Modify**: Re-index file
  - **Delete**: Remove from index
- [ ] Only watch supported file types
- [ ] Respect exclusion patterns

**Success Criteria**:
- File changes reflected in index within 2 seconds
- No performance impact during editing
- Memory efficient

---

### 4.2 Incremental Re-indexing
**Files**: `src/indexing/indexer.ts`

**Tasks**:
- [ ] Re-index single file on change
  1. Delete old chunks for file
  2. Chunk new file content
  3. Generate embeddings
  4. Insert into LanceDB
- [ ] Batch small changes (wait for quiet period)
- [ ] Show minimal UI feedback (status bar only)

**Success Criteria**:
- Fast re-indexing (<2 seconds per file)
- No duplicate entries
- Index always in sync with workspace

---

### 4.3 Cache Management
**Files**: `src/commands/clearCacheCommand.ts`, `src/utils/cache.ts`

**Tasks**:
- [ ] Implement `semanticSearch.clearCache` command
- [ ] Delete LanceDB index
- [ ] Clear metadata
- [ ] Offer to re-index after clear
- [ ] Show confirmation dialog before clearing

**Success Criteria**:
- Cache cleared completely
- No orphaned files
- User confirmation works

---

### 4.4 Error Recovery & Polish
**Files**: `src/utils/logger.ts`, various

**Tasks**:
- [ ] Comprehensive error handling:
  - Ollama connection lost mid-operation
  - File system errors (permissions, locked files)
  - Out of memory during indexing
  - Corrupted LanceDB index
- [ ] Logging system:
  - Debug logs for troubleshooting
  - Error logs with stack traces
  - User-facing error messages (no technical jargon)
- [ ] User guidance:
  - "Ollama connection lost. Retrying..."
  - "File locked, skipping: package-lock.json"
  - "Index corrupted. Please clear cache and re-index."

**Success Criteria**:
- No crashes during error scenarios
- All errors logged properly
- Users know how to resolve issues

---

### 4.5 Performance Optimization
**Files**: various

**Tasks**:
- [ ] Profile indexing performance
- [ ] Optimize batch sizes based on hardware
- [ ] Reduce memory footprint
- [ ] Add configurable concurrency for file reading
- [ ] Benchmark search latency

**Success Criteria**:
- Index 10k chunks in <5 minutes
- Search latency <500ms
- Memory usage <500MB during indexing

---

## Testing Strategy

### Unit Tests
- [ ] Ollama health check logic
- [ ] Code chunking with Tree-sitter
- [ ] Batch embedding processing
- [ ] Vector similarity calculations
- [ ] File scanner exclusion logic

### Integration Tests
- [ ] Full indexing workflow on sample project
- [ ] Search end-to-end
- [ ] Incremental indexing on file change
- [ ] Error handling when Ollama unavailable

### Manual Testing Scenarios
- [ ] Fresh install (Ollama not running)
- [ ] Fresh install (Ollama running, model missing)
- [ ] Index large workspace (5k+ files)
- [ ] Search with various queries
- [ ] Ollama stops mid-indexing
- [ ] File deleted during indexing
- [ ] Workspace folder changed

---

## Technical Challenges & Solutions

### Challenge 1: Tree-sitter WASM Loading
**Problem**: Tree-sitter parsers are WASM files that need async loading
**Solution**:
- Bundle WASM files in extension
- Lazy load parsers on first use
- Cache loaded parsers in memory
- Fallback to simple chunking if WASM fails

### Challenge 2: Large Workspace Performance
**Problem**: 10k+ files take too long to index
**Solution**:
- Batch processing (32 chunks at a time)
- Parallel file reading
- Progress indication with cancellation
- Incremental indexing (don't re-index unchanged files)

### Challenge 3: Ollama Connection Reliability
**Problem**: Ollama might stop or crash mid-session
**Solution**:
- Periodic health checks (every 2 minutes)
- Retry logic with exponential backoff
- Pause/resume indexing on connection loss
- Clear error messages + recovery options

### Challenge 4: LanceDB Storage Location
**Problem**: Where to store index data?
**Solution**:
- Per-workspace storage in `.vscode/.semantic-grep/`
- Add to .gitignore automatically
- Clear index when workspace closes (optional)

### Challenge 5: Embedding Generation Cost
**Problem**: Generating embeddings is slow (Ollama is CPU-bound)
**Solution**:
- Batch requests (32 at a time)
- Cache embeddings (don't re-generate for unchanged files)
- Sequential batches (avoid overwhelming Ollama)
- Progress indication so users know it's working

---

## Success Metrics

### Functional Requirements
- ✅ Extension activates only if Ollama available
- ✅ Index medium workspace (1k files) in <5 minutes
- ✅ Search returns results in <500ms
- ✅ Find semantically similar code with different naming
- ✅ Works 100% offline after initial setup
- ✅ Incremental updates work correctly

### Quality Requirements
- ✅ No crashes if Ollama stops during operation
- ✅ Graceful recovery if connection lost
- ✅ Clear progress indication during indexing
- ✅ Helpful error messages with actionable steps

### UX Requirements
- ✅ One-click setup instructions if Ollama missing
- ✅ Intuitive search interface
- ✅ Fast result navigation
- ✅ Status bar shows clear state

---

## Privacy & Security Guarantees

**100% Local Processing**:
- ✅ Ollama runs locally (no cloud API calls)
- ✅ LanceDB is embedded (file-based, no network)
- ✅ Tree-sitter runs in-process (WASM)
- ✅ No telemetry, no analytics, no external connections
- ✅ Code never leaves the machine

**Data Storage**:
- Embeddings stored locally in `.vscode/.semantic-grep/`
- No cloud sync, no remote storage
- User controls all data (can clear cache anytime)

---

## Next Steps

1. **Review this plan** and confirm approach
2. **Implement Phase 1**: Ollama integration (Week 1)
3. **Test Phase 1** thoroughly before moving on
4. **Implement Phase 2**: Code indexing (Week 2)
5. **Implement Phase 3**: Search functionality (Week 3)
6. **Implement Phase 4**: Polish & optimization (Week 4)

**Let's start with Phase 1.1 - Extension activation and health check!**
