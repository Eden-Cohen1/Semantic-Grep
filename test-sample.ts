/**
 * User authentication manager
 * Handles user login and session management
 */
export class AuthManager {
    private users: Map<string, User> = new Map();

    /**
     * Register a new user
     * @param user User to register
     */
    registerUser(user: User): void {
        this.users.set(user.id, user);
        console.log(`User ${user.name} registered`);
    }

    /**
     * Authenticate user with credentials
     * @param email User email
     * @param password User password
     */
    async authenticateUser(email: string, password: string): Promise<boolean> {
        const user = Array.from(this.users.values()).find(u => u.email === email);
        if (!user) {
            return false;
        }
        return await this.validatePassword(password, user.passwordHash);
    }

    private async validatePassword(password: string, hash: string): Promise<boolean> {
        // Password validation logic
        return password === hash; // Simplified for demo
    }
}

/**
 * User interface
 */
export interface User {
    id: string;
    name: string;
    email: string;
    passwordHash: string;
}

/**
 * Validate email format
 */
export const validateEmail = (email: string): boolean => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

/**
 * Hash password
 */
export function hashPassword(password: string): string {
    // Simplified hashing
    return Buffer.from(password).toString('base64');
}
