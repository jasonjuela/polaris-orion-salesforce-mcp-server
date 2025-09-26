import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { isAuthenticated } from './session';

// Enhanced authentication interface supporting both session and API key auth
export interface AuthenticatedRequest extends Request {
  // Session-based auth properties
  userId?: string;
  username?: string;
  authType?: 'session' | 'apikey';
  
  // API key-based auth properties (for external access)
  apiKey?: string;
  clientId?: string;
}

// Default API keys ONLY for development (NEVER use in production)
const DEFAULT_DEV_API_KEYS = new Map([
  ['mcp-sf-dev-key-123', { name: 'Development', clientId: 'dev', active: true }],
]);

// Get API keys from environment - PRODUCTION READY
function getValidApiKeys(): Map<string, { name: string; clientId: string; active: boolean }> {
  const envKeys = process.env.MCP_API_KEYS;
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  // CRITICAL: In production, API keys MUST come from environment
  if (nodeEnv === 'production' && !envKeys) {
    console.error('FATAL: MCP_API_KEYS environment variable is required in production');
    console.error('Set MCP_API_KEYS with JSON object of API keys: {"key1": {"name": "Client1", "clientId": "client1", "active": true}}');
    process.exit(1);
  }
  
  if (envKeys) {
    try {
      const keys = JSON.parse(envKeys);
      const keyMap = new Map();
      
      for (const [key, config] of Object.entries(keys)) {
        if (typeof config === 'object' && config !== null) {
          keyMap.set(key, config as { name: string; clientId: string; active: boolean });
        }
      }
      
      if (keyMap.size === 0) {
        console.error('FATAL: No valid API keys found in MCP_API_KEYS environment variable');
        process.exit(1);
      }
      
      return keyMap;
    } catch (error) {
      console.error('FATAL: Failed to parse MCP_API_KEYS from environment:', error);
      if (nodeEnv === 'production') {
        process.exit(1);
      }
      console.warn('Development mode: falling back to default keys (INSECURE)');
      return DEFAULT_DEV_API_KEYS;
    }
  }
  
  // Only allow defaults in development
  if (nodeEnv !== 'production') {
    console.warn('Using default API keys - ONLY safe for development/testing');
    return DEFAULT_DEV_API_KEYS;
  }
  
  // Should never reach here due to earlier check, but be extra safe
  console.error('FATAL: No API keys available and in production mode');
  process.exit(1);
}

// Generate a new secure API key
export function generateApiKey(prefix = 'mcp-sf'): string {
  const randomBytes = crypto.randomBytes(16).toString('hex');
  return `${prefix}-${randomBytes}`;
}

// Middleware to validate API keys
export function requireApiKey() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const apiKey = req.header('X-API-Key') || req.header('Authorization')?.replace('Bearer ', '');
    
    if (!apiKey) {
      return res.status(401).json({
        error: 'API key required',
        message: 'Please provide a valid API key in the X-API-Key header',
        timestamp: new Date().toISOString()
      });
    }

    const validKeys = getValidApiKeys();
    const keyConfig = validKeys.get(apiKey);
    
    if (!keyConfig || !keyConfig.active) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: 'The provided API key is invalid or inactive',
        timestamp: new Date().toISOString()
      });
    }

    // Add API key info to request for logging/monitoring
    req.apiKey = apiKey;
    req.clientId = keyConfig.clientId;
    
    next();
  };
}

// Optional middleware for internal endpoints (stricter validation)
export function requireInternalKey() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const nodeEnv = process.env.NODE_ENV || 'development';
    
    // Get server-side internal key - NEVER use client headers for reference
    const serverInternalKey = process.env.INTERNAL_METRICS_KEY;
    
    // CRITICAL: In production, internal key MUST come from environment
    if (nodeEnv === 'production' && !serverInternalKey) {
      console.error('FATAL: INTERNAL_METRICS_KEY environment variable is required in production');
      return res.status(500).json({
        error: 'Server configuration error',
        message: 'Internal authentication not properly configured',
        timestamp: new Date().toISOString()
      });
    }
    
    // Use secure default only in development
    const validInternalKey = serverInternalKey || (nodeEnv === 'development' ? 'dev-only-metrics-key' : null);
    
    if (!validInternalKey) {
      console.error('FATAL: No internal key available');
      return res.status(500).json({
        error: 'Server configuration error',
        message: 'Internal authentication not available',
        timestamp: new Date().toISOString()
      });
    }
    
    const providedKey = req.header('X-Internal-Metrics-Key');
    
    if (providedKey !== validInternalKey) {
      return res.status(401).json({
        error: 'Unauthorized access to internal endpoint',
        message: 'This endpoint requires internal authentication',
        timestamp: new Date().toISOString()
      });
    }
    
    next();
  };
}

// Get current API keys (for management endpoints)
export function getApiKeys(): Array<{ key: string; name: string; clientId: string; active: boolean }> {
  const validKeys = getValidApiKeys();
  const keyList: Array<{ key: string; name: string; clientId: string; active: boolean }> = [];
  
  validKeys.forEach((config, key) => {
    keyList.push({
      key: `${key.substring(0, 12)}...`, // Masked for security
      name: config.name,
      clientId: config.clientId,
      active: config.active
    });
  });
  
  return keyList;
}

// DUAL AUTHENTICATION MIDDLEWARE - Supports both session and API key auth
// This enables web UI (session) and external access (API keys) simultaneously

// Primary authentication middleware - tries session first, then API key
export function requireAuthentication() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    // Strategy 1: Check for valid session (web UI)
    if (isAuthenticated(req)) {
      req.userId = req.session.userId;
      req.username = req.session.username;
      req.authType = 'session';
      logAuthEvent(req, 'success', 'valid_session');
      return next();
    }

    // Strategy 2: Check for API key (external/programmatic access)
    const apiKey = req.header('X-API-Key') || req.header('Authorization')?.replace('Bearer ', '');
    
    if (apiKey) {
      const validKeys = getValidApiKeys();
      const keyConfig = validKeys.get(apiKey);
      
      if (keyConfig && keyConfig.active) {
        req.apiKey = apiKey;
        req.clientId = keyConfig.clientId;
        req.authType = 'apikey';
        logAuthEvent(req, 'success', 'valid_api_key');
        return next();
      } else {
        logAuthEvent(req, 'failure', 'invalid_api_key');
        return res.status(401).json({
          error: 'Invalid API key',
          message: 'The provided API key is invalid or inactive',
          timestamp: new Date().toISOString()
        });
      }
    }

    // No valid authentication found
    logAuthEvent(req, 'failure', 'no_auth_provided');
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please login or provide a valid API key',
      requiresLogin: true,
      timestamp: new Date().toISOString()
    });
  };
}

// Session-only authentication (for web UI endpoints that shouldn't accept API keys)
export function requireSessionAuth() {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!isAuthenticated(req)) {
      return res.status(401).json({
        error: 'Session authentication required',
        message: 'Please login to access this endpoint',
        requiresLogin: true,
        timestamp: new Date().toISOString()
      });
    }

    req.userId = req.session.userId;
    req.username = req.session.username;
    req.authType = 'session';
    next();
  };
}

// API key-only authentication (for endpoints that should only accept API keys)
export function requireApiKeyOnly() {
  return requireApiKey();
}

// Log authentication events for monitoring (enhanced for dual auth)
export function logAuthEvent(req: AuthenticatedRequest, event: 'success' | 'failure', reason?: string) {
  const identifier = req.clientId || req.username || 'unknown';
  const authType = req.authType || 'unknown';
  const ip = req.ip || req.connection.remoteAddress;
  const userAgent = req.header('User-Agent') || 'unknown';
  
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event: `auth_${event}`,
    authType,
    identifier,
    ip,
    userAgent,
    endpoint: req.path,
    reason: reason || (event === 'success' ? `valid_${authType}` : `invalid_${authType}`)
  }));
}