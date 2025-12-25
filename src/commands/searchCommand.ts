import * as vscode from 'vscode';
import { SearchViewManager } from '../ui/searchViewManager';
import { SearchTreeItem } from '../ui/searchTreeViewProvider';
import { Logger } from '../utils/logger';

const logger = new Logger('SearchCommand');

/**
 * Command handler for executing search
 * @param viewManager Search view manager instance
 */
export async function executeSearchCommand(viewManager: SearchViewManager) {
    try {
        logger.info('Execute search command triggered');
        await viewManager.showSearchInput();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Execute search command failed', error);
        vscode.window.showErrorMessage(`Search failed: ${errorMessage}`);
    }
}

/**
 * Command handler for showing the search view
 * @param viewManager Search view manager instance
 */
export async function showSearchViewCommand(viewManager: SearchViewManager) {
    try {
        logger.info('Show search view command triggered');
        viewManager.showView();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Show search view command failed', error);
        vscode.window.showErrorMessage(`Failed to show search view: ${errorMessage}`);
    }
}

/**
 * Command handler for filtering search results
 * @param viewManager Search view manager instance
 */
export async function filterResultsCommand(viewManager: SearchViewManager) {
    try {
        logger.info('Filter results command triggered');
        await viewManager.showFilterPicker();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Filter results command failed', error);
        vscode.window.showErrorMessage(`Failed to show filter picker: ${errorMessage}`);
    }
}

/**
 * Command handler for clearing search results
 * @param viewManager Search view manager instance
 */
export async function clearSearchCommand(viewManager: SearchViewManager) {
    try {
        logger.info('Clear search command triggered');
        viewManager.clearResults();
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Clear search command failed', error);
        vscode.window.showErrorMessage(`Failed to clear search: ${errorMessage}`);
    }
}

/**
 * Command handler for opening a chunk in the editor
 * @param viewManager Search view manager instance
 * @param item Tree item containing chunk information
 */
export async function openChunkCommand(viewManager: SearchViewManager, item: SearchTreeItem) {
    try {
        logger.info('Open chunk command triggered');
        await viewManager.openChunkInEditor(item);
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Open chunk command failed', error);
        vscode.window.showErrorMessage(`Failed to open code location: ${errorMessage}`);
    }
}
