import jwt from 'jsonwebtoken';
import axios from 'axios';

export interface SalesforceJwtConfig {
  clientId: string;
  username: string;
  privateKey: string;
  loginUrl: string; // https://login.salesforce.com or https://test.salesforce.com
}

export interface SalesforceTokenResponse {
  access_token: string;
  instance_url: string;
  token_type: string;
  expires_in?: number;
}

export class SalesforceJwtService {
  private config: SalesforceJwtConfig;
  private tokenCache: Map<string, { token: string; instanceUrl: string; expiresAt: number }> = new Map();

  constructor(config: SalesforceJwtConfig) {
    this.config = config;
  }

  /**
   * Get access token using JWT Bearer Flow
   * Server-to-server authentication - no browser redirects needed
   */
  async getAccessToken(username?: string): Promise<{ accessToken: string; instanceUrl: string }> {
    const user = username || this.config.username;
    const cacheKey = user;
    
    // Check cache first (tokens valid for ~10-15 minutes)
    const cached = this.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        accessToken: cached.token,
        instanceUrl: cached.instanceUrl
      };
    }

    try {
      // Create JWT assertion
      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: this.config.clientId,     // Connected App Consumer Key
        sub: user,                     // Salesforce username
        aud: this.config.loginUrl,     // https://login.salesforce.com or test
        exp: now + (5 * 60)            // 5 minutes expiry
      };

      const assertion = jwt.sign(payload, this.config.privateKey, {
        algorithm: 'RS256',
        header: { alg: 'RS256' }
      });

      // Exchange JWT for access token
      const response = await axios.post(
        `${this.config.loginUrl}/services/oauth2/token`,
        new URLSearchParams({
          grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
          assertion: assertion
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          },
          timeout: 10000
        }
      );

      const tokenData: SalesforceTokenResponse = response.data;
      
      // Cache token (expire 5 minutes before actual expiry for safety)
      const expiresIn = tokenData.expires_in || 3600; // Default 1 hour
      const expiresAt = Date.now() + ((expiresIn - 300) * 1000); // 5 min buffer
      
      this.tokenCache.set(cacheKey, {
        token: tokenData.access_token,
        instanceUrl: tokenData.instance_url,
        expiresAt
      });

      return {
        accessToken: tokenData.access_token,
        instanceUrl: tokenData.instance_url
      };

    } catch (error: any) {
      console.error('JWT Bearer Flow failed:', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      // Clear cache on error
      this.tokenCache.delete(cacheKey);
      
      throw new Error(`Salesforce JWT authentication failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Clear cached tokens (useful for testing or logout)
   */
  clearCache(username?: string): void {
    if (username) {
      this.tokenCache.delete(username);
    } else {
      this.tokenCache.clear();
    }
  }

  /**
   * Validate if JWT configuration is complete
   */
  isConfigured(): boolean {
    return !!(
      this.config.clientId &&
      this.config.username &&
      this.config.privateKey &&
      this.config.loginUrl
    );
  }
}

// Global JWT service instance
let jwtService: SalesforceJwtService | null = null;

export function initializeSalesforceJwtService(): SalesforceJwtService | null {
  const clientId = process.env.SF_JWT_CLIENT_ID;
  const username = process.env.SF_JWT_USERNAME;
  const privateKey = process.env.SF_JWT_PRIVATE_KEY;
  const loginUrl = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';

  if (!clientId || !username || !privateKey) {
    // JWT is optional - we're using Username-Password OAuth instead
    return null;
  }

  try {
    jwtService = new SalesforceJwtService({
      clientId,
      username,
      privateKey,
      loginUrl
    });
    
    console.log('Salesforce JWT Bearer Flow initialized for server-managed authentication');
    return jwtService;
  } catch (error) {
    console.error('Failed to initialize Salesforce JWT service:', error);
    return null;
  }
}

export function getSalesforceJwtService(): SalesforceJwtService | null {
  return jwtService;
}