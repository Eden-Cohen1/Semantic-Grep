import * as vscode from 'vscode';

/**
 * Manages the status bar item for Semantic Grep
 * Shows connection status, index progress, and chunk count
 */
export class StatusBarManager {
    private statusBarItem: vscode.StatusBarItem;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'semanticSearch.checkHealth';
        this.statusBarItem.show();
    }

    /**
     * Show a status message with optional tooltip
     */
    show(text: string, tooltip?: string) {
        this.statusBarItem.text = text;
        if (tooltip) {
            this.statusBarItem.tooltip = tooltip;
        }
        this.statusBarItem.show();
    }

    /**
     * Show indexing progress
     */
    showIndexingProgress(current: number, total: number) {
        const percentage = Math.round((current / total) * 100);
        this.statusBarItem.text = `$(sync~spin) Indexing... ${percentage}%`;
        this.statusBarItem.tooltip = `Indexing workspace: ${current}/${total} files`;
        this.statusBarItem.show();
    }

    /**
     * Show ready status with chunk count
     */
    showReady(chunkCount?: number) {
        if (chunkCount !== undefined) {
            this.statusBarItem.text = `$(check) Ollama Ready | ${chunkCount.toLocaleString()} chunks`;
            this.statusBarItem.tooltip = `Semantic Grep ready - ${chunkCount} code chunks indexed`;
        } else {
            this.statusBarItem.text = '$(check) Ollama Ready';
            this.statusBarItem.tooltip = 'Semantic Grep ready';
        }
        this.statusBarItem.show();
    }

    /**
     * Show offline status
     */
    showOffline(reason?: string) {
        this.statusBarItem.text = '$(error) Ollama Offline';
        this.statusBarItem.tooltip = reason || 'Ollama is not running';
        this.statusBarItem.show();
    }

    /**
     * Show warning status
     */
    showWarning(message: string, tooltip?: string) {
        this.statusBarItem.text = `$(warning) ${message}`;
        this.statusBarItem.tooltip = tooltip || message;
        this.statusBarItem.show();
    }

    /**
     * Hide the status bar item
     */
    hide() {
        this.statusBarItem.hide();
    }

    /**
     * Dispose of the status bar item
     */
    dispose() {
        this.statusBarItem.dispose();
    }
}
