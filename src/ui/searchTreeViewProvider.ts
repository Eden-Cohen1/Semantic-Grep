import * as vscode from 'vscode';
import { SearchResult } from '../search/vectorStore';
import { CodeChunk, ChunkType } from '../indexing/types';
import { Logger } from '../utils/logger';
import * as path from 'path';

const logger = new Logger('SearchTreeViewProvider');

/**
 * Tree item type
 */
export type SearchTreeItemType = 'file' | 'chunk';

/**
 * Tree item for search results
 */
export class SearchTreeItem extends vscode.TreeItem {
    constructor(
        public readonly type: SearchTreeItemType,
        public readonly label: string,
        public readonly searchResult?: SearchResult,
        public readonly chunk?: CodeChunk,
        public readonly children?: SearchTreeItem[]
    ) {
        super(
            label,
            type === 'file'
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None
        );
    }
}

/**
 * Tree data provider for search results
 * Displays results in a hierarchical format grouped by file
 */
export class SearchTreeDataProvider implements vscode.TreeDataProvider<SearchTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<SearchTreeItem | undefined | null>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private results: SearchResult[] = [];
    private activeFilters: ChunkType[] = [];
    private groupedResults: Map<string, SearchResult[]> = new Map();

    constructor() {
        logger.info('SearchTreeDataProvider initialized');
    }

    /**
     * Refresh the tree view with new search results
     * @param results Search results to display
     */
    refresh(results: SearchResult[]): void {
        logger.info(`Refreshing tree view with ${results.length} results`);
        this.results = results;
        this.groupResults();
        this._onDidChangeTreeData.fire(undefined);
    }

    /**
     * Apply chunk type filters to results
     * @param types Chunk types to include (empty array = show all)
     */
    applyFilters(types: ChunkType[]): void {
        logger.info(`Applying filters: ${types.length > 0 ? types.join(', ') : 'none'}`);
        this.activeFilters = types;
        this.groupResults();
        this._onDidChangeTreeData.fire(undefined);
    }

    /**
     * Clear all results
     */
    clear(): void {
        logger.info('Clearing search results');
        this.results = [];
        this.activeFilters = [];
        this.groupedResults.clear();
        this._onDidChangeTreeData.fire(undefined);
    }

    /**
     * Get tree item for display
     */
    getTreeItem(element: SearchTreeItem): vscode.TreeItem {
        if (element.type === 'file') {
            return this.createFileItem(element);
        } else {
            return this.createChunkItem(element);
        }
    }

    /**
     * Get children of a tree item
     */
    getChildren(element?: SearchTreeItem): SearchTreeItem[] {
        if (!element) {
            // Root level - return file items
            return this.getRootItems();
        } else if (element.type === 'file') {
            // File level - return chunk items
            return this.getChunkItems(element);
        }
        return [];
    }

    /**
     * Group results by file path
     */
    private groupResults(): void {
        this.groupedResults.clear();

        // Apply filters
        let filteredResults = this.results;
        if (this.activeFilters.length > 0) {
            filteredResults = this.results.filter(result =>
                this.activeFilters.includes(result.chunk.type)
            );
        }

        // Group by file path
        for (const result of filteredResults) {
            const filePath = result.chunk.filePath;
            if (!this.groupedResults.has(filePath)) {
                this.groupedResults.set(filePath, []);
            }
            this.groupedResults.get(filePath)!.push(result);
        }

        // Sort results within each file by similarity score (descending)
        for (const results of this.groupedResults.values()) {
            results.sort((a, b) => b.similarity - a.similarity);
        }

        logger.debug(`Grouped ${filteredResults.length} results into ${this.groupedResults.size} files`);
    }

    /**
     * Get root level items (files)
     */
    private getRootItems(): SearchTreeItem[] {
        const items: SearchTreeItem[] = [];

        for (const [filePath, results] of this.groupedResults.entries()) {
            // Calculate average score for the file
            const avgScore = results.reduce((sum, r) => sum + (r.score ?? r.similarity * 100), 0) / results.length;

            // Get relative path for display
            const displayPath = this.getDisplayPath(filePath);

            const item = new SearchTreeItem(
                'file',
                displayPath,
                results[0], // Store first result for reference
                undefined,
                undefined
            );

            // Set description (score percentage)
            item.description = `${avgScore.toFixed(0)}%`;

            // Set icon
            item.iconPath = new vscode.ThemeIcon('file-code');

            // Set context value for menu items
            item.contextValue = 'searchResultFile';

            // Set tooltip
            item.tooltip = `${filePath}\n${results.length} result${results.length > 1 ? 's' : ''}`;

            items.push(item);
        }

        // Sort files by average score (descending - higher is better)
        items.sort((a, b) => {
            const aResults = this.groupedResults.get(a.searchResult!.chunk.filePath)!;
            const bResults = this.groupedResults.get(b.searchResult!.chunk.filePath)!;

            const aAvgScore = aResults.reduce((sum, r) => sum + (r.score ?? r.similarity * 100), 0) / aResults.length;
            const bAvgScore = bResults.reduce((sum, r) => sum + (r.score ?? r.similarity * 100), 0) / bResults.length;

            return bAvgScore - aAvgScore;
        });

        return items;
    }

    /**
     * Get chunk items for a file
     */
    private getChunkItems(fileItem: SearchTreeItem): SearchTreeItem[] {
        const filePath = fileItem.searchResult!.chunk.filePath;
        const results = this.groupedResults.get(filePath) || [];

        return results.map(result => {
            const chunk = result.chunk;

            // Create preview text (first 60 chars of chunk text)
            const preview = chunk.text
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 60);

            const item = new SearchTreeItem(
                'chunk',
                preview + (chunk.text.length > 60 ? '...' : ''),
                result,
                chunk,
                undefined
            );

            // Set description (line range)
            item.description = `Lines ${chunk.startLine}-${chunk.endLine}`;

            // Set icon based on chunk type
            item.iconPath = this.getIconForChunkType(chunk.type);

            // Set command to open file at line
            item.command = {
                command: 'semanticSearch.openChunk',
                title: 'Open Code Location',
                arguments: [item]
            };

            // Set context value
            item.contextValue = 'searchResultChunk';

            // Set tooltip with code preview
            item.tooltip = this.createCodeTooltip(chunk, result);

            return item;
        });
    }

    /**
     * Create file tree item
     */
    private createFileItem(element: SearchTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Create chunk tree item
     */
    private createChunkItem(element: SearchTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Get icon for chunk type
     */
    private getIconForChunkType(type: ChunkType): vscode.ThemeIcon {
        const iconMap: Record<ChunkType, string> = {
            'function': 'symbol-method',
            'method': 'symbol-method',
            'class': 'symbol-class',
            'interface': 'symbol-interface',
            'type': 'symbol-variable',
            'namespace': 'symbol-namespace',
            'const': 'symbol-constant',
            'variable': 'symbol-variable',
            'import': 'symbol-misc',
            'export': 'symbol-misc',
            'jsx': 'symbol-misc',
            'component': 'symbol-misc',
            'block': 'symbol-misc',
            'template': 'symbol-misc',
            'script': 'symbol-misc',
            'css': 'symbol-color',
            'data': 'symbol-property',
            'computed': 'symbol-property',
            'lifecycle': 'symbol-event',
            'watch': 'symbol-event',
            'unknown': 'symbol-misc'
        };

        return new vscode.ThemeIcon(iconMap[type] || 'symbol-misc');
    }

    /**
     * Create tooltip with code preview
     */
    private createCodeTooltip(chunk: CodeChunk, result: SearchResult): vscode.MarkdownString {
        const tooltip = new vscode.MarkdownString();
        tooltip.isTrusted = true;

        // Add score information
        const score = result.score ?? Math.round(result.similarity * 100);
        tooltip.appendMarkdown(`**Score:** ${score}% (similarity: ${(result.similarity * 100).toFixed(1)}%)  \n`);

        if (result.lowRelevance) {
            tooltip.appendMarkdown(`⚠️ **Low Relevance** - May not be relevant to your query  \n`);
        }

        tooltip.appendMarkdown(`**Type:** ${chunk.type}  \n`);
        tooltip.appendMarkdown(`**Lines:** ${chunk.startLine}-${chunk.endLine}  \n\n`);

        // Add code preview with syntax highlighting
        tooltip.appendMarkdown(`---\n\n`);
        tooltip.appendCodeblock(chunk.text, chunk.language);

        return tooltip;
    }

    /**
     * Get display path (relative to workspace)
     */
    private getDisplayPath(filePath: string): string {
        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
            if (filePath.startsWith(workspaceRoot)) {
                return path.relative(workspaceRoot, filePath);
            }
        }
        return filePath;
    }

    /**
     * Get current result count
     */
    getResultCount(): number {
        let count = 0;
        for (const results of this.groupedResults.values()) {
            count += results.length;
        }
        return count;
    }

    /**
     * Get current file count
     */
    getFileCount(): number {
        return this.groupedResults.size;
    }
}
