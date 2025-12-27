import * as vscode from "vscode";
import { SearchOrchestrator, SearchParams } from "../search/searchOrchestrator";
import { Logger } from "../utils/logger";
import { Config } from "../utils/config";
import { SearchResult } from "../search/vectorStore";

const logger = new Logger("SearchWebviewProvider");

/**
 * WebView provider for search interface
 * Provides embedded search UI in the sidebar
 */
export class SearchWebviewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "semanticSearch.searchView";
  private _view?: vscode.WebviewView;
  private _lastResults: SearchResult[] = [];

  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly searchOrchestrator: SearchOrchestrator
  ) {
    logger.info("SearchWebviewProvider created");
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    // Handle messages from webview
    webviewView.webview.onDidReceiveMessage(async (message) => {
      await this._handleMessage(message);
    });

    logger.info("Webview resolved");
  }

  private async _handleMessage(message: any) {
    logger.info(`Received message: ${message.command}`);

    switch (message.command) {
      case "search":
        await this._executeSearch(message.query, message.extensions);
        break;
      case "indexWorkspace":
        await vscode.commands.executeCommand("semanticSearch.indexWorkspace");
        break;
      case "openSettings":
        await vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "semanticSearch"
        );
        break;
      case "toggleHybridSearch":
        await this._toggleHybridSearch();
        break;
      case "changeModel":
        await this._changeModel(message.model);
        break;
      case "openFile":
        await this._openFile(
          message.filePath,
          message.startLine,
          message.endLine
        );
        break;
    }
  }

  private async _executeSearch(query: string, extensions?: string) {
    if (!query || query.trim().length === 0) {
      this._view?.webview.postMessage({
        command: "searchError",
        error: "Please enter a search query",
      });
      return;
    }

    try {
      // Check if index is ready
      const isReady = await this.searchOrchestrator.isReady();
      if (!isReady) {
        this._view?.webview.postMessage({
          command: "searchError",
          error:
            'Workspace not indexed. Click "Index Current Codebase" to get started.',
        });
        return;
      }

      // Show searching state
      this._view?.webview.postMessage({
        command: "searchStarted",
      });

      // Execute search
      const params: SearchParams = {
        query: query.trim(),
        limit: Config.get("searchResultLimit", 20),
        minSimilarity: Config.get("minSimilarity", 0.5),
      };

      const resultSet = await this.searchOrchestrator.search(params);

      if (resultSet.error) {
        this._view?.webview.postMessage({
          command: "searchError",
          error: resultSet.error,
        });
        return;
      }

      // Store results
      this._lastResults = resultSet.results;

      // Send results to webview
      this._view?.webview.postMessage({
        command: "searchComplete",
        results: this._formatResultsForWebview(resultSet.results),
        searchTime: resultSet.searchTime,
        totalResults: resultSet.totalResults,
      });
    } catch (error) {
      logger.error("Search failed", error);
      this._view?.webview.postMessage({
        command: "searchError",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async _toggleHybridSearch() {
    const config = vscode.workspace.getConfiguration("semanticSearch");
    const currentValue = config.get<boolean>("enableHybridSearch", false);
    await config.update(
      "enableHybridSearch",
      !currentValue,
      vscode.ConfigurationTarget.Global
    );

    // Send updated state to webview
    this._view?.webview.postMessage({
      command: "hybridSearchToggled",
      enabled: !currentValue,
    });

    vscode.window.showInformationMessage(
      `Hybrid Search ${!currentValue ? "enabled" : "disabled"}`
    );
  }

  private async _changeModel(newModel: string) {
    const config = vscode.workspace.getConfiguration("semanticSearch");
    const currentModel = config.get<string>("modelName", "nomic-embed-text");

    if (currentModel === newModel) {
      return; // No change
    }

    // Get model display names
    const modelNames: Record<string, string> = {
      "nomic-embed-text": "nomic-embed-text (768-dim, 8192 context)",
      "mxbai-embed-large": "mxbai-embed-large (1024-dim, 512 context)",
    };

    // Warn user that changing models requires clearing the index
    const response = await vscode.window.showWarningMessage(
      `Changing from ${modelNames[currentModel] || currentModel} to ${modelNames[newModel] || newModel} requires clearing the existing index due to different vector dimensions. Continue?`,
      { modal: true },
      "Clear & Re-index",
      "Cancel"
    );

    if (response !== "Clear & Re-index") {
      logger.info("Model change cancelled by user");
      // Reset the selector back to current model
      this._view?.webview.postMessage({
        command: "modelChanged",
        model: currentModel,
      });
      return;
    }

    // Update the config
    await config.update(
      "modelName",
      newModel,
      vscode.ConfigurationTarget.Global
    );

    logger.info(`Model changed from ${currentModel} to ${newModel}`);

    // Clear the cache first (required due to dimension mismatch)
    await vscode.commands.executeCommand("semanticSearch.clearCache");

    // Then prompt to re-index
    const reindexResponse = await vscode.window.showInformationMessage(
      `Index cleared. Ready to re-index with ${modelNames[newModel] || newModel}.`,
      "Re-index Now",
      "Later"
    );

    if (reindexResponse === "Re-index Now") {
      await vscode.commands.executeCommand("semanticSearch.indexWorkspace");
    }
  }

  private async _openFile(
    filePath: string,
    startLine: number,
    endLine: number
  ) {
    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc);

      const range = new vscode.Range(startLine - 1, 0, endLine - 1, 0);
      editor.selection = new vscode.Selection(range.start, range.end);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
    } catch (error) {
      logger.error("Failed to open file", error);
      vscode.window.showErrorMessage(`Failed to open file: ${error}`);
    }
  }

  private _formatResultsForWebview(results: SearchResult[]) {
    // Group by file
    const grouped = new Map<string, any[]>();

    for (const result of results) {
      const filePath = result.chunk.filePath;
      if (!grouped.has(filePath)) {
        grouped.set(filePath, []);
      }

      grouped.get(filePath)!.push({
        filePath: result.chunk.filePath,
        startLine: result.chunk.startLine,
        endLine: result.chunk.endLine,
        text: result.chunk.text,
        type: result.chunk.type,
        language: result.chunk.language,
        similarity: result.similarity,
        normalizedScore: result.normalizedScore,
        preview: result.chunk.text.replace(/\s+/g, " ").trim().slice(0, 100),
      });
    }

    // Convert to array and calculate avgScore for each file
    const fileGroups = Array.from(grouped.entries()).map(
      ([filePath, chunks]) => {
        // Sort chunks within each file by score (descending)
        const sortedChunks = chunks.sort((a, b) => {
          const scoreA = a.normalizedScore ?? a.similarity * 100;
          const scoreB = b.normalizedScore ?? b.similarity * 100;
          return scoreB - scoreA;
        });

        return {
          filePath,
          relativePath: this._getRelativePath(filePath),
          chunks: sortedChunks,
          avgScore:
            sortedChunks.reduce(
              (sum, c) => sum + (c.normalizedScore ?? c.similarity * 100),
              0
            ) / sortedChunks.length,
        };
      }
    );

    // Sort file groups by avgScore (descending)
    return fileGroups.sort((a, b) => b.avgScore - a.avgScore);
  }

  private _getRelativePath(filePath: string): string {
    if (
      vscode.workspace.workspaceFolders &&
      vscode.workspace.workspaceFolders.length > 0
    ) {
      const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
      if (filePath.startsWith(workspaceRoot)) {
        return filePath.substring(workspaceRoot.length + 1);
      }
    }
    return filePath;
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    const hybridEnabled = Config.getEnableHybridSearch();
    const currentModel = Config.get('modelName', 'nomic-embed-text') as string;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Semantic Code Search</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-sideBar-background);
            padding: 12px;
        }

        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
            margin-bottom: 16px;
            padding-bottom: 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }

        .header-title {
            font-size: 16px;
            font-weight: 600;
            flex: 1;
        }

        .settings-btn {
            background: none;
            border: none;
            color: var(--vscode-foreground);
            cursor: pointer;
            padding: 4px;
            display: flex;
            align-items: end;
            font-size: 16px;
            width: fit-content;
            border-radius: 3px;
            }
        .settings-btn:hover {
            background-color: var(--vscode-toolbar-hoverBackground);

        }


        .input-group {
            margin-bottom: 12px;
        }

        label {
            display: block;
            margin-bottom: 4px;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        input[type="text"], select {
            width: 100%;
            padding: 6px 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            outline: none;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
        }

        input[type="text"]:focus, select:focus {
            border-color: var(--vscode-focusBorder);
        }

        select {
            cursor: pointer;
        }

        .button-group {
            display: flex;
            gap: 8px;
            margin-bottom: 12px;
        }

        button {
            flex: 1;
            padding: 8px 12px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            cursor: pointer;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            font-weight: 500;
        }

        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }

        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }

        .secondary-btn {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .secondary-btn:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }

        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 12px;
            padding: 8px;
            background-color: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
        }

        input[type="checkbox"] {
            cursor: pointer;
        }

        .checkbox-label {
            font-size: 13px;
            color: var(--vscode-foreground);
            cursor: pointer;
            user-select: none;
        }

        .status {
            padding: 8px;
            margin-bottom: 12px;
            border-radius: 3px;
            font-size: 12px;
        }

        .status.info {
            background-color: var(--vscode-inputValidation-infoBackground);
            border: 1px solid var(--vscode-inputValidation-infoBorder);
        }

        .status.error {
            background-color: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
        }

        .status.success {
            background-color: var(--vscode-testing-iconPassed);
            color: var(--vscode-foreground);
            border: 1px solid var(--vscode-panel-border);
        }

        .results-header {
            margin: 16px 0 8px 0;
            padding-bottom: 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .file-group {
            margin-bottom: 12px;
            border: 1px solid var(--vscode-panel-border);
            background-color: var(--vscode-editor-background);
        }

        .file-header {
            padding: 8px;
            background-color: var(--vscode-sideBarSectionHeader-background);
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
        }

        .file-header:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .file-icon {
            font-size: 14px;
        }

        .file-path {
            flex: 1;
            font-size: 13px;
            font-weight: 500;
        }

        .file-score {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
        }

        .chunk {
            padding: 8px;
            border-top: 1px solid var(--vscode-panel-border);
            cursor: pointer;
        }

        .chunk:hover {
            background-color: var(--vscode-list-hoverBackground);
        }

        .chunk-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 4px;
        }

        .chunk-type {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
        }

        .chunk-score {
            font-size: 11px;
            font-weight: 600;
        }

        .chunk-preview {
            font-size: 12px;
            font-family: var(--vscode-editor-font-family);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            color: var(--vscode-editor-foreground);
        }

        .chunk-location {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
        }

        .hidden {
            display: none;
        }
    </style>
</head>
<body>
    <div class="header">
        <span class="header-title">Semantic Grep</span>
        <a class="settings-btn" onclick="openSettings()">⚙️</a>
    </div>

    <div class="input-group">
        <label for="searchQuery">Semantic search query</label>
        <input
            type="text"
            id="searchQuery"
            placeholder="e.g. 'The main function of the codebase'"
            onkeypress="handleSearchKeyPress(event)"
        />
    </div>

    <div class="input-group">
        <label for="extensionFilter">Extension filter (optional)</label>
        <input
            type="text"
            id="extensionFilter"
            placeholder="e.g. .ts,.py,.java"
        />
    </div>

    <div class="input-group">
        <label for="modelSelector">Embedding Model</label>
        <select id="modelSelector" onchange="changeModel()">
            <option value="nomic-embed-text" ${currentModel === 'nomic-embed-text' ? 'selected' : ''}>
                nomic-embed-text (768-dim, 8192 context)
            </option>
            <option value="mxbai-embed-large" ${currentModel === 'mxbai-embed-large' ? 'selected' : ''}>
                mxbai-embed-large (1024-dim, 512 context)
            </option>
        </select>
    </div>

    <div class="checkbox-group">
        <input
            type="checkbox"
            id="hybridSearchToggle"
            ${hybridEnabled ? "checked" : ""}
            onchange="toggleHybridSearch()"
        />
        <label class="checkbox-label" for="hybridSearchToggle">
            Enable Hybrid Search (BM25 + Vector)
        </label>
    </div>

    <div class="button-group">
        <button onclick="executeSearch()">Search</button>
    </div>

    <div class="button-group">
        <button class="secondary-btn" onclick="indexWorkspace()">Index Current Codebase</button>
    </div>

    <div id="status" class="hidden"></div>

    <div id="results"></div>

    <script>
        const vscode = acquireVsCodeApi();

        function executeSearch() {
            const query = document.getElementById('searchQuery').value;
            const extensions = document.getElementById('extensionFilter').value;

            vscode.postMessage({
                command: 'search',
                query: query,
                extensions: extensions
            });
        }

        function handleSearchKeyPress(event) {
            if (event.key === 'Enter') {
                executeSearch();
            }
        }

        function indexWorkspace() {
            vscode.postMessage({
                command: 'indexWorkspace'
            });
        }

        function openSettings() {
            vscode.postMessage({
                command: 'openSettings'
            });
        }

        function toggleHybridSearch() {
            vscode.postMessage({
                command: 'toggleHybridSearch'
            });
        }

        function changeModel() {
            const modelSelector = document.getElementById('modelSelector');
            const selectedModel = modelSelector.value;

            vscode.postMessage({
                command: 'changeModel',
                model: selectedModel
            });
        }

        function openFile(filePath, startLine, endLine) {
            vscode.postMessage({
                command: 'openFile',
                filePath: filePath,
                startLine: startLine,
                endLine: endLine
            });
        }

        function showStatus(message, type) {
            const status = document.getElementById('status');
            status.textContent = message;
            status.className = 'status ' + type;
            status.classList.remove('hidden');
        }

        function hideStatus() {
            document.getElementById('status').classList.add('hidden');
        }

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;

            switch (message.command) {
                case 'searchStarted':
                    showStatus('Searching...', 'info');
                    document.getElementById('results').innerHTML = '';
                    break;

                case 'searchComplete':
                    hideStatus();
                    displayResults(message.results, message.totalResults, message.searchTime);
                    break;

                case 'searchError':
                    showStatus(message.error, 'error');
                    break;

                case 'hybridSearchToggled':
                    document.getElementById('hybridSearchToggle').checked = message.enabled;
                    break;

                case 'modelChanged':
                    // Reset the model selector (user cancelled the change)
                    document.getElementById('modelSelector').value = message.model;
                    break;
            }
        });

        function displayResults(fileGroups, totalResults, searchTime) {
            const resultsDiv = document.getElementById('results');

            if (!fileGroups || fileGroups.length === 0) {
                resultsDiv.innerHTML = '<div class="status info">No results found</div>';
                return;
            }

            let html = \`<div class="results-header">Found \${totalResults} result\${totalResults > 1 ? 's' : ''} in \${fileGroups.length} file\${fileGroups.length > 1 ? 's' : ''} (\${searchTime}ms)</div>\`;

            fileGroups.forEach(fileGroup => {
                const avgScore = Math.round(fileGroup.avgScore);
                html += \`
                    <div class="file-group">
                        <div class="file-header">
                            <span class="file-icon">📄</span>
                            <span class="file-path">\${escapeHtml(fileGroup.relativePath)}</span>
                            <span class="file-score">\${avgScore}%</span>
                        </div>
                \`;

                fileGroup.chunks.forEach(chunk => {
                    const score = chunk.normalizedScore ?? Math.round(chunk.similarity * 100);
                    html += \`
                        <div class="chunk" onclick="openFile('\${escapeHtml(chunk.filePath)}', \${chunk.startLine}, \${chunk.endLine})">
                            <div class="chunk-header">
                                <span class="chunk-type">\${chunk.type}</span>
                                <span class="chunk-score">\${score}%</span>
                            </div>
                            <div class="chunk-preview">\${escapeHtml(chunk.preview)}...</div>
                            <div class="chunk-location">Lines \${chunk.startLine}-\${chunk.endLine}</div>
                        </div>
                    \`;
                });

                html += '</div>';
            });

            resultsDiv.innerHTML = html;
        }

        function escapeHtml(text) {
            const div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }
    </script>
</body>
</html>`;
  }
}
