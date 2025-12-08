import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import fg from 'fast-glob';
import { Logger } from '../utils/logger';
import { Config } from '../utils/config';

export interface ScanResult {
    files: string[];
    totalSize: number;
    skippedFiles: number;
    skippedReasons: Map<string, number>;
}

export interface ScanOptions {
    maxFileSize?: number;
    supportedLanguages?: string[];
    excludePatterns?: string[];
    respectGitignore?: boolean;
}

/**
 * Scans workspace for indexable code files
 * Respects .gitignore, user exclusions, and file size limits
 */
export class FileScanner {
    private logger = new Logger('FileScanner');

    /**
     * Scan workspace for files to index
     */
    async scanWorkspace(options: ScanOptions = {}): Promise<ScanResult> {
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error('No workspace folder open');
        }

        // Use first workspace folder
        const workspaceRoot = workspaceFolders[0].uri.fsPath;
        this.logger.info(`Scanning workspace: ${workspaceRoot}`);

        return this.scanDirectory(workspaceRoot, options);
    }

    /**
     * Scan a specific directory
     */
    async scanDirectory(
        directory: string,
        options: ScanOptions = {}
    ): Promise<ScanResult> {
        const startTime = Date.now();

        // Get options with defaults
        const maxFileSize = options.maxFileSize ?? Config.getMaxFileSize();
        const supportedLanguages = options.supportedLanguages ?? Config.getSupportedLanguages();
        const excludePatterns = options.excludePatterns ?? Config.getExcludePatterns();
        // Note: gitignore support is provided through excludePatterns
        // Users should add .gitignore patterns to their excludePatterns config

        this.logger.info('Scan configuration:', {
            maxFileSize,
            supportedLanguages: supportedLanguages.length,
            excludePatterns: excludePatterns.length
        });

        // Build glob patterns for supported file extensions
        const includePatterns = this.buildIncludePatterns(supportedLanguages);

        this.logger.debug(`Include patterns: ${includePatterns.join(', ')}`);
        this.logger.debug(`Exclude patterns: ${excludePatterns.join(', ')}`);

        // Scan files using fast-glob
        const foundFiles = await fg(includePatterns, {
            cwd: directory,
            absolute: true,
            ignore: excludePatterns,
            dot: false, // Don't include hidden files
            onlyFiles: true,
            followSymbolicLinks: false
        });

        this.logger.info(`Found ${foundFiles.length} files matching patterns`);

        // Filter by file size
        const result = await this.filterBySize(foundFiles, maxFileSize);

        const elapsed = Date.now() - startTime;
        this.logger.info(`Scan complete in ${elapsed}ms: ${result.files.length} files, ${result.skippedFiles} skipped`);

        return result;
    }

    /**
     * Build glob patterns for supported file extensions
     */
    private buildIncludePatterns(extensions: string[]): string[] {
        // Convert extensions to glob patterns
        // ['ts', 'js'] => ['**/*.ts', '**/*.js']
        return extensions.map(ext => `**/*.${ext}`);
    }

    /**
     * Filter files by size and collect statistics
     */
    private async filterBySize(
        files: string[],
        maxFileSize: number
    ): Promise<ScanResult> {
        const validFiles: string[] = [];
        let totalSize = 0;
        let skippedFiles = 0;
        const skippedReasons = new Map<string, number>();

        for (const file of files) {
            try {
                const stats = await fs.promises.stat(file);

                if (stats.size > maxFileSize) {
                    skippedFiles++;
                    const reason = `File too large (${this.formatBytes(stats.size)} > ${this.formatBytes(maxFileSize)})`;
                    skippedReasons.set(reason, (skippedReasons.get(reason) || 0) + 1);
                    this.logger.debug(`Skipping large file: ${file} (${stats.size} bytes)`);
                    continue;
                }

                if (stats.size === 0) {
                    skippedFiles++;
                    const reason = 'Empty file';
                    skippedReasons.set(reason, (skippedReasons.get(reason) || 0) + 1);
                    this.logger.debug(`Skipping empty file: ${file}`);
                    continue;
                }

                validFiles.push(file);
                totalSize += stats.size;

            } catch (error) {
                skippedFiles++;
                const reason = 'File access error';
                skippedReasons.set(reason, (skippedReasons.get(reason) || 0) + 1);
                this.logger.warn(`Cannot access file: ${file}`, error);
            }
        }

        return {
            files: validFiles,
            totalSize,
            skippedFiles,
            skippedReasons
        };
    }

    /**
     * Check if a file should be indexed based on extension
     */
    isSupported(filePath: string, supportedLanguages?: string[]): boolean {
        const extensions = supportedLanguages ?? Config.getSupportedLanguages();
        const ext = path.extname(filePath).slice(1); // Remove leading dot
        return extensions.includes(ext);
    }

    /**
     * Check if a file is excluded by patterns
     */
    isExcluded(filePath: string, excludePatterns?: string[]): boolean {
        const patterns = excludePatterns ?? Config.getExcludePatterns();

        // Normalize path separators
        const normalizedPath = filePath.replace(/\\/g, '/');

        for (const pattern of patterns) {
            // Simple pattern matching (can be enhanced with minimatch)
            const regexPattern = pattern
                .replace(/\*\*/g, '.*')
                .replace(/\*/g, '[^/]*')
                .replace(/\?/g, '.');

            const regex = new RegExp(regexPattern);
            if (regex.test(normalizedPath)) {
                return true;
            }
        }

        return false;
    }

    /**
     * Get file extension
     */
    getExtension(filePath: string): string {
        return path.extname(filePath).slice(1);
    }

    /**
     * Format bytes to human-readable string
     */
    private formatBytes(bytes: number): string {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
    }

    /**
     * Get scan summary as human-readable string
     */
    formatScanResult(result: ScanResult): string {
        const lines = [
            `Found ${result.files.length} indexable files`,
            `Total size: ${this.formatBytes(result.totalSize)}`,
        ];

        if (result.skippedFiles > 0) {
            lines.push(`Skipped ${result.skippedFiles} files:`);
            for (const [reason, count] of result.skippedReasons) {
                lines.push(`  - ${reason}: ${count}`);
            }
        }

        return lines.join('\n');
    }
}
