import * as vscode from "vscode";

/**
 * Configuration utility for Semantic Grep
 * Provides type-safe access to extension settings
 */
export class Config {
  private static readonly SECTION = "semanticSearch";

  /**
   * Get configuration value with default fallback
   */
  static get<T>(key: string, defaultValue: T): T {
    const config = vscode.workspace.getConfiguration(this.SECTION);
    return config.get<T>(key, defaultValue);
  }

  /**
   * Set configuration value
   */
  static async set<T>(
    key: string,
    value: T,
    global: boolean = false
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration(this.SECTION);
    const target = global
      ? vscode.ConfigurationTarget.Global
      : vscode.ConfigurationTarget.Workspace;

    await config.update(key, value, target);
  }

  /**
   * Get Ollama URL
   */
  static getOllamaUrl(): string {
    return this.get("ollamaUrl", "http://localhost:11434");
  }

  /**
   * Get model name
   */
  static getModelName(): string {
    return this.get("modelName", "nomic-embed-text");
  }

  /**
   * Get chunk size
   */
  static getChunkSize(): number {
    return this.get("chunkSize", 500);
  }

  /**
   * Get max file size
   */
  static getMaxFileSize(): number {
    return this.get("maxFileSize", 102400); // 100KB
  }

  /**
   * Get exclude patterns
   */
  static getExcludePatterns(): string[] {
    return this.get("excludePatterns", [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/out/**",
      "**/.git/**",
      "**/coverage/**",
      "**/.next/**",
      "**/.vscode/**",
    ]);
  }

  /**
   * Get supported languages
   */
  static getSupportedLanguages(): string[] {
    return this.get("supportedLanguages", [
      "ts",
      "tsx",
      "js",
      "jsx",
      "py",
      "java",
      "go",
      "rust",
      "vue",
      "c",
      "cpp",
      "cs",
      "rb",
      "php",
    ]);
  }

  /**
   * Get auto-index setting
   */
  static getAutoIndex(): boolean {
    return this.get("autoIndex", true);
  }

  /**
   * Get batch size
   */
  static getBatchSize(): number {
    return this.get("batchSize", 32);
  }

  /**
   * Get health check interval
   */
  static getHealthCheckInterval(): number {
    return this.get("healthCheckInterval", 120); // 2 minutes
  }

  /**
   * Get preferred chunker strategy
   */
  static getPreferredChunker(): "auto" | "tree-sitter" | "langchain" {
    return this.get("preferredChunker", "auto");
  }

  /**
   * Get tree-sitter enabled setting
   */
  static getTreeSitterEnabled(): boolean {
    return this.get("treeSitterEnabled", true);
  }

  /**
   * Get hybrid search enabled setting
   */
  static getEnableHybridSearch(): boolean {
    return this.get("enableHybridSearch", false);
  }

  /**
   * Get embedding provider type
   */
  static getEmbeddingProvider(): "ollama" | "openai" {
    return this.get<"ollama" | "openai">("embeddingProvider", "ollama");
  }

  /**
   * Get Ollama embedding model
   */
  static getOllamaEmbeddingModel(): string {
    return this.get("ollama.embeddingModel", "nomic-embed-text");
  }

  /**
   * Get OpenAI embedding model
   */
  static getOpenAIEmbeddingModel(): string {
    return this.get("openai.embeddingModel", "text-embedding-3-small");
  }

  /**
   * Get OpenAI organization ID
   */
  static getOpenAIOrganization(): string | undefined {
    const org = this.get<string>("openai.organization", "");
    return org.length > 0 ? org : undefined;
  }

  /**
   * Get query expansion enabled setting
   */
  static getEnableQueryExpansion(): boolean {
    return this.get("enableQueryExpansion", false);
  }

  /**
   * Get query expansion provider type
   */
  static getQueryExpansionProvider(): "none" | "ollama" | "openai" {
    return this.get<"none" | "ollama" | "openai">(
      "queryExpansionProvider",
      "ollama"
    );
  }

  /**
   * Get Ollama expansion model
   */
  static getOllamaExpansionModel(): string {
    return this.get("ollama.expansionModel", "llama3.2");
  }

  /**
   * Get OpenAI expansion model
   */
  static getOpenAIExpansionModel(): string {
    return this.get("openai.expansionModel", "gpt-4o-mini");
  }
}
