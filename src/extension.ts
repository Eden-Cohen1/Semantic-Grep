import * as vscode from 'vscode';
import { HealthChecker } from './ollama/healthCheck';
import { StatusBarManager } from './ui/statusBar';
import { Logger } from './utils/logger';
import { Config } from './utils/config';
import { SecretsManager } from './utils/secrets';
import { testChunkerCommand, testChunkerOnWorkspace } from './commands/testChunker';
import { indexWorkspaceCommand, clearCacheCommand } from './commands/indexCommand';
import { SearchWebviewProvider } from './ui/searchWebviewProvider';
import { SearchOrchestrator } from './search/searchOrchestrator';
import { QueryExpander } from './search/queryExpander';
import { Indexer } from './indexing/indexer';
import { IEmbeddingProvider } from './providers/embedding/IEmbeddingProvider';
import { IQueryExpansionProvider } from './providers/expansion/IQueryExpansionProvider';
import { EmbeddingProviderFactory } from './providers/embedding/EmbeddingProviderFactory';
import { QueryExpansionProviderFactory } from './providers/expansion/QueryExpansionProviderFactory';
import { OllamaEmbeddingConfig, OpenAIEmbeddingConfig, OllamaExpansionConfig, OpenAIExpansionConfig } from './providers/models/ProviderConfig';

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

        // Initialize secrets manager
        const secretsManager = new SecretsManager(context);

        // Initialize search functionality
        const indexer = new Indexer();
        const vectorStore = indexer.getVectorStore();

        // Initialize vector store (required for searching)
        await vectorStore.initialize();

        // Create embedding provider based on configuration
        const embeddingProvider = await createEmbeddingProvider(secretsManager);
        if (!embeddingProvider) {
            logger.error('Failed to create embedding provider');
            return;
        }

        // Create query expansion provider if enabled
        let queryExpander: QueryExpander | null = null;
        if (Config.getEnableQueryExpansion()) {
            const expansionProvider = await createExpansionProvider(secretsManager);
            queryExpander = new QueryExpander(expansionProvider);
        }

        const searchOrchestrator = new SearchOrchestrator(
            embeddingProvider,
            queryExpander,
            vectorStore
        );

        // Register WebView provider
        const searchWebviewProvider = new SearchWebviewProvider(
            context.extensionUri,
            searchOrchestrator
        );

        context.subscriptions.push(
            vscode.window.registerWebviewViewProvider(
                SearchWebviewProvider.viewType,
                searchWebviewProvider
            )
        );

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
 * Create embedding provider based on configuration
 */
async function createEmbeddingProvider(secretsManager: SecretsManager): Promise<IEmbeddingProvider | null> {
    const logger = new Logger('ProviderFactory');
    const providerType = Config.getEmbeddingProvider();

    try {
        if (providerType === 'openai') {
            logger.info('Creating OpenAI embedding provider...');

            // Get API key from secrets
            const apiKey = await secretsManager.getOpenAIKey();
            if (!apiKey) {
                const selection = await vscode.window.showWarningMessage(
                    'OpenAI API key not configured. Please add your API key to use OpenAI embeddings.',
                    'Configure API Key',
                    'Use Ollama Instead'
                );

                if (selection === 'Configure API Key') {
                    await vscode.commands.executeCommand('semanticSearch.configureOpenAI');
                    // After configuration, try to get the key again
                    const newApiKey = await secretsManager.getOpenAIKey();
                    if (!newApiKey) {
                        logger.warn('No API key provided, falling back to Ollama');
                        return createOllamaEmbeddingProvider();
                    }
                    return createOpenAIEmbeddingProvider(newApiKey, secretsManager);
                } else {
                    // Fall back to Ollama
                    return createOllamaEmbeddingProvider();
                }
            }

            return createOpenAIEmbeddingProvider(apiKey, secretsManager);
        } else {
            // Ollama provider
            return createOllamaEmbeddingProvider();
        }
    } catch (error) {
        logger.error('Failed to create embedding provider, falling back to Ollama', error);
        return createOllamaEmbeddingProvider();
    }
}

/**
 * Create Ollama embedding provider
 */
async function createOllamaEmbeddingProvider(): Promise<IEmbeddingProvider> {
    const config: OllamaEmbeddingConfig = {
        provider: 'ollama',
        url: Config.getOllamaUrl(),
        model: Config.getOllamaEmbeddingModel() as 'nomic-embed-text' | 'mxbai-embed-large'
    };

    return await EmbeddingProviderFactory.create(config);
}

/**
 * Create OpenAI embedding provider
 */
async function createOpenAIEmbeddingProvider(apiKey: string, secretsManager: SecretsManager): Promise<IEmbeddingProvider> {
    const config: OpenAIEmbeddingConfig = {
        provider: 'openai',
        apiKey,
        model: Config.getOpenAIEmbeddingModel() as 'text-embedding-3-small' | 'text-embedding-3-large',
        organization: Config.getOpenAIOrganization()
    };

    return await EmbeddingProviderFactory.create(config);
}

/**
 * Create query expansion provider based on configuration
 */
async function createExpansionProvider(secretsManager: SecretsManager): Promise<IQueryExpansionProvider | null> {
    const logger = new Logger('ExpansionFactory');
    const providerType = Config.getQueryExpansionProvider();

    if (providerType === 'none') {
        return null;
    }

    try {
        if (providerType === 'openai') {
            logger.info('Creating OpenAI expansion provider...');

            // Get API key from secrets
            const apiKey = await secretsManager.getOpenAIKey();
            if (!apiKey) {
                logger.warn('No OpenAI API key, query expansion disabled');
                return null;
            }

            const config: OpenAIExpansionConfig = {
                provider: 'openai',
                apiKey,
                model: Config.getOpenAIExpansionModel() as 'gpt-4o-mini',
                organization: Config.getOpenAIOrganization()
            };

            return await QueryExpansionProviderFactory.create(config);
        } else {
            // Ollama provider
            logger.info('Creating Ollama expansion provider...');

            const config: OllamaExpansionConfig = {
                provider: 'ollama',
                url: Config.getOllamaUrl(),
                model: Config.getOllamaExpansionModel()
            };

            return await QueryExpansionProviderFactory.create(config);
        }
    } catch (error) {
        logger.error('Failed to create expansion provider', error);
        return null;
    }
}

/**
 * Register all extension commands
 */
function registerCommands(context: vscode.ExtensionContext) {
    // Index workspace command
    const indexCommand = vscode.commands.registerCommand(
        'semanticSearch.indexWorkspace',
        indexWorkspaceCommand
    );

    // Clear cache command
    const clearCacheCmd = vscode.commands.registerCommand(
        'semanticSearch.clearCache',
        clearCacheCommand
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

    // Test chunker commands
    const testChunkerCmd = vscode.commands.registerCommand(
        'semanticSearch.testChunker',
        testChunkerCommand
    );

    const testChunkerWorkspaceCmd = vscode.commands.registerCommand(
        'semanticSearch.testChunkerWorkspace',
        testChunkerOnWorkspace
    );

    // Configure OpenAI API key command
    const configureOpenAICmd = vscode.commands.registerCommand(
        'semanticSearch.configureOpenAI',
        async () => {
            const apiKey = await vscode.window.showInputBox({
                prompt: 'Enter your OpenAI API key',
                password: true,
                placeHolder: 'sk-...',
                ignoreFocusOut: true
            });

            if (apiKey && apiKey.trim().length > 0) {
                const secretsManager = new SecretsManager(context);
                await secretsManager.storeOpenAIKey(apiKey.trim());
                vscode.window.showInformationMessage('OpenAI API key saved securely. Please reload the window for changes to take effect.');
            }
        }
    );

    context.subscriptions.push(
        indexCommand,
        clearCacheCmd,
        healthCheckCommand,
        testChunkerCmd,
        testChunkerWorkspaceCmd,
        configureOpenAICmd
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
