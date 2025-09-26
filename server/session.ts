import session from 'express-session';
import MemoryStore from 'memorystore';
import crypto from 'crypto';

// Import PostgreSQL session store for production
let pgSession: any;
let pgStore: any;

// Configure session store based on environment
async function getSessionStore() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  // Use PostgreSQL for production and when DATABASE_URL is available
  if (nodeEnv === 'production' || process.env.DATABASE_URL) {
    try {
      // Dynamic import for production dependencies
      const connectPgSimple = (await import('connect-pg-simple')).default;
      const { Pool } = (await import('pg')).default;
      
      pgSession = connectPgSimple(session);
      
      // Create PostgreSQL connection pool
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
        max: 10, // Maximum number of connections
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000, // Increased to 10 seconds
      });
      
      // Create PostgreSQL session store
      pgStore = new pgSession({
        pool: pool,
        tableName: 'user_sessions', // Custom table name
        createTableIfMissing: true, // Auto-create sessions table
        pruneSessionInterval: 60 * 15, // Prune expired sessions every 15 minutes
        errorLog: (error: any) => {
          console.error('PostgreSQL session store error:', error);
        }
      });
      
      console.log('Using PostgreSQL session store for production security');
      return pgStore;
      
    } catch (error) {
      console.error('Failed to initialize PostgreSQL session store:', error);
      console.error('Falling back to memory store - NOT SUITABLE FOR PRODUCTION');
      
      // Fallback to memory store but warn loudly
      if (nodeEnv === 'production') {
        console.error('CRITICAL: Memory store is not suitable for production use!');
        console.error('Sessions will not persist across server restarts');
      }
    }
  }
  
  // Fallback to memory store for development
  console.warn('Using memory session store - only suitable for development');
  return new (MemoryStore(session))({
    checkPeriod: 86400000 // Prune expired entries every 24h
  });
}

// Initialize session store asynchronously
let sessionStore: any;

// Generate secure session secret - CRITICAL for production security
function getSessionSecret(): string {
  const envSecret = process.env.SESSION_SECRET;
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  // CRITICAL: In production, session secret MUST come from environment
  if (nodeEnv === 'production' && !envSecret) {
    console.error('FATAL: SESSION_SECRET environment variable is required in production');
    console.error('Generate a secure secret: node -e "console.log(crypto.randomBytes(64).toString(\'hex\'))"');
    process.exit(1);
  }
  
  if (envSecret && envSecret.length >= 32) {
    return envSecret;
  }
  
  if (nodeEnv !== 'production') {
    console.warn('Using development session secret - ONLY safe for development/testing');
    return 'dev-session-secret-change-in-production-' + crypto.randomBytes(16).toString('hex');
  }
  
  // Should never reach here due to earlier check, but be extra safe
  console.error('FATAL: No secure session secret available');
  process.exit(1);
}

// Initialize session configuration
export async function createSessionConfig() {
  if (!sessionStore) {
    sessionStore = await getSessionStore();
  }
  
  return session({
    secret: getSessionSecret(),
    name: 'sf-mcp-session', // Custom session name (security through obscurity)
    resave: false, // Don't save session if unmodified
    saveUninitialized: false, // Don't create session until something stored
    store: sessionStore,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    httpOnly: true, // CRITICAL: Prevent XSS attacks
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax' // Allow session cookies on OAuth redirects while maintaining CSRF protection
  },
    genid: () => {
      // Generate cryptographically secure session IDs
      return crypto.randomBytes(32).toString('hex');
    }
  });
}

// Session type extensions for TypeScript
declare module 'express-session' {
  interface SessionData {
    userId?: string;
    username?: string;
    isAuthenticated?: boolean;
    loginTime?: number;
    oauthState?: string; // Added for OAuth state management
    oauthCodeVerifier?: string; // Added for PKCE support
  }
}

// Helper to create authenticated session with regeneration (prevents session fixation)
export function createAuthenticatedSession(
  req: any,
  userId: string, 
  username: string,
  callback?: (err?: any) => void
): void {
  // CRITICAL: Regenerate session ID on login to prevent session fixation attacks
  req.session.regenerate((err: any) => {
    if (err) {
      console.error('Session regeneration failed:', err);
      if (callback) callback(err);
      return;
    }
    
    // Set authenticated session data
    req.session.userId = userId;
    req.session.username = username;
    req.session.isAuthenticated = true;
    req.session.loginTime = Date.now();
    
    // Save session immediately
    req.session.save((saveErr: any) => {
      if (saveErr) {
        console.error('Session save failed:', saveErr);
      }
      if (callback) callback(saveErr);
    });
  });
}

// Helper to completely destroy session (secure logout)
export function destroySession(req: any, callback?: (err?: any) => void): void {
  if (!req.session) {
    if (callback) callback();
    return;
  }
  
  // CRITICAL: Completely destroy session on logout
  req.session.destroy((err: any) => {
    if (err) {
      console.error('Session destruction failed:', err);
    }
    
    // Clear session cookie immediately
    if (req.res) {
      req.res.clearCookie('sf-mcp-session', {
        path: '/',
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
      });
    }
    
    if (callback) callback(err);
  });
}

// Session validation middleware
export function isAuthenticated(req: any): boolean {
  return !!(req.session && req.session.isAuthenticated && req.session.userId);
}

// Optional: Session timeout check (24 hours)
export function isSessionExpired(session: session.SessionData): boolean {
  if (!session.loginTime) return true;
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours
  return (Date.now() - session.loginTime) > maxAge;
}