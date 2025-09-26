import { z } from 'zod';
import axios from 'axios';
import crypto from 'crypto';

// PKCE helper functions for modern OAuth security
function base64URLEncode(str: Buffer): string {
  return str
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function generateCodeVerifier(): string {
  return base64URLEncode(crypto.randomBytes(32));
}

function generateCodeChallenge(codeVerifier: string): string {
  return base64URLEncode(crypto.createHash('sha256').update(codeVerifier).digest());
}

// Salesforce OAuth configuration
const SALESFORCE_OAUTH_URL = 'https://login.salesforce.com/services/oauth2';

// OAuth request schemas
export const oauthConfigSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  clientSecret: z.string().min(1, 'Client Secret is required'),
  instanceUrl: z.string().url('Invalid instance URL'),
  redirectUri: z.string().url('Invalid redirect URI').optional()
});

export const oauthCallbackSchema = z.object({
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().optional()
});

export type OAuthConfig = z.infer<typeof oauthConfigSchema>;
export type OAuthCallback = z.infer<typeof oauthCallbackSchema>;

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  instance_url: string;
  id: string;
  token_type: string;
  issued_at: string;
  signature: string;
  expires_in?: number;
}

export class SalesforceOAuthService {
  /**
   * Generate OAuth authorization URL with PKCE support
   */
  static generateAuthUrl(config: OAuthConfig, appOrigin: string, state: string): { authUrl: string, codeVerifier: string } {
    const redirectUri = `${appOrigin}/api/oauth/callback`;
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: redirectUri,
      scope: 'api refresh_token offline_access',
      state: state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });

    return {
      authUrl: `${config.instanceUrl}/services/oauth2/authorize?${params.toString()}`,
      codeVerifier: codeVerifier
    };
  }

  /**
   * Exchange authorization code for tokens with PKCE support
   */
  static async exchangeCodeForTokens(
    code: string, 
    config: OAuthConfig,
    appOrigin: string,
    codeVerifier: string
  ): Promise<TokenResponse> {
    const redirectUri = `${appOrigin}/api/oauth/callback`;
    
    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      code: code,
      code_verifier: codeVerifier
    });

    try {
      const response = await axios.post(
        `${SALESFORCE_OAUTH_URL}/token`,
        params,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          },
          timeout: 30000
        }
      );

      if (response.status !== 200) {
        throw new Error(`OAuth token exchange failed: ${response.status} ${response.statusText}`);
      }

      const tokenData = response.data as TokenResponse;
      
      // Validate required fields
      if (!tokenData.access_token || !tokenData.refresh_token) {
        throw new Error('Invalid token response: missing access_token or refresh_token');
      }

      return tokenData;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error_description || error.message;
        throw new Error(`OAuth token exchange failed: ${message}`);
      }
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  static async refreshAccessToken(
    refreshToken: string, 
    config: Pick<OAuthConfig, 'clientId' | 'clientSecret'>
  ): Promise<TokenResponse> {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: refreshToken
    });

    try {
      const response = await axios.post(
        `${SALESFORCE_OAUTH_URL}/token`,
        params,
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json'
          },
          timeout: 30000
        }
      );

      if (response.status !== 200) {
        throw new Error(`Token refresh failed: ${response.status} ${response.statusText}`);
      }

      const tokenData = response.data as TokenResponse;
      
      if (!tokenData.access_token) {
        throw new Error('Invalid refresh response: missing access_token');
      }

      return tokenData;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error_description || error.message;
        throw new Error(`Token refresh failed: ${message}`);
      }
      throw error;
    }
  }

  /**
   * Check if token is expired or will expire soon
   */
  static isTokenExpired(expiresAt: Date, bufferMinutes: number = 5): boolean {
    const now = new Date();
    const bufferMs = bufferMinutes * 60 * 1000;
    return expiresAt.getTime() - bufferMs <= now.getTime();
  }

  /**
   * Calculate token expiration time
   */
  static calculateExpirationTime(expiresIn: number = 3600): Date {
    return new Date(Date.now() + (expiresIn * 1000));
  }

  /**
   * Generate secure random state for OAuth flow
   */
  static generateState(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Validate OAuth state parameter
   */
  static validateState(receivedState: string, expectedState: string): boolean {
    return receivedState === expectedState;
  }
}