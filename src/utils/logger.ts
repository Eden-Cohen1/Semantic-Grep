import * as vscode from 'vscode';

/**
 * Logging utility for Semantic Grep
 * Writes to VSCode output channel for debugging
 */
export class Logger {
    private static outputChannel: vscode.OutputChannel | undefined;
    private component: string;

    constructor(component: string) {
        this.component = component;

        // Create output channel if not exists
        if (!Logger.outputChannel) {
            Logger.outputChannel = vscode.window.createOutputChannel('Semantic Grep');
        }
    }

    /**
     * Log info message
     */
    info(message: string, ...args: any[]) {
        this.log('INFO', message, args);
    }

    /**
     * Log debug message
     */
    debug(message: string, ...args: any[]) {
        this.log('DEBUG', message, args);
    }

    /**
     * Log warning message
     */
    warn(message: string, ...args: any[]) {
        this.log('WARN', message, args);
    }

    /**
     * Log error message
     */
    error(message: string, error?: any) {
        const errorDetails = error instanceof Error ? error.stack : JSON.stringify(error);
        this.log('ERROR', message, errorDetails ? [errorDetails] : []);
    }

    /**
     * Internal log method
     */
    private log(level: string, message: string, args: any[]) {
        const timestamp = new Date().toISOString();
        const formattedArgs = args.length > 0 ? ` ${JSON.stringify(args)}` : '';
        const logMessage = `[${timestamp}] [${level}] [${this.component}] ${message}${formattedArgs}`;

        Logger.outputChannel?.appendLine(logMessage);

        // Also log to console in development
        if (process.env.NODE_ENV === 'development') {
            console.log(logMessage);
        }
    }

    /**
     * Show the output channel
     */
    static show() {
        Logger.outputChannel?.show();
    }

    /**
     * Clear all logs
     */
    static clear() {
        Logger.outputChannel?.clear();
    }

    /**
     * Dispose of the output channel
     */
    static dispose() {
        Logger.outputChannel?.dispose();
        Logger.outputChannel = undefined;
    }
}
