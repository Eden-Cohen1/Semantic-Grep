import * as vscode from 'vscode';
import { OllamaClient } from './ollamaClient';
import { Logger } from '../utils/logger';
import { Config } from '../utils/config';
import { StatusBarManager } from '../ui/statusBar';

export interface HealthStatus {
    ollamaRunning: boolean;
    modelInstalled: boolean;
    message?: string;
}

/**
 * Handles Ollama health checks and connection monitoring
 */
export class HealthChecker {
    private logger = new Logger('HealthChecker');
    private client: OllamaClient;
    private periodicCheckTimer?: NodeJS.Timeout;

    constructor() {
        this.client = new OllamaClient();
    }

    /**
     * Perform comprehensive health check
     * 1. Check if Ollama is running
     * 2. Verify nomic-embed-text model is installed
     */
    async checkHealth(): Promise<HealthStatus> {
        this.logger.info('Performing health check...');

        try {
            // Check if Ollama is running
            const isRunning = await this.client.checkConnection();
            if (!isRunning) {
                this.logger.warn('Ollama is not running');
                return {
                    ollamaRunning: false,
                    modelInstalled: false,
                    message: 'Ollama is not running'
                };
            }

            // Check if model is installed
            const modelInstalled = await this.client.isModelInstalled('nomic-embed-text');
            if (!modelInstalled) {
                this.logger.warn('Nomic Embed Text model not installed');
                return {
                    ollamaRunning: true,
                    modelInstalled: false,
                    message: 'Model not installed'
                };
            }

            this.logger.info('Health check passed - Ollama ready');
            return {
                ollamaRunning: true,
                modelInstalled: true,
                message: 'Ollama ready'
            };

        } catch (error) {
            this.logger.error('Health check failed', error);
            return {
                ollamaRunning: false,
                modelInstalled: false,
                message: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    /**
     * Start periodic health checks
     * Monitors Ollama connection during session
     */
    startPeriodicChecks(context: vscode.ExtensionContext, statusBar: StatusBarManager) {
        const intervalSeconds = Config.get('healthCheckInterval', 120);

        if (intervalSeconds <= 0) {
            this.logger.info('Periodic health checks disabled');
            return;
        }

        this.logger.info(`Starting periodic health checks (every ${intervalSeconds}s)`);

        this.periodicCheckTimer = setInterval(async () => {
            this.logger.debug('Running periodic health check...');

            const status = await this.checkHealth();

            if (!status.ollamaRunning) {
                // Ollama went offline
                this.logger.warn('Ollama connection lost!');
                statusBar.show('$(error) Ollama Offline', 'Connection lost');

                const retryButton = 'Retry';
                const selection = await vscode.window.showWarningMessage(
                    'Lost connection to Ollama. Please ensure Ollama is running.',
                    retryButton
                );

                if (selection === retryButton) {
                    const retryStatus = await this.checkHealth();
                    if (retryStatus.ollamaRunning) {
                        statusBar.show('$(check) Ollama Ready');
                        vscode.window.showInformationMessage('Reconnected to Ollama!');
                    }
                }
            } else if (!status.modelInstalled) {
                statusBar.show('$(warning) Model Missing', 'nomic-embed-text not found');
            } else {
                // All good - update status bar
                statusBar.show('$(check) Ollama Ready');
            }

        }, intervalSeconds * 1000);

        // Clean up on deactivation
        context.subscriptions.push({
            dispose: () => {
                if (this.periodicCheckTimer) {
                    clearInterval(this.periodicCheckTimer);
                    this.logger.info('Stopped periodic health checks');
                }
            }
        });
    }

    /**
     * Stop periodic health checks
     */
    stopPeriodicChecks() {
        if (this.periodicCheckTimer) {
            clearInterval(this.periodicCheckTimer);
            this.periodicCheckTimer = undefined;
            this.logger.info('Stopped periodic health checks');
        }
    }
}
