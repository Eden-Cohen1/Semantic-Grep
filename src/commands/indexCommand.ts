import * as vscode from 'vscode';
import { Indexer, IndexingProgress } from '../indexing/indexer';
import { Logger } from '../utils/logger';

const logger = new Logger('IndexCommand');

/**
 * Command handler for indexing the workspace
 */
export async function indexWorkspaceCommand() {
    try {
        logger.info('Index workspace command triggered');

        // Check if workspace is open
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
            vscode.window.showErrorMessage('No workspace folder open. Please open a folder first.');
            return;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders[0];
        logger.info(`Indexing workspace: ${workspaceFolder.uri.fsPath}`);

        // Confirm with user
        const proceed = await vscode.window.showInformationMessage(
            `Index workspace "${workspaceFolder.name}"? This will scan and embed all code files.`,
            { modal: false },
            'Yes',
            'No'
        );

        if (proceed !== 'Yes') {
            logger.info('User cancelled indexing');
            return;
        }

        // Create indexer
        const indexer = new Indexer();

        // Run indexing with progress indicator
        const result = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Semantic Grep',
                cancellable: false
            },
            async (progress) => {
                // Track progress
                let lastPhase = '';

                const result = await indexer.indexWorkspace((indexProgress: IndexingProgress) => {
                    // Update progress
                    const { phase, current, total, percentage, message } = indexProgress;

                    // Report phase change
                    if (phase !== lastPhase) {
                        lastPhase = phase;
                        logger.info(`Phase: ${phase}`);
                    }

                    // Update progress bar
                    progress.report({
                        increment: 0, // We'll use percentage directly
                        message: `${message} (${percentage}%)`
                    });

                    logger.debug(`${phase}: ${current}/${total} (${percentage}%)`);
                });

                return result;
            }
        );

        // Show result to user
        if (result.success) {
            const durationSecs = (result.duration / 1000).toFixed(1);
            const successRate = ((result.successfulChunks / result.totalChunks) * 100).toFixed(1);

            let message = `✅ Indexing complete!\n\n`;
            message += `📁 Files: ${result.totalFiles}\n`;
            message += `📦 Chunks: ${result.successfulChunks}/${result.totalChunks} (${successRate}%)\n`;
            message += `⏱️ Duration: ${durationSecs}s`;

            if (result.failedChunks > 0) {
                message += `\n\n⚠️ ${result.failedChunks} chunks failed to embed`;
            }

            vscode.window.showInformationMessage(message, { modal: false });

            // Show errors if any
            if (result.errors.length > 0) {
                logger.warn(`Indexing completed with ${result.errors.length} errors`);
                result.errors.forEach(error => logger.error(error));
            }

            logger.info(`Indexing completed successfully: ${result.successfulChunks} chunks indexed`);
        } else {
            vscode.window.showErrorMessage(
                `Indexing failed: ${result.errors[0] || 'Unknown error'}`,
                { modal: false }
            );
            logger.error('Indexing failed', result.errors);
        }

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Index command failed', error);
        vscode.window.showErrorMessage(`Indexing failed: ${errorMessage}`);
    }
}

/**
 * Command handler for clearing the index
 */
export async function clearCacheCommand() {
    try {
        logger.info('Clear cache command triggered');

        // Confirm with user
        const proceed = await vscode.window.showWarningMessage(
            'Clear all indexed data? This cannot be undone.',
            { modal: true },
            'Clear',
            'Cancel'
        );

        if (proceed !== 'Clear') {
            logger.info('User cancelled cache clearing');
            return;
        }

        // Create indexer and clear
        const indexer = new Indexer();

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Clearing index...',
                cancellable: false
            },
            async () => {
                await indexer.clearIndex();
            }
        );

        vscode.window.showInformationMessage('Index cleared successfully!');
        logger.info('Index cleared');

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Clear cache command failed', error);
        vscode.window.showErrorMessage(`Failed to clear cache: ${errorMessage}`);
    }
}

/**
 * Command handler for showing index statistics
 */
export async function showIndexStatsCommand() {
    try {
        logger.info('Show index stats command triggered');

        const indexer = new Indexer();
        const stats = await indexer.getStats();

        const storageMB = (stats.storageSize / (1024 * 1024)).toFixed(2);

        const message = `📊 Index Statistics\n\n` +
            `📁 Files indexed: ${stats.fileCount}\n` +
            `📦 Total chunks: ${stats.chunkCount}\n` +
            `💾 Storage size: ${storageMB} MB`;

        vscode.window.showInformationMessage(message, { modal: false });
        logger.info('Index stats shown', stats);

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error('Show stats command failed', error);
        vscode.window.showErrorMessage(`Failed to get stats: ${errorMessage}`);
    }
}
