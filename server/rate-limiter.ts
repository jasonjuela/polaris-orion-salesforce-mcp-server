import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { logger } from './logger';
import crypto from 'crypto';

interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  message?: string;
}

// Default configurations for different API operation types
const RATE_LIMIT_CONFIGS = {
  // General API operations
  general: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100, // 100 requests per 15 minutes
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    message: 'Too many requests from this IP, please try again later.'
  },
  
  // SOQL/SOSL queries - more restrictive
  query: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20, // 20 queries per minute
    skipSuccessfulRequests: false,
    message: 'Query rate limit exceeded. Please wait before executing more queries.'
  },
  
  // Bulk operations - very restrictive
  bulk: {
    windowMs: 5 * 60 * 1000, // 5 minutes
    maxRequests: 5, // 5 bulk operations per 5 minutes
    skipSuccessfulRequests: false,
    message: 'Bulk operation rate limit exceeded. Please wait before starting more bulk operations.'
  },
  
  // CRUD operations - moderate
  crud: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30, // 30 operations per minute
    skipSuccessfulRequests: false,
    message: 'CRUD operation rate limit exceeded. Please wait before making more changes.'
  },
  
  // Metadata operations - lenient
  metadata: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 50, // 50 metadata requests per minute
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    message: 'Metadata request rate limit exceeded. Please wait before making more requests.'
  }
} as const;

/**
 * Generate a key for rate limiting based on Salesforce credentials
 * This ensures rate limiting is per-org/user rather than per-IP
 */
function generateSalesforceKey(req: Request, operationType: string): string {
  const body = req.body || {};
  const { access_token, instance_url } = body;
  
  if (!access_token || !instance_url) {
    // Fallback to IP if Salesforce credentials not available
    return `${req.ip || 'unknown-ip'}_${operationType}`;
  }
  
  // Create a hash of the access token to avoid storing it in plain text
  const tokenHash = crypto.createHash('sha256').update(access_token).digest('hex').slice(0, 16);
  const instanceDomain = instance_url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  
  return `${instanceDomain}_${tokenHash}_${operationType}`;
}

export class RateLimiter {
  private static limiters = new Map<string, any>();

  /**
   * Create a rate limiter for a specific operation type
   */
  static createLimiter(type: keyof typeof RATE_LIMIT_CONFIGS) {
    if (this.limiters.has(type)) {
      return this.limiters.get(type);
    }

    const config = RATE_LIMIT_CONFIGS[type];
    
    const limiter = rateLimit({
      windowMs: config.windowMs,
      max: config.maxRequests,
      skipSuccessfulRequests: (config as any).skipSuccessfulRequests ?? false,
      skipFailedRequests: (config as any).skipFailedRequests ?? false,
      keyGenerator: (req: Request) => generateSalesforceKey(req, type),
      message: {
        error: config.message,
        type: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(config.windowMs / 1000)
      },
      standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
      legacyHeaders: false, // Disable the `X-RateLimit-*` headers
      handler: (req: Request, res: Response) => {
        console.warn('Rate limit exceeded', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          endpoint: req.originalUrl,
          method: req.method,
          type: type,
          limit: config.maxRequests,
          windowMs: config.windowMs
        });

        res.status(429).json({
          error: config.message,
          type: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil(config.windowMs / 1000),
          limit: config.maxRequests,
          windowMs: config.windowMs
        });
      },
      // onLimitReached callback is not available in this version
      // Logging is handled in the handler function above
    });

    this.limiters.set(type, limiter);
    return limiter;
  }

  /**
   * Middleware for general API rate limiting
   */
  static general() {
    return this.createLimiter('general');
  }

  /**
   * Middleware for SOQL/SOSL query rate limiting
   */
  static query() {
    return this.createLimiter('query');
  }

  /**
   * Middleware for bulk operation rate limiting
   */
  static bulk() {
    return this.createLimiter('bulk');
  }

  /**
   * Middleware for CRUD operation rate limiting
   */
  static crud() {
    return this.createLimiter('crud');
  }

  /**
   * Middleware for metadata operation rate limiting
   */
  static metadata() {
    return this.createLimiter('metadata');
  }

  /**
   * Custom rate limiting for specific requirements
   */
  static custom(config: RateLimitConfig) {
    return rateLimit({
      windowMs: config.windowMs,
      max: config.maxRequests,
      skipSuccessfulRequests: config.skipSuccessfulRequests,
      skipFailedRequests: config.skipFailedRequests,
      message: {
        error: config.message || 'Rate limit exceeded',
        type: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(config.windowMs / 1000)
      },
      standardHeaders: true,
      legacyHeaders: false,
      handler: (req: Request, res: Response) => {
        console.warn('Custom rate limit exceeded', {
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          endpoint: req.originalUrl,
          method: req.method,
          config: config
        });

        res.status(429).json({
          error: config.message || 'Rate limit exceeded',
          type: 'RATE_LIMIT_EXCEEDED',
          retryAfter: Math.ceil(config.windowMs / 1000)
        });
      }
    });
  }

  /**
   * Middleware to handle Salesforce API rate limit responses
   */
  static salesforceRateLimitHandler() {
    return (err: any, req: Request, res: Response, next: NextFunction) => {
      if (err.response?.status === 429) {
        const retryAfter = parseInt(err.response.headers['retry-after']) || 60;
        
        console.warn('Salesforce rate limit hit', {
          endpoint: req.originalUrl,
          method: req.method,
          retryAfter: retryAfter,
          salesforceError: err.response.data
        });

        return res.status(429).json({
          error: 'Salesforce API rate limit exceeded',
          type: 'SALESFORCE_RATE_LIMIT',
          retryAfter: retryAfter,
          suggestedAction: `Wait ${retryAfter} seconds before retrying`,
          salesforceMessage: err.response.data?.message || err.message
        });
      }
      
      next(err);
    };
  }

  /**
   * Get current rate limit status for monitoring
   */
  static getStatus() {
    const status: Record<string, any> = {};
    
    for (const [type, limiter] of Array.from(this.limiters.entries())) {
      // Note: express-rate-limit doesn't expose internal stats by default
      // This is a placeholder for monitoring integration
      status[type] = {
        configured: true,
        config: RATE_LIMIT_CONFIGS[type as keyof typeof RATE_LIMIT_CONFIGS]
      };
    }
    
    return status;
  }
}

/**
 * Request queuing system for handling bursts within rate limits
 */
export class RequestQueue {
  private static queues = new Map<string, { queue: Array<() => void>, processing: boolean }>();

  /**
   * Queue a request to be processed within rate limits
   */
  static async enqueue<T>(
    queueKey: string,
    operation: () => Promise<T>,
    maxConcurrent: number = 3,
    delayBetweenRequests: number = 1000
  ): Promise<T> {
    if (!this.queues.has(queueKey)) {
      this.queues.set(queueKey, { queue: [], processing: false });
    }

    const queueInfo = this.queues.get(queueKey)!;

    return new Promise((resolve, reject) => {
      queueInfo.queue.push(async () => {
        try {
          const result = await operation();
          resolve(result);
        } catch (error) {
          reject(error);
        }
      });

      this.processQueue(queueKey, maxConcurrent, delayBetweenRequests);
    });
  }

  private static async processQueue(
    queueKey: string,
    maxConcurrent: number,
    delayBetweenRequests: number
  ) {
    const queueInfo = this.queues.get(queueKey);
    if (!queueInfo || queueInfo.queue.length === 0) {
      return;
    }

    // Don't block if already processing, but check if we can start new operations
    if (queueInfo.processing) {
      return;
    }

    queueInfo.processing = true;
    
    // Process operations one by one to avoid overwhelming the system
    const processNext = async () => {
      const operation = queueInfo.queue.shift();
      if (!operation) {
        queueInfo.processing = false;
        return;
      }

      try {
        await operation();
      } catch (error) {
        console.error('Queued operation failed', { queueKey, error });
      }

      // Schedule the next operation if there are more items
      if (queueInfo.queue.length > 0) {
        setTimeout(processNext, delayBetweenRequests);
      } else {
        queueInfo.processing = false;
      }
    };

    // Start processing
    processNext();
  }

  /**
   * Get queue status for monitoring
   */
  static getQueueStatus() {
    const status: Record<string, any> = {};
    
    for (const [key, queueInfo] of Array.from(this.queues.entries())) {
      status[key] = {
        queueLength: queueInfo.queue.length,
        processing: queueInfo.processing
      };
    }
    
    return status;
  }

  /**
   * Clear a specific queue
   */
  static clearQueue(queueKey: string) {
    const queueInfo = this.queues.get(queueKey);
    if (queueInfo) {
      queueInfo.queue.length = 0;
      queueInfo.processing = false;
      console.info('Queue cleared', { queueKey });
    }
  }

  /**
   * Clear all queues
   */
  static clearAllQueues() {
    for (const [queueKey] of Array.from(this.queues.entries())) {
      this.clearQueue(queueKey);
    }
    console.info('All queues cleared');
  }
}