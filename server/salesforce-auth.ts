import { getSalesforceJwtService } from './salesforce-jwt-service';
import { getSalesforcePasswordService } from './salesforce-password-service';

/**
 * Unified Salesforce authentication provider
 * Tries JWT first (production), then falls back to username/password OAuth
 */
export async function getAccessToken(): Promise<{ accessToken: string; instanceUrl: string }> {
  // Try JWT Bearer Flow first (preferred for production)
  const jwtService = getSalesforceJwtService();
  if (jwtService && jwtService.isConfigured()) {
    try {
      return await jwtService.getAccessToken();
    } catch (error) {
      console.warn('JWT authentication failed, trying password fallback:', error);
    }
  }
  
  // Fallback to Username-Password OAuth
  const passwordService = getSalesforcePasswordService();
  if (passwordService && passwordService.isConfigured()) {
    try {
      return await passwordService.getAccessToken();
    } catch (error) {
      console.error('Password authentication also failed:', error);
      throw error;
    }
  }
  
  // No authentication methods configured
  throw new Error(
    'Salesforce authentication not configured. Set either:\n' +
    '• JWT: SF_JWT_CLIENT_ID, SF_JWT_USERNAME, SF_JWT_PRIVATE_KEY\n' +
    '• OR Password: SF_OAUTH_CLIENT_ID, SF_OAUTH_CLIENT_SECRET, SF_USERNAME, SF_PASSWORD'
  );
}

/**
 * Check if any Salesforce authentication is configured
 */
export function isAuthConfigured(): boolean {
  const jwtService = getSalesforceJwtService();
  const passwordService = getSalesforcePasswordService();
  
  return !!(jwtService && jwtService.isConfigured()) || 
         !!(passwordService && passwordService.isConfigured());
}