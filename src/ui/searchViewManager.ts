import * as vscode from 'vscode';
import { SearchTreeDataProvider, SearchTreeItem } from './searchTreeViewProvider';
import { SearchOrchestrator, SearchParams } from '../search/searchOrchestrator';
import { ChunkType } from '../indexing/types';
import { Logger } from '../utils/logger';
import { Config } from '../utils/config';

const logger = new Logger('SearchViewManager');

/**
 * Manages the search view UI and coordinates search operations
 */
export class SearchViewManager {
    private treeView: vscode.TreeView<SearchTreeItem> | undefined;
    private treeDataProvider: SearchTreeDataProvider;
    private isSearching = false;
    private lastQuery = '';

    constructor(
        private searchOrchestrator: SearchOrchestrator
    ) {
        this.treeDataProvider = new SearchTreeDataProvider();
        logger.info('SearchViewManager created');
    }

    /**
     * Initialize the search view
     * @param context Extension context
     */
    async initialize(context: vscode.ExtensionContext): Promise<void> {
        logger.info('Initializing search view...');

        // Create tree view
        this.treeView = vscode.window.createTreeView('semanticSearch.resultsView', {
            treeDataProvider: this.treeDataProvider,
            showCollapseAll: true
        });

        // Set initial welcome message
        this.treeView.message = '🔍 Click the search icon (🔎) to start searching\n\n📊 Use toolbar buttons to:\n  • Toggle Hybrid Search (🔀)\n  • Index Workspace (💾)\n  • Open Settings (⚙️)';

        context.subscriptions.push(this.treeView);

        logger.info('Search view initialized successfully');
    }

    /**
     * Show search input box and execute search
     */
    async showSearchInput(): Promise<void> {
        try {
            logger.info('Showing search input');

            // Check if index is ready
            const isReady = await this.searchOrchestrator.isReady();
            logger.info(`Index ready check result: ${isReady}`);

            if (!isReady) {
                logger.warn('Index not ready - showing warning to user');
                const response = await vscode.window.showWarningMessage(
                    'Workspace not indexed. Index now to enable semantic search.',
                    'Index Workspace',
                    'Cancel'
                );

                if (response === 'Index Workspace') {
                    await vscode.commands.executeCommand('semanticSearch.indexWorkspace');
                }
                return;
            }

            // Get chunk count for display
            const chunkCount = await this.searchOrchestrator.getIndexedChunkCount();

            // Create input box
            const input = vscode.window.createInputBox();
            input.placeholder = "Enter search query (e.g., 'authentication logic')";
            input.prompt = `Semantic search powered by Ollama | ${chunkCount.toLocaleString()} chunks indexed`;
            input.value = this.lastQuery;

            input.onDidAccept(async () => {
                const query = input.value.trim();
                if (query) {
                    input.hide();
                    await this.executeSearch(query);
                }
            });

            input.onDidHide(() => {
                input.dispose();
            });

            input.show();

        } catch (error) {
            logger.error('Failed to show search input', error);
            vscode.window.showErrorMessage(
                `Failed to show search input: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * Execute a search with the given query
     * @param query Search query
     */
    async executeSearch(query: string): Promise<void> {
        if (this.isSearching) {
            vscode.window.showWarningMessage('Search already in progress...');
            return;
        }

        this.isSearching = true;
        this.lastQuery = query;

        try {
            logger.info(`Executing search for: "${query}"`);

            // Show the search view
            if (this.treeView) {
                this.treeView.message = 'Searching...';
            }

            // Execute search with progress
            const resultSet = await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Semantic Grep',
                    cancellable: false
                },
                async (progress) => {
                    progress.report({ message: 'Generating query embedding...' });

                    const params: SearchParams = {
                        query,
                        limit: Config.get('searchResultLimit', 20),
                        minSimilarity: Config.get('minSimilarity', 0.5)
                    };

                    progress.report({ message: 'Searching code...' });
                    return await this.searchOrchestrator.search(params);
                }
            );

            // Handle errors
            if (resultSet.error) {
                logger.error('Search failed', resultSet.error);

                // Check if it's an Ollama connection error
                if (resultSet.error.includes('ECONNREFUSED') || resultSet.error.includes('offline')) {
                    const response = await vscode.window.showErrorMessage(
                        'Search failed: Ollama is not running. Please start Ollama.',
                        'Check Status',
                        'Install Ollama'
                    );

                    if (response === 'Check Status') {
                        await vscode.commands.executeCommand('semanticSearch.checkHealth');
                    } else if (response === 'Install Ollama') {
                        vscode.env.openExternal(vscode.Uri.parse('https://ollama.ai/download'));
                    }
                } else {
                    vscode.window.showErrorMessage(`Search failed: ${resultSet.error}`);
                }

                if (this.treeView) {
                    this.treeView.message = `Search failed: ${resultSet.error}`;
                }
                return;
            }

            // Update tree view with results
            this.treeDataProvider.refresh(resultSet.results);

            // Update tree view message
            if (this.treeView) {
                if (resultSet.totalResults === 0) {
                    this.treeView.message = 'No results found. Try different search terms or adjust similarity threshold in settings.';
                    vscode.window.showInformationMessage(
                        'No results found for your query.',
                        'Index Workspace',
                        'Adjust Settings'
                    ).then(selection => {
                        if (selection === 'Index Workspace') {
                            vscode.commands.executeCommand('semanticSearch.indexWorkspace');
                        } else if (selection === 'Adjust Settings') {
                            vscode.commands.executeCommand('workbench.action.openSettings', 'semanticSearch');
                        }
                    });
                } else {
                    const fileCount = this.treeDataProvider.getFileCount();
                    this.treeView.message = `Found ${resultSet.totalResults} result${resultSet.totalResults > 1 ? 's' : ''} in ${fileCount} file${fileCount > 1 ? 's' : ''} (${resultSet.searchTime}ms)`;

                    logger.info(`Search completed: ${resultSet.totalResults} results in ${resultSet.searchTime}ms`);
                }
            }

        } catch (error) {
            logger.error('Search execution failed', error);
            vscode.window.showErrorMessage(
                `Search failed: ${error instanceof Error ? error.message : String(error)}`
            );

            if (this.treeView) {
                this.treeView.message = 'Search failed. Please try again.';
            }
        } finally {
            this.isSearching = false;
        }
    }

    /**
     * Show filter picker for chunk types
     */
    async showFilterPicker(): Promise<void> {
        try {
            logger.info('Showing filter picker');

            // Check if there are results to filter
            const resultCount = this.treeDataProvider.getResultCount();
            if (resultCount === 0) {
                vscode.window.showInformationMessage('No search results to filter. Execute a search first.');
                return;
            }

            // Create filter options for all chunk types
            const allChunkTypes: ChunkType[] = [
                'function', 'method', 'class', 'interface', 'type',
                'namespace', 'const', 'variable', 'import', 'export',
                'jsx', 'component', 'block', 'template', 'script',
                'css', 'data', 'computed', 'lifecycle', 'watch', 'unknown'
            ];

            const options: vscode.QuickPickItem[] = [
                {
                    label: 'All Types',
                    description: 'Show all chunk types',
                    picked: true
                },
                { label: '', kind: vscode.QuickPickItemKind.Separator },
                ...allChunkTypes.map(type => ({
                    label: this.formatChunkTypeName(type),
                    description: type,
                    picked: false
                }))
            ];

            const selected = await vscode.window.showQuickPick(options, {
                title: 'Filter Results by Type',
                placeHolder: 'Select chunk types to display',
                canPickMany: true
            });

            if (!selected || selected.length === 0) {
                logger.debug('Filter picker cancelled or no selection');
                return;
            }

            // Check if "All Types" is selected
            const allTypesSelected = selected.some(item => item.label === 'All Types');

            if (allTypesSelected) {
                // Clear filters
                logger.info('Clearing filters (All Types selected)');
                this.treeDataProvider.applyFilters([]);
            } else {
                // Apply selected filters
                const selectedTypes = selected
                    .map(item => item.description)
                    .filter(desc => desc !== undefined) as ChunkType[];

                logger.info(`Applying filters: ${selectedTypes.join(', ')}`);
                this.treeDataProvider.applyFilters(selectedTypes);
            }

            // Update message
            if (this.treeView) {
                const filteredCount = this.treeDataProvider.getResultCount();
                const fileCount = this.treeDataProvider.getFileCount();

                if (allTypesSelected) {
                    this.treeView.message = `Showing all ${filteredCount} results in ${fileCount} file${fileCount > 1 ? 's' : ''}`;
                } else {
                    this.treeView.message = `Filtered to ${filteredCount} result${filteredCount > 1 ? 's' : ''} in ${fileCount} file${fileCount > 1 ? 's' : ''}`;
                }
            }

        } catch (error) {
            logger.error('Filter picker failed', error);
            vscode.window.showErrorMessage(
                `Failed to show filter picker: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * Open chunk in editor at the specified line
     * @param item Tree item containing chunk information
     */
    async openChunkInEditor(item: SearchTreeItem): Promise<void> {
        try {
            if (!item.chunk) {
                logger.warn('No chunk information in tree item');
                return;
            }

            const chunk = item.chunk;
            logger.info(`Opening chunk in editor: ${chunk.filePath}:${chunk.startLine}`);

            // Open document
            const uri = vscode.Uri.file(chunk.filePath);
            const doc = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(doc);

            // Navigate to line (convert from 1-indexed to 0-indexed)
            const line = chunk.startLine - 1;
            const endLine = chunk.endLine - 1;

            const range = new vscode.Range(line, 0, endLine, 0);
            editor.selection = new vscode.Selection(range.start, range.end);
            editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

            logger.debug(`Navigated to ${chunk.filePath}:${chunk.startLine}`);

        } catch (error) {
            logger.error('Failed to open chunk in editor', error);
            vscode.window.showErrorMessage(
                `Failed to open file: ${error instanceof Error ? error.message : String(error)}`
            );
        }
    }

    /**
     * Clear search results
     */
    clearResults(): void {
        logger.info('Clearing search results');
        this.treeDataProvider.clear();

        if (this.treeView) {
            this.treeView.message = '🔍 Click the search icon (🔎) to start searching\n\n📊 Use toolbar buttons to:\n  • Toggle Hybrid Search (🔀)\n  • Index Workspace (💾)\n  • Open Settings (⚙️)';
        }
    }

    /**
     * Show the search view (reveal in sidebar)
     */
    showView(): void {
        // Focus on the tree view by executing the focus command
        vscode.commands.executeCommand('semanticSearch.resultsView.focus');
    }

    /**
     * Format chunk type name for display
     */
    private formatChunkTypeName(type: ChunkType): string {
        const nameMap: Record<ChunkType, string> = {
            'function': 'Functions',
            'method': 'Methods',
            'class': 'Classes',
            'interface': 'Interfaces',
            'type': 'Types',
            'namespace': 'Namespaces',
            'const': 'Constants',
            'variable': 'Variables',
            'import': 'Imports',
            'export': 'Exports',
            'jsx': 'JSX Elements',
            'component': 'Components',
            'block': 'Blocks',
            'template': 'Templates',
            'script': 'Scripts',
            'css': 'CSS',
            'data': 'Data Properties',
            'computed': 'Computed Properties',
            'lifecycle': 'Lifecycle Methods',
            'watch': 'Watchers',
            'unknown': 'Unknown'
        };

        return nameMap[type] || type;
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        if (this.treeView) {
            this.treeView.dispose();
        }
    }
}
