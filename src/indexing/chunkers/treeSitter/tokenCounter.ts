/**
 * Token counting utilities for code chunking
 * Based on the approach from CintraAI/code-chunker
 *
 * The Python implementation uses tiktoken for accurate GPT-4 tokenization.
 * This implementation provides a close approximation optimized for code.
 */

/**
 * Count tokens in a string using GPT-4 approximation
 *
 * GPT-4 tokenization characteristics for code:
 * - Average ~3.5-4 characters per token for English text
 * - Code tends to have more tokens due to symbols and short identifiers
 * - Whitespace is often merged with adjacent tokens
 *
 * @param text The text to count tokens for
 * @param encoding Encoding name (kept for API compatibility)
 * @returns Estimated token count
 */
export function countTokens(text: string, encoding: string = "gpt-4"): number {
    if (!text || text.length === 0) {
        return 0;
    }

    // Simple and reliable approximation:
    // For code, GPT-4 averages about 3.5 characters per token
    // This accounts for:
    // - Keywords (short, often 1 token each)
    // - Identifiers (variable length)
    // - Operators and punctuation (often 1 token each)
    // - Whitespace (usually merged)

    // Count characters excluding excessive whitespace
    const normalizedText = text.replace(/[ \t]+/g, " ");

    // Base estimate: ~3.5 chars per token for code
    let estimate = normalizedText.length / 3.5;

    // Adjust for newlines (each newline is typically its own token)
    const newlines = (text.match(/\n/g) || []).length;
    estimate += newlines * 0.3; // Partial weight since newlines are sometimes merged

    return Math.max(1, Math.round(estimate));
}

/**
 * Simpler token counting - just use character ratio
 * This is the most predictable approach
 *
 * @param text The text to count tokens for
 * @returns Estimated token count
 */
export function countTokensSimple(text: string): number {
    if (!text || text.length === 0) {
        return 0;
    }
    // Conservative estimate: 4 chars per token
    return Math.max(1, Math.ceil(text.length / 4));
}
