import type { Express } from "express";
import { createServer, type Server } from "http";
import { salesforceService, validateSalesforceUrl } from "./salesforce";
import { salesforceErrorHandler } from "./error-handler";
import { RateLimiter } from "./rate-limiter";
import { requestMonitoringMiddleware, errorMonitoringMiddleware, registerMonitoringRoutes } from "./monitoring";
import { requireApiKey, requireAuthentication, logAuthEvent, type AuthenticatedRequest } from "./auth";
import { AuthenticationService, type LoginCredentials } from "./auth-service";
import { isAuthenticated } from "./session";
import { csrfTokenHandler, csrfProtection } from "./security";
import { initializeSalesforceJwtService, getSalesforceJwtService } from "./salesforce-jwt-service";
import { initializeSalesforcePasswordService } from "./salesforce-password-service";
import { getAccessToken as getSalesforceAuth } from "./salesforce-auth";
import { SalesforceOAuthService, oauthConfigSchema, oauthCallbackSchema } from "./oauth";
import { storage } from "./storage";

// Async wrapper to handle errors properly with Express
function asyncHandler(fn: Function) {
  return (req: AuthenticatedRequest, res: any, next: any) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Initialize Salesforce authentication services (JWT + Password fallback)
  initializeSalesforceJwtService();
  initializeSalesforcePasswordService();
  
  // Add request monitoring middleware before any other middleware
  app.use(requestMonitoringMiddleware());
  
  // Register monitoring and health check routes
  registerMonitoringRoutes(app);

  // ========== OAUTH CALLBACK ENDPOINT - MUST BE FIRST ==========
  // CRITICAL: This route must be registered before any auth middleware
  // to allow cross-site OAuth redirects from Salesforce to work
  app.get('/api/oauth/callback', asyncHandler(async (req: any, res: any) => {
    
    try {
      const { code, state, error } = req.query;
      
      // Handle OAuth errors
      if (error) {
        return res.redirect(`/?oauth_error=${encodeURIComponent(error)}`);
      }
      
      if (!code || !state) {
        return res.redirect('/?oauth_error=missing_parameters');
      }
      
      // Validate state parameter (CSRF protection)
      if (!req.session?.oauthState) {
        return res.redirect('/?oauth_error=invalid_state_no_session');
      }
      
      if (!SalesforceOAuthService.validateState(state, req.session.oauthState)) {
        return res.redirect('/?oauth_error=invalid_state_mismatch');
      }
      
      // Clear OAuth state from session
      delete req.session.oauthState;
      
      // Get user from session (may be missing if session expired)
      if (!req.session?.userId) {
        return res.redirect('/?oauth_error=session_expired');
      }
      
      const user = await storage.getUser(req.session.userId);
      if (!user || !user.sf_client_id || !user.sf_client_secret || !user.sf_instance_url) {
        return res.redirect('/?oauth_error=configuration_missing');
      }
      
      // Get app origin for redirect URI
      const host = req.get('host');
      const appOrigin = `https://${host}`;
      
      // Get PKCE code verifier from session
      if (!req.session?.oauthCodeVerifier) {
        return res.redirect('/?oauth_error=missing_code_verifier');
      }
      
      // Exchange authorization code for tokens
      const tokenResponse = await SalesforceOAuthService.exchangeCodeForTokens(
        code,
        {
          clientId: user.sf_client_id,
          clientSecret: user.sf_client_secret,
          instanceUrl: user.sf_instance_url
        },
        appOrigin,
        req.session.oauthCodeVerifier
      );
      
      // Clear code verifier from session
      delete req.session.oauthCodeVerifier;
      
      // Store tokens in database
      const expiresAt = SalesforceOAuthService.calculateExpirationTime(tokenResponse.expires_in);
      const updatedUser = await storage.updateUserSalesforceTokens(req.session.userId, {
        sf_access_token: tokenResponse.access_token,
        sf_refresh_token: tokenResponse.refresh_token,
        sf_token_expires_at: expiresAt,
        sf_instance_url: tokenResponse.instance_url
      });
      
      if (!updatedUser) {
        return res.redirect('/?oauth_error=user_update_failed');
      }
      
      // Update session with Salesforce credentials
      (req.session as any).salesforceCredentials = {
        accessToken: tokenResponse.access_token,
        instanceUrl: tokenResponse.instance_url
      };
      
      // Redirect to success page
      res.redirect('/?oauth_success=true');
    } catch (error: any) {
      res.redirect(`/?oauth_error=${encodeURIComponent(error.message)}`);
    }
  }));

  // ========== PUBLIC AUTHENTICATION ENDPOINTS ==========
  // These endpoints must be accessible without authentication

  // Login endpoint - establishes authenticated session
  app.post('/api/auth/login', RateLimiter.general(), asyncHandler(async (req: any, res: any) => {
    const credentials: LoginCredentials = req.body;
    
    if (!credentials.username || !credentials.password) {
      return res.status(400).json({
        success: false,
        message: 'Username and password are required',
        timestamp: new Date().toISOString()
      });
    }

    const loginResult = await AuthenticationService.validateCredentials(credentials);
    
    if (loginResult.success && loginResult.user) {
      // Create authenticated session with security regeneration
      AuthenticationService.createSession(req, loginResult.user, (err) => {
        if (err) {
          console.error('Session creation failed:', err);
          return res.status(500).json({
            success: false,
            message: 'Login failed due to session error',
            timestamp: new Date().toISOString()
          });
        }
        
        res.json({
          success: true,
          message: loginResult.message,
          user: {
            id: loginResult.user!.id,
            username: loginResult.user!.username
          },
          timestamp: new Date().toISOString()
        });
      });
    } else {
      res.status(401).json({
        success: false,
        message: loginResult.message,
        timestamp: new Date().toISOString()
      });
    }
  }));

  // Logout endpoint - destroys session securely
  app.post('/api/auth/logout', asyncHandler(async (req: any, res: any) => {
    if (req.session) {
      AuthenticationService.destroyUserSession(req, (err) => {
        if (err) {
          console.error('Session destruction failed:', err);
        }
        
        res.json({
          success: true,
          message: 'Logged out successfully',
          timestamp: new Date().toISOString()
        });
      });
    } else {
      res.json({
        success: true,
        message: 'No active session to logout',
        timestamp: new Date().toISOString()
      });
    }
  }));

  // Session status endpoint - checks if user is authenticated
  app.get('/api/auth/status', asyncHandler(async (req: any, res: any) => {
    if (isAuthenticated(req)) {
      res.json({
        authenticated: true,
        user: {
          id: req.session.userId,
          username: req.session.username
        },
        authType: 'session',
        timestamp: new Date().toISOString()
      });
    } else {
      res.json({
        authenticated: false,
        requiresLogin: true,
        timestamp: new Date().toISOString()
      });
    }
  }));

  // CSRF token endpoint - provides security token for forms
  app.get('/api/auth/csrf-token', csrfTokenHandler);

  // Development endpoint - Create user account (remove in production)
  if (process.env.NODE_ENV === 'development') {
    app.post('/api/auth/register', RateLimiter.general(), asyncHandler(async (req: any, res: any) => {
      const credentials: LoginCredentials = req.body;
      
      if (!credentials.username || !credentials.password) {
        return res.status(400).json({
          success: false,
          message: 'Username and password are required'
        });
      }

      const result = await AuthenticationService.createUser(credentials);
      
      if (result.success) {
        res.json({
          success: true,
          message: result.message,
          user: result.user ? {
            id: result.user.id,
            username: result.user.username
          } : null
        });
      } else {
        res.status(400).json({
          success: false,
          message: result.message
        });
      }
    }));
  }

  // ========== PROTECTED API ROUTES ==========
  // Switch to dual authentication (session + API key support)
  
  app.use('/api', (req: AuthenticatedRequest, res, next) => {
    // Skip authentication for public endpoints  
    if (req.path === '/health/live' || req.path === '/health/ready' || 
        req.path === '/auth/login' || req.path === '/auth/logout' || 
        req.path === '/auth/register' || req.path === '/auth/status' ||
        req.path === '/auth/csrf-token' || req.path === '/oauth/callback') {
      return next();
    }
    
    // Apply dual authentication (session OR API key) - including chatbot endpoints for security
    return requireAuthentication()(req, res, next);
  });

  // CRITICAL: Apply CSRF protection to all authenticated API routes (except OAuth callback and chatbot endpoints)
  app.use('/api', (req, res, next) => {
    // Skip CSRF protection for OAuth callback and chatbot endpoints
    if (req.path === '/oauth/callback' || req.path.startsWith('/chatbot/')) {
      return next();
    }
    return csrfProtection(req, res, next);
  });

  // Apply general rate limiting to all API routes after authentication and CSRF
  app.use('/api', RateLimiter.general());

  // ========== OAUTH CONFIGURATION ENDPOINTS ==========
  // OAuth setup and management for server-side persistent authentication
  
  // Configure OAuth credentials endpoint
  app.post('/api/oauth/configure', asyncHandler(async (req: AuthenticatedRequest, res: any) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    try {
      const config = oauthConfigSchema.parse(req.body);
      
      // Validate Salesforce domain to prevent SSRF
      validateSalesforceUrl(config.instanceUrl);
      
      const updatedUser = await storage.updateUserSalesforceConfig(req.session.userId, {
        sf_client_id: config.clientId,
        sf_client_secret: config.clientSecret,
        sf_instance_url: config.instanceUrl
      });
      
      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      res.json({ 
        success: true, 
        message: 'OAuth configuration saved successfully',
        configured: true
      });
    } catch (error: any) {
      res.status(400).json({ 
        error: 'Invalid configuration', 
        details: error.message 
      });
    }
  }));

  // Generate OAuth authorization URL
  app.get('/api/oauth/authorize-url', asyncHandler(async (req: AuthenticatedRequest, res: any) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const user = await storage.getUser(req.session.userId);
    if (!user || !user.sf_client_id || !user.sf_client_secret || !user.sf_instance_url) {
      return res.status(400).json({ 
        error: 'OAuth not configured. Please configure OAuth settings first.' 
      });
    }
    
    try {
      // Generate and store OAuth state for security
      const state = SalesforceOAuthService.generateState();
      req.session.oauthState = state;
      
      // Get app origin for redirect URI - use HTTPS for Replit
      const host = req.get('host');
      const appOrigin = `https://${host}`;
      
      const { authUrl, codeVerifier } = SalesforceOAuthService.generateAuthUrl({
        clientId: user.sf_client_id,
        clientSecret: user.sf_client_secret,
        instanceUrl: user.sf_instance_url
      }, appOrigin, state);
      
      // Store code verifier in session for PKCE validation
      req.session.oauthCodeVerifier = codeVerifier;
      
      res.json({ authUrl });
    } catch (error: any) {
      res.status(500).json({ 
        error: 'Failed to generate authorization URL', 
        details: error.message 
      });
    }
  }));


  // Refresh tokens manually (also happens automatically)
  app.post('/api/oauth/refresh', asyncHandler(async (req: AuthenticatedRequest, res: any) => {
    if (!req.session?.userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    try {
      const user = await storage.getUser(req.session.userId);
      if (!user || !user.sf_refresh_token || !user.sf_client_id || !user.sf_client_secret) {
        return res.status(400).json({ 
          error: 'No refresh token available. Please re-authorize.' 
        });
      }
      
      const tokenResponse = await SalesforceOAuthService.refreshAccessToken(
        user.sf_refresh_token,
        {
          clientId: user.sf_client_id,
          clientSecret: user.sf_client_secret
        }
      );
      
      // Store new tokens
      const expiresAt = SalesforceOAuthService.calculateExpirationTime(tokenResponse.expires_in);
      const updatedUser = await storage.updateUserSalesforceTokens(req.session.userId, {
        sf_access_token: tokenResponse.access_token,
        sf_refresh_token: tokenResponse.refresh_token || user.sf_refresh_token!,
        sf_token_expires_at: expiresAt,
        sf_instance_url: tokenResponse.instance_url || user.sf_instance_url!
      });
      
      if (!updatedUser) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      // Update session
      (req.session as any).salesforceCredentials = {
        accessToken: tokenResponse.access_token,
        instanceUrl: tokenResponse.instance_url || user.sf_instance_url!
      };
      
      res.json({ 
        success: true, 
        message: 'Tokens refreshed successfully' 
      });
    } catch (error: any) {
      res.status(500).json({ 
        error: 'Token refresh failed', 
        details: error.message 
      });
    }
  }));

  // ========== QUICK START ENDPOINT ==========
  // Simple token paste for immediate functionality
  app.post('/api/quick-setup', asyncHandler(async (req: AuthenticatedRequest, res: any) => {
    const { accessToken, instanceUrl } = req.body;
    
    if (!accessToken || !instanceUrl) {
      return res.status(400).json({ error: 'Access token and instance URL required' });
    }

    // Store in session (temporary, not persistent)
    (req.session as any).quickSalesforce = {
      accessToken,
      instanceUrl,
      setupAt: new Date().toISOString()
    };

    res.json({ 
      success: true, 
      message: 'Quick setup complete! You can now use the chatbot endpoints.',
      expiresNote: 'Session tokens typically expire in 2-4 hours'
    });
  }));

  // ========== CHATBOT API ENDPOINTS (PRODUCTION) ==========
  // Clean endpoints for chatbot integration
  
  // Get access token for chatbot (production endpoint)
  app.post('/api/chatbot/token', asyncHandler(async (req: any, res: any) => {
    const { client_credentials_flow } = req.body;
    
    if (!client_credentials_flow) {
      return res.status(400).json({ error: 'Invalid request format' });
    }
    
    try {
      // For server-managed auth, we don't need user tokens
      // This endpoint can be removed as we use unified auth now
      const userWithTokens = null;
      
      if (!userWithTokens) {
        return res.status(401).json({ 
          error: 'No valid Salesforce tokens available. Admin must authorize first.' 
        });
      }
      
      // Check if token needs refresh
      const now = new Date();
      if (userWithTokens.sf_token_expires_at && userWithTokens.sf_token_expires_at <= now) {
        if (userWithTokens.sf_refresh_token) {
          // Auto-refresh token
          const tokenResponse = await SalesforceOAuthService.refreshAccessToken(
            userWithTokens.sf_refresh_token,
            {
              clientId: userWithTokens.sf_client_id!,
              clientSecret: userWithTokens.sf_client_secret!
            }
          );
          
          const expiresAt = SalesforceOAuthService.calculateExpirationTime(tokenResponse.expires_in);
          await storage.updateUserSalesforceTokens(userWithTokens.id, {
            sf_access_token: tokenResponse.access_token,
            sf_refresh_token: tokenResponse.refresh_token || userWithTokens.sf_refresh_token,
            sf_token_expires_at: expiresAt
          });
          
          return res.json({
            access_token: tokenResponse.access_token,
            instance_url: tokenResponse.instance_url || userWithTokens.sf_instance_url,
            expires_in: tokenResponse.expires_in
          });
        } else {
          return res.status(401).json({ 
            error: 'Token expired and no refresh token available. Re-authorization required.' 
          });
        }
      }
      
      res.json({
        access_token: userWithTokens.sf_access_token,
        instance_url: userWithTokens.sf_instance_url,
        expires_in: Math.floor((userWithTokens.sf_token_expires_at!.getTime() - now.getTime()) / 1000)
      });
      
    } catch (error: any) {
      res.status(500).json({ error: 'Failed to get access token', details: error.message });
    }
  }));

  // Execute SOQL query (chatbot endpoint) - Server-managed auth
  app.post('/api/chatbot/query', asyncHandler(async (req: any, res: any) => {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ 
        error: 'Missing required field: query' 
      });
    }
    
    try {
      const { accessToken, instanceUrl } = await getSalesforceAuth();
      const result = await salesforceService.runSOQLQuery(accessToken, instanceUrl, query);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: 'Query execution failed', details: error.message });
    }
  }));

  // Get object metadata (chatbot endpoint) - Server-managed auth
  app.post('/api/chatbot/describe', asyncHandler(async (req: any, res: any) => {
    const { object_name } = req.body;
    
    if (!object_name) {
      return res.status(400).json({ 
        error: 'Missing required field: object_name' 
      });
    }
    
    try {
      const { accessToken, instanceUrl } = await getSalesforceAuth();
      const result = await salesforceService.getObjectSchema(accessToken, instanceUrl, object_name);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: 'Describe operation failed', details: error.message });
    }
  }));

  // Create record (chatbot endpoint) - Server-managed auth
  app.post('/api/chatbot/record', asyncHandler(async (req: any, res: any) => {
    const { object_name, data } = req.body;
    
    if (!object_name || !data) {
      return res.status(400).json({ 
        error: 'Missing required fields: object_name, data' 
      });
    }
    
    try {
      const { accessToken, instanceUrl } = await getSalesforceAuth();
      const result = await salesforceService.createRecord(accessToken, instanceUrl, object_name, data);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: 'Record creation failed', details: error.message });
    }
  }));

  // Update record (chatbot endpoint) - Server-managed auth
  app.patch('/api/chatbot/record', asyncHandler(async (req: any, res: any) => {
    const { object_name, record_id, data } = req.body;
    
    if (!object_name || !record_id || !data) {
      return res.status(400).json({ 
        error: 'Missing required fields: object_name, record_id, data' 
      });
    }
    
    try {
      const { accessToken, instanceUrl } = await getSalesforceAuth();
      const result = await salesforceService.updateRecord(accessToken, instanceUrl, object_name, record_id, data);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: 'Record update failed', details: error.message });
    }
  }));

  // Delete record (chatbot endpoint) - Server-managed auth
  app.delete('/api/chatbot/record', asyncHandler(async (req: any, res: any) => {
    const { object_name, record_id } = req.body;
    
    if (!object_name || !record_id) {
      return res.status(400).json({ 
        error: 'Missing required fields: object_name, record_id' 
      });
    }
    
    try {
      const { accessToken, instanceUrl } = await getSalesforceAuth();
      const result = await salesforceService.deleteRecord(accessToken, instanceUrl, object_name, record_id);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: 'Record deletion failed', details: error.message });
    }
  }));

  // Search records (chatbot endpoint) - Server-managed auth
  app.post('/api/chatbot/search', asyncHandler(async (req: any, res: any) => {
    const { query } = req.body;
    
    if (!query) {
      return res.status(400).json({ 
        error: 'Missing required field: query' 
      });
    }
    
    try {
      const { accessToken, instanceUrl } = await getSalesforceAuth();
      
      // Execute raw SOSL query directly
      const response = await fetch(`${instanceUrl}/services/data/v58.0/search?q=${encodeURIComponent(query)}`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`SOSL Search failed: ${errorData}`);
      }

      const result = await response.json();
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: 'Search operation failed', details: error.message });
    }
  }));

  // Search Objects (chatbot endpoint) - Server-managed auth
  app.post('/api/chatbot/searchObjects', asyncHandler(async (req: any, res: any) => {
    const { search_term } = req.body;
    
    if (!search_term) {
      return res.status(400).json({ 
        error: 'Missing required field: search_term' 
      });
    }
    
    try {
      const { accessToken, instanceUrl } = await getSalesforceAuth();
      const result = await salesforceService.searchObjects(accessToken, instanceUrl, search_term);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: 'Object search failed', details: error.message });
    }
  }));

  // Get All Object Schemas (chatbot endpoint) - Server-managed auth
  app.post('/api/chatbot/getAllObjectSchemas', asyncHandler(async (req: any, res: any) => {
    const { include_custom, limit } = req.body;
    
    const options = {
      includeCustom: include_custom !== false, // Default to true
      limit: limit || 50 // Default limit
    };
    
    try {
      const { accessToken, instanceUrl } = await getSalesforceAuth();
      const result = await salesforceService.getAllObjectSchemas(accessToken, instanceUrl, options);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: 'Schema retrieval failed', details: error.message });
    }
  }));

  // Get Picklist Values (chatbot endpoint) - Server-managed auth
  app.post('/api/chatbot/picklist', asyncHandler(async (req: any, res: any) => {
    const { object_name, field_name } = req.body;
    
    if (!object_name || !field_name) {
      return res.status(400).json({ 
        error: 'Missing required parameters: object_name, field_name' 
      });
    }
    
    try {
      const { accessToken, instanceUrl } = await getSalesforceAuth();
      const result = await salesforceService.getPicklistValues(accessToken, instanceUrl, object_name, field_name);
      res.json(result);
    } catch (error: any) {
      res.status(500).json({ error: 'Picklist retrieval failed', details: error.message });
    }
  }));

  // ========== SALESFORCE API ENDPOINTS ==========
  // All endpoints below use session-based Salesforce credentials
  
  // Validate credentials endpoint - moved to top to avoid any interference
  app.post('/api/validateCredentials', asyncHandler(async (req: any, res: any) => {
    const { access_token, instance_url } = req.body;
    
    if (!access_token || !instance_url) {
      return res.status(400).json({ 
        error: 'Missing required parameters: access_token, instance_url' 
      });
    }

    try {
      // CRITICAL: Validate Salesforce URL to prevent SSRF attacks
      validateSalesforceUrl(instance_url);
      
      // Simple validation by trying to get org info
      const response = await fetch(`${instance_url}/services/data/v58.0/`, {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const orgInfo = await response.json();
        res.json({ 
          valid: true, 
          message: 'Credentials validated successfully',
          orgInfo: {
            version: orgInfo.version || 'v58.0',
            label: orgInfo.label || 'Salesforce API'
          }
        });
      } else {
        const errorText = await response.text();
        res.status(401).json({ 
          valid: false, 
          message: 'Invalid credentials',
          error: errorText
        });
      }
    } catch (error) {
      res.status(500).json({ 
        valid: false, 
        message: 'Failed to validate credentials',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }));

  // SOQL Query endpoint with query-specific rate limiting
  app.post('/api/runSOQLQuery', RateLimiter.query(), asyncHandler(async (req: any, res: any) => {
    // Check session authentication
    if (!req.session?.authenticated || !req.session?.salesforceCredentials) {
      return res.status(401).json({ 
        error: 'Authentication required. Please log in with your Salesforce credentials.' 
      });
    }
    
    const { soql } = req.body;
    if (!soql) {
      return res.status(400).json({ 
        error: 'Missing required parameter: soql' 
      });
    }

    const { accessToken, instanceUrl } = req.session.salesforceCredentials;
    const result = await salesforceService.runSOQLQuery(accessToken, instanceUrl, soql);
    res.json(result);
  }));

  // Object Schema endpoint with metadata rate limiting
  app.post('/api/getObjectSchema', RateLimiter.metadata(), asyncHandler(async (req: any, res: any) => {
    // Check session authentication
    if (!req.session?.authenticated || !req.session?.salesforceCredentials) {
      return res.status(401).json({ 
        error: 'Authentication required. Please log in with your Salesforce credentials.' 
      });
    }
    
    const { object_name } = req.body;
    if (!object_name) {
      return res.status(400).json({ 
        error: 'Missing required parameter: object_name' 
      });
    }

    const { accessToken, instanceUrl } = req.session.salesforceCredentials;
    const result = await salesforceService.getObjectSchema(accessToken, instanceUrl, object_name);
    res.json(result);
  }));

  // Search Objects endpoint with query rate limiting
  app.post('/api/searchObjects', RateLimiter.query(), asyncHandler(async (req: any, res: any) => {
    // This endpoint now uses server-managed authentication (no session check needed)
    // Server handles Salesforce authentication automatically
    
    const { search_term } = req.body;
    if (!search_term) {
      return res.status(400).json({ 
        error: 'Missing required parameter: search_term' 
      });
    }

    const { accessToken, instanceUrl } = await getSalesforceAuth();
    const result = await salesforceService.searchObjects(accessToken, instanceUrl, search_term);
    res.json(result);
  }));

  // Get All Object Schemas endpoint with metadata rate limiting
  app.post('/api/getAllObjectSchemas', RateLimiter.metadata(), asyncHandler(async (req: any, res: any) => {
    // Check session authentication
    if (!req.session?.authenticated || !req.session?.salesforceCredentials) {
      return res.status(401).json({ 
        error: 'Authentication required. Please log in with your Salesforce credentials.' 
      });
    }
    
    const { include_custom, limit } = req.body;

    const options = {
      includeCustom: include_custom !== false, // Default to true
      limit: limit || 50 // Default limit
    };

    const { accessToken, instanceUrl } = req.session.salesforceCredentials;
    const result = await salesforceService.getAllObjectSchemas(accessToken, instanceUrl, options);
    res.json(result);
  }));

  // SOSL Query endpoint with query-specific rate limiting
  app.post('/api/runSOSLQuery', RateLimiter.query(), asyncHandler(async (req: any, res: any) => {
    // Check session authentication
    if (!req.session?.authenticated || !req.session?.salesforceCredentials) {
      return res.status(401).json({ 
        error: 'Authentication required. Please log in with your Salesforce credentials.' 
      });
    }
    
    const { search_term, objects } = req.body;
    
    if (!search_term || !objects) {
      return res.status(400).json({ 
        error: 'Missing required parameters: search_term, objects' 
      });
    }

    const { accessToken, instanceUrl } = req.session.salesforceCredentials;
    const result = await salesforceService.runSOSLQuery(accessToken, instanceUrl, search_term, objects);
    res.json(result);
  }));

  // Get Picklist Values endpoint with metadata rate limiting
  app.post('/api/getPicklistValues', RateLimiter.metadata(), asyncHandler(async (req: any, res: any) => {
    // Check session authentication
    if (!req.session?.authenticated || !req.session?.salesforceCredentials) {
      return res.status(401).json({ 
        error: 'Authentication required. Please log in with your Salesforce credentials.' 
      });
    }
    
    const { object_name, field_name } = req.body;
    
    if (!object_name || !field_name) {
      return res.status(400).json({ 
        error: 'Missing required parameters: object_name, field_name' 
      });
    }

    const { accessToken, instanceUrl } = req.session.salesforceCredentials;
    const result = await salesforceService.getPicklistValues(accessToken, instanceUrl, object_name, field_name);
    res.json(result);
  }));

  // Create Record endpoint with CRUD rate limiting
  app.post('/api/createRecord', RateLimiter.crud(), asyncHandler(async (req: any, res: any) => {
    // Check session authentication
    if (!req.session?.authenticated || !req.session?.salesforceCredentials) {
      return res.status(401).json({ 
        error: 'Authentication required. Please log in with your Salesforce credentials.' 
      });
    }
    
    const { object_name, fields } = req.body;
    
    if (!object_name || !fields) {
      return res.status(400).json({ 
        error: 'Missing required parameters: object_name, fields' 
      });
    }

    const { accessToken, instanceUrl } = req.session.salesforceCredentials;
    const result = await salesforceService.createRecord(accessToken, instanceUrl, object_name, fields);
    res.json(result);
  }));

  // Update Record endpoint with CRUD rate limiting
  app.post('/api/updateRecord', RateLimiter.crud(), asyncHandler(async (req: any, res: any) => {
    // Check session authentication
    if (!req.session?.authenticated || !req.session?.salesforceCredentials) {
      return res.status(401).json({ 
        error: 'Authentication required. Please log in with your Salesforce credentials.' 
      });
    }
    
    const { object_name, record_id, fields } = req.body;
    
    if (!object_name || !record_id || !fields) {
      return res.status(400).json({ 
        error: 'Missing required parameters: object_name, record_id, fields' 
      });
    }

    const { accessToken, instanceUrl } = req.session.salesforceCredentials;
    const result = await salesforceService.updateRecord(accessToken, instanceUrl, object_name, record_id, fields);
    res.json(result);
  }));

  // Delete Record endpoint with CRUD rate limiting
  app.post('/api/deleteRecord', RateLimiter.crud(), asyncHandler(async (req: any, res: any) => {
    // Check session authentication
    if (!req.session?.authenticated || !req.session?.salesforceCredentials) {
      return res.status(401).json({ 
        error: 'Authentication required. Please log in with your Salesforce credentials.' 
      });
    }
    
    const { object_name, record_id } = req.body;
    
    if (!object_name || !record_id) {
      return res.status(400).json({ 
        error: 'Missing required parameters: object_name, record_id' 
      });
    }

    const { accessToken, instanceUrl } = req.session.salesforceCredentials;
    const result = await salesforceService.deleteRecord(accessToken, instanceUrl, object_name, record_id);
    res.json(result);
  }));

  // Upsert Record endpoint with CRUD rate limiting
  app.post('/api/upsertRecord', RateLimiter.crud(), asyncHandler(async (req: any, res: any) => {
    // Check session authentication
    if (!req.session?.authenticated || !req.session?.salesforceCredentials) {
      return res.status(401).json({ 
        error: 'Authentication required. Please log in with your Salesforce credentials.' 
      });
    }
    
    const { object_name, external_id_field, external_id_value, fields } = req.body;
    
    if (!object_name || !external_id_field || !external_id_value || !fields) {
      return res.status(400).json({ 
        error: 'Missing required parameters: object_name, external_id_field, external_id_value, fields' 
      });
    }

    const { accessToken, instanceUrl } = req.session.salesforceCredentials;
    const result = await salesforceService.upsertRecord(accessToken, instanceUrl, object_name, external_id_field, external_id_value, fields);
    res.json(result);
  }));

  // Batch Processing Endpoints
  
  // Create Bulk Job endpoint with bulk operation rate limiting
  app.post('/api/createBulkJob', RateLimiter.bulk(), asyncHandler(async (req: any, res: any) => {
    // Check session authentication
    if (!req.session?.authenticated || !req.session?.salesforceCredentials) {
      return res.status(401).json({ 
        error: 'Authentication required. Please log in with your Salesforce credentials.' 
      });
    }
    
    const { object_name, operation, external_id_field } = req.body;
    
    if (!object_name || !operation) {
      return res.status(400).json({ 
        error: 'Missing required parameters: object_name, operation' 
      });
    }

    if (operation === 'upsert' && !external_id_field) {
      return res.status(400).json({ 
        error: 'external_id_field is required when operation is upsert' 
      });
    }

    const { accessToken, instanceUrl } = req.session.salesforceCredentials;
    const result = await salesforceService.createBulkJob(accessToken, instanceUrl, object_name, operation, external_id_field);
    res.json(result);
  }));

  // Add Batch to Bulk Job endpoint with bulk operation rate limiting
  app.post('/api/addBatchToBulkJob', RateLimiter.bulk(), asyncHandler(async (req: any, res: any) => {
    // Check session authentication
    if (!req.session?.authenticated || !req.session?.salesforceCredentials) {
      return res.status(401).json({ 
        error: 'Authentication required. Please log in with your Salesforce credentials.' 
      });
    }
    
    const { job_id, records } = req.body;
    
    if (!job_id || !records) {
      return res.status(400).json({ 
        error: 'Missing required parameters: job_id, records' 
      });
    }

    const { accessToken, instanceUrl } = req.session.salesforceCredentials;
    const result = await salesforceService.addBatchToBulkJob(accessToken, instanceUrl, job_id, records);
    res.json(result);
  }));

  // Close Bulk Job endpoint with bulk operation rate limiting
  app.post('/api/closeBulkJob', RateLimiter.bulk(), asyncHandler(async (req: any, res: any) => {
    // Check session authentication
    if (!req.session?.authenticated || !req.session?.salesforceCredentials) {
      return res.status(401).json({ 
        error: 'Authentication required. Please log in with your Salesforce credentials.' 
      });
    }
    
    const { job_id } = req.body;
    
    if (!job_id) {
      return res.status(400).json({ 
        error: 'Missing required parameter: job_id' 
      });
    }

    const { accessToken, instanceUrl } = req.session.salesforceCredentials;
    const result = await salesforceService.closeBulkJob(accessToken, instanceUrl, job_id);
    res.json(result);
  }));

  // Get Bulk Job Status endpoint with metadata rate limiting
  app.post('/api/getBulkJobStatus', RateLimiter.metadata(), asyncHandler(async (req: any, res: any) => {
    // Check session authentication
    if (!req.session?.authenticated || !req.session?.salesforceCredentials) {
      return res.status(401).json({ 
        error: 'Authentication required. Please log in with your Salesforce credentials.' 
      });
    }
    
    const { job_id } = req.body;
    
    if (!job_id) {
      return res.status(400).json({ 
        error: 'Missing required parameter: job_id' 
      });
    }

    const { accessToken, instanceUrl } = req.session.salesforceCredentials;
    const result = await salesforceService.getBulkJobStatus(accessToken, instanceUrl, job_id);
    res.json(result);
  }));

  // Get Bulk Job Results endpoint with metadata rate limiting
  app.post('/api/getBulkJobResults', RateLimiter.metadata(), asyncHandler(async (req: any, res: any) => {
    // Check session authentication
    if (!req.session?.authenticated || !req.session?.salesforceCredentials) {
      return res.status(401).json({ 
        error: 'Authentication required. Please log in with your Salesforce credentials.' 
      });
    }
    
    const { job_id } = req.body;
    
    if (!job_id) {
      return res.status(400).json({ 
        error: 'Missing required parameter: job_id' 
      });
    }

    const { accessToken, instanceUrl } = req.session.salesforceCredentials;
    const result = await salesforceService.getBulkJobResults(accessToken, instanceUrl, job_id);
    res.json(result);
  }));

  // Execute Bulk Query endpoint with bulk operation rate limiting
  app.post('/api/executeBulkQuery', RateLimiter.bulk(), asyncHandler(async (req: any, res: any) => {
    // Check session authentication
    if (!req.session?.authenticated || !req.session?.salesforceCredentials) {
      return res.status(401).json({ 
        error: 'Authentication required. Please log in with your Salesforce credentials.' 
      });
    }
    
    const { soql } = req.body;
    
    if (!soql) {
      return res.status(400).json({ 
        error: 'Missing required parameter: soql' 
      });
    }

    const { accessToken, instanceUrl } = req.session.salesforceCredentials;
    const result = await salesforceService.executeBulkQuery(accessToken, instanceUrl, soql);
    res.json(result);
  }));

  // Get Bulk Query Results endpoint with metadata rate limiting
  app.post('/api/getBulkQueryResults', RateLimiter.metadata(), asyncHandler(async (req: any, res: any) => {
    // Check session authentication
    if (!req.session?.authenticated || !req.session?.salesforceCredentials) {
      return res.status(401).json({ 
        error: 'Authentication required. Please log in with your Salesforce credentials.' 
      });
    }
    
    const { job_id } = req.body;
    
    if (!job_id) {
      return res.status(400).json({ 
        error: 'Missing required parameter: job_id' 
      });
    }

    const { accessToken, instanceUrl } = req.session.salesforceCredentials;
    const result = await salesforceService.getBulkQueryResults(accessToken, instanceUrl, job_id);
    res.json(result);
  }));


  // Add Salesforce rate limit handler for 429 responses (must come after routes)
  app.use('/api', RateLimiter.salesforceRateLimitHandler());
  
  // Add error monitoring middleware before final error handler
  app.use(errorMonitoringMiddleware());
  
  // Register the centralized error handling middleware AFTER all routes
  app.use(salesforceErrorHandler);

  const httpServer = createServer(app);
  return httpServer;
}
