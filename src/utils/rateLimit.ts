/**
 * Rate Limiter
 * Token bucket implementation for API rate limiting
 */

import { Logger } from './logger';

const logger = new Logger('RateLimiter');

/**
 * Token bucket rate limiter for API requests
 */
export class RateLimiter {
    private tokens: number;
    private lastRefill: number;
    private readonly tokensPerMinute: number;
    private readonly requestsPerMinute: number;

    constructor(requestsPerMinute: number, tokensPerMinute: number = Infinity) {
        this.requestsPerMinute = requestsPerMinute;
        this.tokensPerMinute = tokensPerMinute;
        this.tokens = requestsPerMinute;
        this.lastRefill = Date.now();

        logger.info(`Rate limiter initialized: ${requestsPerMinute} req/min, ${tokensPerMinute} tokens/min`);
    }

    /**
     * Wait for a token to become available
     * Blocks until rate limit allows the request
     */
    async waitForToken(): Promise<void> {
        const now = Date.now();
        const timeSinceRefill = now - this.lastRefill;

        // Refill tokens based on time passed
        if (timeSinceRefill >= 60000) {
            this.tokens = this.requestsPerMinute;
            this.lastRefill = now;
            logger.debug('Rate limiter refilled');
        } else {
            // Partial refill based on time passed
            const tokensToAdd = (timeSinceRefill / 60000) * this.requestsPerMinute;
            this.tokens = Math.min(this.tokens + tokensToAdd, this.requestsPerMinute);
            this.lastRefill = now;
        }

        // If no tokens available, wait until next refill
        if (this.tokens < 1) {
            const waitTime = 60000 - timeSinceRefill;
            logger.debug(`Rate limit reached, waiting ${waitTime}ms`);
            await this.sleep(waitTime);
            this.tokens = this.requestsPerMinute;
            this.lastRefill = Date.now();
        }

        // Consume a token
        this.tokens--;
    }

    /**
     * Check if a request can be made without waiting
     */
    canMakeRequest(): boolean {
        const now = Date.now();
        const timeSinceRefill = now - this.lastRefill;

        if (timeSinceRefill >= 60000) {
            return true;
        }

        const tokensToAdd = (timeSinceRefill / 60000) * this.requestsPerMinute;
        const currentTokens = Math.min(this.tokens + tokensToAdd, this.requestsPerMinute);

        return currentTokens >= 1;
    }

    /**
     * Sleep for specified milliseconds
     */
    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Reset the rate limiter
     */
    reset(): void {
        this.tokens = this.requestsPerMinute;
        this.lastRefill = Date.now();
        logger.debug('Rate limiter reset');
    }
}
