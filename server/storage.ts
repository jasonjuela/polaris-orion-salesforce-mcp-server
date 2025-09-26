import { type User, type InsertUser, type InsertSalesforceConfig, users } from "@shared/schema";
import { randomUUID } from "crypto";
import { encrypt, decrypt } from "./encryption";
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { eq } from "drizzle-orm";

// modify the interface with any CRUD methods
// you might need

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUserSalesforceConfig(userId: string, config: Partial<User>): Promise<User | undefined>;
  updateUserSalesforceTokens(userId: string, tokens: {
    sf_access_token: string;
    sf_refresh_token?: string;
    sf_token_expires_at?: Date;
    sf_instance_url?: string;
  }): Promise<User | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<string, User>;

  constructor() {
    this.users = new Map();
  }

  async getUser(id: string): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    return this.decryptUserSecrets(user);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = randomUUID();
    const user: User = { 
      ...insertUser, 
      id,
      sf_client_id: null,
      sf_client_secret: null,
      sf_instance_url: null,
      sf_access_token: null,
      sf_refresh_token: null,
      sf_token_expires_at: null,
      sf_oauth_configured: false,
      created_at: new Date(),
      updated_at: new Date()
    };
    this.users.set(id, user);
    return user;
  }

  async updateUserSalesforceConfig(userId: string, config: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;
    
    // Encrypt sensitive fields
    const encryptedConfig = { ...config };
    if (config.sf_client_secret) {
      encryptedConfig.sf_client_secret = encrypt(config.sf_client_secret);
    }
    
    const updatedUser = { 
      ...user, 
      ...encryptedConfig,
      updated_at: new Date() 
    };
    this.users.set(userId, updatedUser);
    return this.decryptUserSecrets(updatedUser);
  }

  async updateUserSalesforceTokens(userId: string, tokens: {
    sf_access_token: string;
    sf_refresh_token?: string;
    sf_token_expires_at?: Date;
    sf_instance_url?: string;
  }): Promise<User | undefined> {
    const user = this.users.get(userId);
    if (!user) return undefined;
    
    // Encrypt sensitive fields
    const encryptedTokens = { ...tokens };
    if (tokens.sf_refresh_token) {
      encryptedTokens.sf_refresh_token = encrypt(tokens.sf_refresh_token);
    }
    
    const updatedUser = { 
      ...user, 
      ...encryptedTokens,
      sf_oauth_configured: true,
      updated_at: new Date()
    };
    this.users.set(userId, updatedUser);
    return this.decryptUserSecrets(updatedUser);
  }
  
  // Decrypt sensitive user data when returning to application
  private decryptUserSecrets(user: User): User {
    const decryptedUser = { ...user };
    
    try {
      if (user.sf_client_secret) {
        console.log('Decrypting client secret for user:', user.id);
        decryptedUser.sf_client_secret = decrypt(user.sf_client_secret);
        console.log('Client secret decrypted successfully');
      }
      if (user.sf_refresh_token) {
        console.log('Decrypting refresh token for user:', user.id);
        decryptedUser.sf_refresh_token = decrypt(user.sf_refresh_token);
        console.log('Refresh token decrypted successfully');
      }
    } catch (error) {
      console.error('Failed to decrypt user secrets for user:', user.id, error);
      // Return user with encrypted fields for security
      throw error; // Let the error bubble up so we can see it
    }
    
    return decryptedUser;
  }
}

class PostgreSQLStorage implements IStorage {
  private db;

  constructor() {
    const sql = neon(process.env.DATABASE_URL!);
    this.db = drizzle(sql);
  }

  async getUser(id: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    if (result.length === 0) return undefined;
    return this.decryptUserSecrets(result[0]);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.username, username)).limit(1);
    if (result.length === 0) return undefined;
    return this.decryptUserSecrets(result[0]);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await this.db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async updateUserSalesforceConfig(userId: string, config: Partial<User>): Promise<User | undefined> {
    // Encrypt sensitive fields
    const encryptedConfig = { ...config };
    if (config.sf_client_secret) {
      encryptedConfig.sf_client_secret = encrypt(config.sf_client_secret);
    }
    
    const result = await this.db.update(users)
      .set({ ...encryptedConfig, updated_at: new Date() })
      .where(eq(users.id, userId))
      .returning();
    
    if (result.length === 0) return undefined;
    return this.decryptUserSecrets(result[0]);
  }

  async updateUserSalesforceTokens(userId: string, tokens: {
    sf_access_token: string;
    sf_refresh_token?: string;
    sf_token_expires_at?: Date;
    sf_instance_url?: string;
  }): Promise<User | undefined> {
    // Encrypt sensitive tokens
    const encryptedTokens = {
      ...tokens,
      sf_access_token: encrypt(tokens.sf_access_token),
      sf_refresh_token: tokens.sf_refresh_token ? encrypt(tokens.sf_refresh_token) : undefined,
      updated_at: new Date()
    };
    
    const result = await this.db.update(users)
      .set(encryptedTokens)
      .where(eq(users.id, userId))
      .returning();
    
    if (result.length === 0) return undefined;
    return this.decryptUserSecrets(result[0]);
  }

  private decryptUserSecrets(user: User): User {
    return {
      ...user,
      sf_client_secret: user.sf_client_secret ? decrypt(user.sf_client_secret) : null,
      sf_access_token: user.sf_access_token ? decrypt(user.sf_access_token) : null,
      sf_refresh_token: user.sf_refresh_token ? decrypt(user.sf_refresh_token) : null,
    };
  }
}

export const storage = new PostgreSQLStorage();
