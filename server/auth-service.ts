import bcrypt from 'bcrypt';
import { storage } from './storage';
import { createAuthenticatedSession, destroySession } from './session';
import type { User, InsertUser } from '@shared/schema';

// Password hashing configuration
const SALT_ROUNDS = 12; // High security for production

export interface LoginCredentials {
  username: string;
  password: string;
}

export interface LoginResult {
  success: boolean;
  user?: User;
  message: string;
}

export class AuthenticationService {
  // Hash password securely before storage
  static async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, SALT_ROUNDS);
  }

  // Verify password against stored hash
  static async verifyPassword(password: string, hashedPassword: string): Promise<boolean> {
    return bcrypt.compare(password, hashedPassword);
  }

  // Validate login credentials
  static async validateCredentials(credentials: LoginCredentials): Promise<LoginResult> {
    try {
      // Input validation
      if (!credentials.username || !credentials.password) {
        return {
          success: false,
          message: 'Username and password are required'
        };
      }

      // Username security: prevent injection attacks
      if (credentials.username.length > 100 || !/^[a-zA-Z0-9_@.-]+$/.test(credentials.username)) {
        return {
          success: false,
          message: 'Invalid username format'
        };
      }

      // Password security: basic checks
      if (credentials.password.length < 4) {
        return {
          success: false,
          message: 'Password must be at least 4 characters'
        };
      }

      // Find user by username
      const user = await storage.getUserByUsername(credentials.username);
      if (!user) {
        return {
          success: false,
          message: 'Invalid username or password'
        };
      }

      // Verify password
      const isValidPassword = await this.verifyPassword(credentials.password, user.password);
      if (!isValidPassword) {
        return {
          success: false,
          message: 'Invalid username or password'
        };
      }

      return {
        success: true,
        user,
        message: 'Authentication successful'
      };
    } catch (error) {
      console.error('Authentication error:', error);
      return {
        success: false,
        message: 'Authentication system error'
      };
    }
  }

  // Create a new user account (for development/testing)
  static async createUser(userData: LoginCredentials): Promise<LoginResult> {
    try {
      // Check if user already exists
      const existingUser = await storage.getUserByUsername(userData.username);
      if (existingUser) {
        return {
          success: false,
          message: 'User already exists'
        };
      }

      // Hash password
      const hashedPassword = await this.hashPassword(userData.password);

      // Create user
      const newUser: InsertUser = {
        username: userData.username,
        password: hashedPassword
      };

      const user = await storage.createUser(newUser);

      return {
        success: true,
        user,
        message: 'User created successfully'
      };
    } catch (error) {
      console.error('User creation error:', error);
      return {
        success: false,
        message: 'Failed to create user account'
      };
    }
  }

  // Establish authenticated session with security regeneration
  static createSession(req: any, user: User, callback?: (err?: any) => void): void {
    createAuthenticatedSession(req, user.id, user.username, callback);
  }

  // Destroy user session securely
  static destroyUserSession(req: any, callback?: (err?: any) => void): void {
    destroySession(req, callback);
  }
}