import express, { type Request, Response, NextFunction } from "express";
import helmet from "helmet";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { requestLoggingMiddleware } from "./logger";
import { registerMonitoringRoutes } from "./monitoring";
import { createSessionConfig } from "./session";
import { securityHeaders, validateRequest, securityMonitoring, enhanceSessionSecurity } from "./security";

const app = express();

// CORS Configuration - Configurable via environment variables
function getAllowedOrigins() {
  const envOrigins = process.env.ALLOWED_ORIGINS;
  
  // Default origins for development
  const defaultOrigins = [
    'https://7b205498-4b0d-481c-9eb6-3b1045205610-00-3tn3clg6lr6dh.worf.replit.dev', // Kaomi chatbot
    /\.replit\.dev$/, // Allow all Replit URLs for development
    /\.replit\.app$/, // Allow all published Replit apps
    'http://localhost:3000', // Local development
    'http://localhost:5000', // Local development
  ];
  
  if (envOrigins) {
    // Parse comma-separated origins from environment variable
    const customOrigins = envOrigins.split(',').map(origin => origin.trim()).filter(Boolean);
    console.log(`CORS: Using ${customOrigins.length} origins from ALLOWED_ORIGINS environment variable`);
    return [...defaultOrigins, ...customOrigins];
  }
  
  console.log(`CORS: Using ${defaultOrigins.length} default origins (set ALLOWED_ORIGINS env var to customize)`);
  return defaultOrigins;
}

const allowedOrigins = getAllowedOrigins();

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list or matches pattern
    const isAllowed = allowedOrigins.some(allowed => {
      if (typeof allowed === 'string') {
        return origin === allowed;
      } else if (allowed instanceof RegExp) {
        return allowed.test(origin);
      }
      return false;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies and auth headers
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-CSRF-Token'],
}));

// CRITICAL: Configure trust proxy for production deployment
const isDevelopment = process.env.NODE_ENV === "development";
if (!isDevelopment) {
  // Trust first proxy in production (for reverse proxy like nginx)
  app.set('trust proxy', 1);
  console.log('Trust proxy enabled for production');
} else {
  // In development, trust localhost for proper IP detection
  app.set('trust proxy', 'loopback');
}

// Add comprehensive security headers - development and production aware

if (isDevelopment) {
  // Development mode: More permissive CSP for Vite compatibility
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        scriptSrc: ["'self'", "'unsafe-eval'", "'unsafe-inline'"], // Vite needs these in dev
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: ["'self'", "wss:", "ws:", "https:", `ws://localhost:*`, `http://localhost:*`],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
      }
    },
    crossOriginEmbedderPolicy: false,
    hsts: false, // Disable HSTS in development
  }));
} else {
  // Production mode: Secure CSP
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        scriptSrc: ["'self'"], // No unsafe-eval in production
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "wss:", "https:"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "https://fonts.googleapis.com", "data:"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
      }
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    },
    noSniff: true,
    frameguard: { action: 'deny' },
    xssFilter: true
  }));
}

app.use(express.json({ limit: '10mb' })); // Set reasonable request size limit
app.use(express.urlencoded({ extended: false, limit: '10mb' }));

// CRITICAL: Add session middleware for secure authentication
// Session will be initialized in async startup

// Add comprehensive security middleware
app.use(securityHeaders);
app.use(validateRequest);
app.use(securityMonitoring);
app.use(enhanceSessionSecurity);

// Add comprehensive request logging middleware
app.use(requestLoggingMiddleware);

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      // Log request performance metrics without exposing sensitive response data
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      
      // Only log safe, non-sensitive metadata
      if (res.statusCode >= 400) {
        logLine += ` [ERROR]`;
      } else if (res.statusCode >= 200 && res.statusCode < 300) {
        logLine += ` [SUCCESS]`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize session middleware with PostgreSQL store
  const sessionMiddleware = await createSessionConfig();
  app.use(sessionMiddleware);
  
  const server = await registerRoutes(app);
  
  // Register monitoring and logging routes
  registerMonitoringRoutes(app);

  // API 404 guard - ensure no /api requests fall through to Vite
  app.all('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API route not found' });
  });

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
