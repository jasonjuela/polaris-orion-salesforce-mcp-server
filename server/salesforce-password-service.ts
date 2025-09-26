import axios from 'axios';

export interface SalesforcePasswordConfig {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string; // password + security token if required
  loginUrl: string; // https://login.salesforce.com or https://test.salesforce.com
}

export interface SalesforceTokenResponse {
  access_token: string;
  instance_url: string;
  token_type: string;
  expires_in?: number;
}

export class SalesforcePasswordService {
  private config: SalesforcePasswordConfig;
  private tokenCache: Map<string, { token: string; instanceUrl: string; expiresAt: number }> = new Map();

  constructor(config: SalesforcePasswordConfig) {
    this.config = config;
  }

  /**
   * Get access token using Username-Password OAuth Flow
   * Simple server-to-server authentication - no browser required
   */
  async getAccessToken(): Promise<{ accessToken: string; instanceUrl: string }> {
    const cacheKey = this.config.username;
    
    // Check cache first (tokens valid for ~1-2 hours)
    const cached = this.tokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        accessToken: cached.token,
        instanceUrl: cached.instanceUrl
      };
    }

    try {
      // Exchange username/password for access token
      const response = await axios.post(
        `${this.config.loginUrl}/services/oauth2/token`,
        new URLSearchParams({
          grant_type: 'password',
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          username: this.config.username,
          password: this.config.password
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
      console.error('Password OAuth failed:', {
        error: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      
      // Clear cache on error
      this.tokenCache.delete(cacheKey);
      
      throw new Error(`Salesforce password authentication failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Clear cached tokens
   */
  clearCache(): void {
    this.tokenCache.clear();
  }

  /**
   * Validate if password configuration is complete
   */
  isConfigured(): boolean {
    return !!(
      this.config.clientId &&
      this.config.clientSecret &&
      this.config.username &&
      this.config.password &&
      this.config.loginUrl
    );
  }
}

// Global password service instance
let passwordService: SalesforcePasswordService | null = null;

export function initializeSalesforcePasswordService(): SalesforcePasswordService | null {
  const clientId = process.env.SF_OAUTH_CLIENT_ID;
  const clientSecret = process.env.SF_OAUTH_CLIENT_SECRET;
  const username = process.env.SF_USERNAME;
  const password = process.env.SF_PASSWORD;
  const loginUrl = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';

  if (!clientId || !clientSecret || !username || !password) {
    console.warn('Salesforce password auth not configured - missing environment variables');
    console.warn('Required: SF_OAUTH_CLIENT_ID, SF_OAUTH_CLIENT_SECRET, SF_USERNAME, SF_PASSWORD');
    return null;
  }

  try {
    passwordService = new SalesforcePasswordService({
      clientId,
      clientSecret,
      username,
      password,
      loginUrl
    });
    
    console.log('Salesforce Username-Password OAuth initialized for server authentication');
    return passwordService;
  } catch (error) {
    console.error('Failed to initialize Salesforce password service:', error);
    return null;
  }
}

export function getSalesforcePasswordService(): SalesforcePasswordService | null {
  return passwordService;
}