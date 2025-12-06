import * as vscode from 'vscode';
import { HealthChecker } from './ollama/healthCheck';
import { StatusBarManager } from './ui/statusBar';
import { Logger } from './utils/logger';

/**
 * Extension entry point
 * Activates on workspace open and performs Ollama health check
 */
export async function activate(context: vscode.ExtensionContext) {
    const logger = new Logger('Extension');
    logger.info('Semantic Grep activating...');

    try {
        // Initialize status bar
        const statusBar = new StatusBarManager();
        statusBar.show('$(sync~spin) Checking Ollama...');
        context.subscriptions.push(statusBar);

        // Perform Ollama health check
        const healthChecker = new HealthChecker();
        const healthStatus = await healthChecker.checkHealth();

        if (!healthStatus.ollamaRunning) {
            // Ollama not running - show error and exit
            statusBar.show('$(error) Ollama Offline', 'Ollama is not running');
            await showOllamaNotRunningError();
            logger.error('Ollama is not running. Extension activation aborted.');
            return; // Don't activate extension
        }

        if (!healthStatus.modelInstalled) {
            // Model not installed - show warning
            statusBar.show('$(warning) Model Missing', 'nomic-embed-text not found');
            await showModelMissingWarning();
            logger.warn('Nomic Embed Text model not installed.');
            // Continue activation but in degraded mode
        }

        // Success - Ollama is ready
        statusBar.show('$(check) Ollama Ready');
        logger.info('Ollama health check passed. Extension ready.');

        // Register commands
        registerCommands(context);

        // Start periodic health checks
        healthChecker.startPeriodicChecks(context, statusBar);

        logger.info('Semantic Grep activated successfully!');

    } catch (error) {
        logger.error('Failed to activate extension', error);
        vscode.window.showErrorMessage(`Semantic Grep activation failed: ${error}`);
    }
}

/**
 * Extension deactivation
 */
export function deactivate() {
    const logger = new Logger('Extension');
    logger.info('Semantic Grep deactivated.');
}

/**
 * Register all extension commands
 */
function registerCommands(context: vscode.ExtensionContext) {
    // TODO: Import and register actual command handlers

    // Search command
    const searchCommand = vscode.commands.registerCommand(
        'semanticSearch.search',
        async () => {
            vscode.window.showInformationMessage('Search command - coming soon!');
        }
    );

    // Index workspace command
    const indexCommand = vscode.commands.registerCommand(
        'semanticSearch.indexWorkspace',
        async () => {
            vscode.window.showInformationMessage('Index workspace command - coming soon!');
        }
    );

    // Clear cache command
    const clearCacheCommand = vscode.commands.registerCommand(
        'semanticSearch.clearCache',
        async () => {
            vscode.window.showInformationMessage('Clear cache command - coming soon!');
        }
    );

    // Health check command
    const healthCheckCommand = vscode.commands.registerCommand(
        'semanticSearch.checkHealth',
        async () => {
            const healthChecker = new HealthChecker();
            const status = await healthChecker.checkHealth();
            const message = `Ollama: ${status.ollamaRunning ? 'Running' : 'Offline'}\nModel: ${status.modelInstalled ? 'Installed' : 'Missing'}`;
            vscode.window.showInformationMessage(message);
        }
    );

    context.subscriptions.push(
        searchCommand,
        indexCommand,
        clearCacheCommand,
        healthCheckCommand
    );
}

/**
 * Show error message when Ollama is not running
 */
async function showOllamaNotRunningError() {
    const installButton = 'Install Ollama';
    const setupGuideButton = 'Setup Guide';

    const selection = await vscode.window.showErrorMessage(
        'Semantic Grep requires Ollama to be running. Please install and start Ollama.',
        installButton,
        setupGuideButton
    );

    if (selection === installButton) {
        vscode.env.openExternal(vscode.Uri.parse('https://ollama.ai/download'));
    } else if (selection === setupGuideButton) {
        // TODO: Open setup guide
        vscode.window.showInformationMessage('Setup guide coming soon!');
    }
}

/**
 * Show warning when model is not installed
 */
async function showModelMissingWarning() {
    const pullModelButton = 'Pull Model';
    const showCommandButton = 'Show Command';

    const selection = await vscode.window.showWarningMessage(
        'Nomic Embed Text model not found. Please pull the model to use Semantic Grep.',
        pullModelButton,
        showCommandButton
    );

    if (selection === pullModelButton) {
        // Open terminal and run pull command
        const terminal = vscode.window.createTerminal('Ollama');
        terminal.show();
        terminal.sendText('ollama pull nomic-embed-text');
    } else if (selection === showCommandButton) {
        vscode.window.showInformationMessage(
            'Run this command in your terminal: ollama pull nomic-embed-text'
        );
    }
}
