import type { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Custom CSRF Protection (since csurf is deprecated)
const CSRF_SECRET = process.env.CSRF_SECRET || crypto.randomBytes(32).toString('hex');
const CSRF_TOKEN_TIMEOUT = 60 * 60 * 1000; // 1 hour

interface CSRFTokenData {
  token: string;
  timestamp: number;
}

// Generate cryptographically secure CSRF token
export function generateCSRFToken(): string {
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(32).toString('hex');
  const payload = `${timestamp}:${randomBytes}`;
  
  const hmac = crypto.createHmac('sha256', CSRF_SECRET);
  hmac.update(payload);
  const signature = hmac.digest('hex');
  
  return Buffer.from(`${payload}:${signature}`).toString('base64');
}

// Validate CSRF token
export function validateCSRFToken(token: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64').toString();
    const [timestamp, randomBytes, signature] = decoded.split(':');
    
    if (!timestamp || !randomBytes || !signature) {
      return false;
    }
    
    // Check token age
    const tokenTime = parseInt(timestamp);
    if (Date.now() - tokenTime > CSRF_TOKEN_TIMEOUT) {
      return false;
    }
    
    // Verify signature
    const payload = `${timestamp}:${randomBytes}`;
    const hmac = crypto.createHmac('sha256', CSRF_SECRET);
    hmac.update(payload);
    const expectedSignature = hmac.digest('hex');
    
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  } catch (error) {
    return false;
  }
}

// CSRF Protection Middleware
export function csrfProtection(req: any, res: Response, next: NextFunction) {
  // Skip CSRF for GET, HEAD, OPTIONS requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }
  
  // Skip for API key authenticated requests (external access)
  if (req.authType === 'apikey') {
    return next();
  }
  
  // Skip CSRF for authentication endpoints
  if (req.path === '/api/auth/login' || 
      req.path === '/api/auth/logout' || 
      req.path === '/api/auth/register' ||
      req.path === '/api/oauth/callback') {
    return next();
  }
  
  // Check for CSRF token
  const token = req.header('X-CSRF-Token') || req.body._csrf;
  
  if (!token || !validateCSRFToken(token)) {
    return res.status(403).json({
      error: 'CSRF token validation failed',
      message: 'Invalid or missing CSRF token',
      timestamp: new Date().toISOString()
    });
  }
  
  next();
}

// Enhanced Security Headers Middleware
export function securityHeaders(req: Request, res: Response, next: NextFunction) {
  // Additional security headers beyond helmet
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Download-Options', 'noopen');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Enhanced XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Strict Transport Security (HTTPS only)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  }
  
  // Feature Policy / Permissions Policy for additional protection
  res.setHeader('Permissions-Policy', 
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()'
  );
  
  next();
}

// Request validation middleware
export function validateRequest(req: Request, res: Response, next: NextFunction) {
  // Validate request size
  if (req.get('content-length')) {
    const contentLength = parseInt(req.get('content-length') || '0');
    if (contentLength > 10 * 1024 * 1024) { // 10MB limit
      return res.status(413).json({
        error: 'Request too large',
        message: 'Request size exceeds maximum allowed limit'
      });
    }
  }
  
  // Validate User-Agent (basic bot detection)
  const userAgent = req.get('user-agent') || '';
  if (userAgent.length === 0 || userAgent.length > 1000) {
    console.warn(`Suspicious User-Agent from ${req.ip}: ${userAgent.substring(0, 100)}`);
  }
  
  // Rate limiting based on suspicious patterns
  const suspiciousPatterns = [
    /sqlmap/i,
    /nikto/i,
    /nmap/i,
    /dirb/i,
    /dirbuster/i,
    /gobuster/i
  ];
  
  if (suspiciousPatterns.some(pattern => pattern.test(userAgent))) {
    console.warn(`Blocked suspicious request from ${req.ip}: ${userAgent}`);
    return res.status(403).json({
      error: 'Access denied',
      message: 'Suspicious activity detected'
    });
  }
  
  next();
}

// Session security enhancements
export function enhanceSessionSecurity(req: any, res: Response, next: NextFunction) {
  // Add session fingerprinting for additional security
  if (req.session && req.session.isAuthenticated) {
    const userAgent = req.get('user-agent') || '';
    const acceptLanguage = req.get('accept-language') || '';
    
    // Create a simple fingerprint
    const fingerprint = crypto
      .createHash('sha256')
      .update(userAgent + acceptLanguage + req.ip)
      .digest('hex');
    
    // Check fingerprint consistency
    if (!req.session.fingerprint) {
      req.session.fingerprint = fingerprint;
    } else if (req.session.fingerprint !== fingerprint) {
      // Potential session hijacking attempt
      console.warn(`Session fingerprint mismatch for user ${req.session.username} from ${req.ip}`);
      req.session.destroy(() => {
        res.status(401).json({
          error: 'Session security violation',
          message: 'Please log in again',
          requiresLogin: true
        });
      });
      return;
    }
  }
  
  next();
}

// Security monitoring middleware
export function securityMonitoring(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    // Log security events
    if (res.statusCode === 401 || res.statusCode === 403) {
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        type: 'security_event',
        event: res.statusCode === 401 ? 'unauthorized_access' : 'forbidden_access',
        ip: req.ip,
        userAgent: req.get('user-agent'),
        path: req.path,
        method: req.method,
        duration
      }));
    }
    
    // Log slow requests (potential DoS)
    if (duration > 5000 && req.path.startsWith('/api/')) {
      console.warn(JSON.stringify({
        timestamp: new Date().toISOString(),
        type: 'performance_alert',
        event: 'slow_request',
        ip: req.ip,
        path: req.path,
        method: req.method,
        duration
      }));
    }
  });
  
  next();
}

// CSRF token endpoint for frontend
export function csrfTokenHandler(req: any, res: Response) {
  const token = generateCSRFToken();
  res.json({
    csrf_token: token,
    expires_in: CSRF_TOKEN_TIMEOUT,
    timestamp: new Date().toISOString()
  });
}