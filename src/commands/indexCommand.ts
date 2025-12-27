import * as vscode from 'vscode';
import { Indexer, IndexingProgress } from '../indexing/indexer';
import { Logger } from '../utils/logger';
import { OllamaClient } from '../ollama/ollamaClient';
import { Config } from '../utils/config';

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

        // Check if selected model is installed
        const modelName = Config.get('modelName', 'nomic-embed-text');
        const ollamaClient = new OllamaClient();

        logger.info(`Checking if model "${modelName}" is installed...`);
        const isModelInstalled = await ollamaClient.isModelInstalled(modelName);

        if (!isModelInstalled) {
            logger.error(`Model "${modelName}" is not installed`);

            const pullModelButton = 'Pull Model';
            const showCommandButton = 'Show Command';
            const changeModelButton = 'Change Model';

            const selection = await vscode.window.showErrorMessage(
                `The selected embedding model "${modelName}" is not installed in Ollama. Please pull the model before indexing.`,
                { modal: true },
                pullModelButton,
                showCommandButton,
                changeModelButton
            );

            if (selection === pullModelButton) {
                // Open terminal and run pull command
                const terminal = vscode.window.createTerminal('Ollama');
                terminal.show();
                terminal.sendText(`ollama pull ${modelName}`);

                vscode.window.showInformationMessage(
                    `Pulling ${modelName}... Please run the index command again after the model is downloaded.`
                );
            } else if (selection === showCommandButton) {
                vscode.window.showInformationMessage(
                    `Run this command in your terminal: ollama pull ${modelName}`,
                    { modal: false }
                );
            } else if (selection === changeModelButton) {
                vscode.commands.executeCommand('workbench.action.openSettings', 'semanticSearch.modelName');
            }

            return;
        }

        logger.info(`Model "${modelName}" is installed, proceeding with indexing`);

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
