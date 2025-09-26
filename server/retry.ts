import { SalesforceErrorHandler, SalesforceServiceError } from './error-handler';

export interface RetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  jitter?: boolean;
  allowNonIdempotentRetry?: boolean;
  onRetry?: (attempt: number, error: SalesforceServiceError, delay: number) => void;
}

export interface RetryContext {
  operation: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'HEAD';
  isIdempotent?: boolean;
}

/**
 * Default retry configurations based on operation type
 */
const DEFAULT_RETRY_OPTIONS = {
  // For idempotent operations (GET, HEAD, describe, query, search, metadata)
  idempotent: {
    maxAttempts: 4,
    baseDelayMs: 500,
    maxDelayMs: 30000,
    jitter: true,
    allowNonIdempotentRetry: false
  },
  
  // For non-idempotent operations (POST, PATCH, DELETE)
  nonIdempotent: {
    maxAttempts: 2, // Only retry network errors and explicit 429 with Retry-After
    baseDelayMs: 1000,
    maxDelayMs: 10000,
    jitter: true,
    allowNonIdempotentRetry: false // CRITICAL: Prevent unsafe retries by default
  }
} as const;

/**
 * Executes an operation with intelligent retry logic based on error types
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  context: RetryContext,
  options: RetryOptions = {}
): Promise<T> {
  const isIdempotent = context.isIdempotent ?? isIdempotentMethod(context.method);
  const defaultOpts = isIdempotent ? DEFAULT_RETRY_OPTIONS.idempotent : DEFAULT_RETRY_OPTIONS.nonIdempotent;
  
  const config = {
    ...defaultOpts,
    ...options
  };

  let lastError: SalesforceServiceError | null = null;
  
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      // Execute the operation
      const result = await operation();
      return result;
      
    } catch (error: any) {
      // Convert to our standardized error format
      const salesforceError = error instanceof SalesforceServiceError 
        ? error 
        : SalesforceServiceError.fromError(error, context.operation);
      
      lastError = salesforceError;
      
      // Check if we should retry this error
      const shouldRetry = shouldRetryError(salesforceError, context, config, attempt);
      
      if (!shouldRetry || attempt >= config.maxAttempts) {
        // Enrich the error with retry attempt information
        const enrichedError = enrichErrorWithRetryInfo(salesforceError, attempt, context.operation);
        throw enrichedError;
      }
      
      // Calculate retry delay
      const delay = calculateRetryDelay(salesforceError, attempt, config);
      
      // Call retry hook if provided
      if (config.onRetry) {
        config.onRetry(attempt, salesforceError, delay);
      }
      
      // Log retry attempt
      console.warn(`Retrying ${context.operation} (attempt ${attempt + 1}/${config.maxAttempts})`, {
        operation: context.operation,
        method: context.method,
        errorType: salesforceError.errorData.type,
        errorCode: salesforceError.errorData.code,
        delay: delay,
        attempt: attempt + 1,
        maxAttempts: config.maxAttempts
      });
      
      // Wait before retry
      await sleep(delay);
    }
  }
  
  // This should never be reached, but TypeScript requires it
  throw lastError || new Error(`Operation ${context.operation} failed after ${config.maxAttempts} attempts`);
}

/**
 * Determines if an error should be retried based on error type and context
 */
function shouldRetryError(
  error: SalesforceServiceError, 
  context: RetryContext, 
  config: RetryOptions, 
  attempt: number
): boolean {
  const errorData = error.errorData;
  
  // Use existing error handler logic
  if (!SalesforceErrorHandler.shouldRetry(errorData)) {
    return false;
  }
  
  // For non-idempotent operations, be extremely restrictive to prevent data corruption
  if (!isIdempotentMethod(context.method)) {
    // Only retry network errors (before any response) and explicit rate limits with Retry-After
    // NEVER retry SERVER_ERROR for write operations - they may have partial side effects
    return errorData.type === 'NETWORK' || 
           (errorData.type === 'RATE_LIMIT' && typeof errorData.retryAfter === 'number');
  }
  
  // For idempotent operations, retry most recoverable errors
  return errorData.recoverable && (
    errorData.type === 'NETWORK' ||
    errorData.type === 'RATE_LIMIT' ||
    errorData.type === 'SERVER_ERROR'
  );
}

/**
 * Calculates retry delay with exponential backoff and jitter
 */
function calculateRetryDelay(
  error: SalesforceServiceError, 
  attempt: number, 
  config: RetryOptions
): number {
  const errorData = error.errorData;
  
  // Respect explicit Retry-After from Salesforce
  if (errorData.retryAfter) {
    return errorData.retryAfter * 1000; // Convert to milliseconds
  }
  
  // Use existing error handler delay calculation
  let delay = SalesforceErrorHandler.getRetryDelay(errorData, attempt);
  
  // Apply our configuration bounds
  delay = Math.min(delay, config.maxDelayMs || 30000);
  delay = Math.max(delay, config.baseDelayMs || 500);
  
  // Add jitter if enabled
  if (config.jitter === true) {
    const jitterAmount = Math.random() * delay * 0.1; // 10% jitter
    delay += jitterAmount;
  }
  
  return Math.floor(delay);
}

/**
 * Enriches error with retry attempt information
 */
function enrichErrorWithRetryInfo(
  error: SalesforceServiceError, 
  attempts: number, 
  operation: string
): SalesforceServiceError {
  const enrichedErrorData = {
    ...error.errorData,
    details: {
      ...error.errorData.details,
      retryInfo: {
        operation,
        totalAttempts: attempts,
        finalAttempt: true
      }
    }
  };
  
  return new SalesforceServiceError(enrichedErrorData, operation);
}

/**
 * Determines if an HTTP method is idempotent
 */
function isIdempotentMethod(method: string): boolean {
  return ['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method.toUpperCase());
}

/**
 * Sleep utility for delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Pre-configured retry wrapper for common Salesforce operations
 */
export class RetryableOperation {
  /**
   * For SOQL queries and searches
   */
  static async query<T>(operation: () => Promise<T>, operationName: string = 'Query'): Promise<T> {
    return executeWithRetry(operation, {
      operation: operationName,
      method: 'GET',
      isIdempotent: true
    });
  }
  
  /**
   * For metadata operations (describe, schema retrieval)
   */
  static async metadata<T>(operation: () => Promise<T>, operationName: string = 'Metadata'): Promise<T> {
    return executeWithRetry(operation, {
      operation: operationName,
      method: 'GET',
      isIdempotent: true
    });
  }
  
  /**
   * For record creation (non-idempotent)
   */
  static async create<T>(operation: () => Promise<T>, operationName: string = 'Create Record'): Promise<T> {
    return executeWithRetry(operation, {
      operation: operationName,
      method: 'POST',
      isIdempotent: false
    }, {
      maxAttempts: 2, // Conservative for creates
      onRetry: (attempt, error, delay) => {
        console.info(`Retrying ${operationName} - network or rate limit error`, {
          attempt,
          errorType: error.errorData.type,
          delay
        });
      }
    });
  }
  
  /**
   * For record updates (can be retried more aggressively)
   */
  static async update<T>(operation: () => Promise<T>, operationName: string = 'Update Record'): Promise<T> {
    return executeWithRetry(operation, {
      operation: operationName,
      method: 'PATCH',
      isIdempotent: true // Updates with same data are idempotent
    });
  }
  
  /**
   * For record deletions (non-idempotent)
   */
  static async delete<T>(operation: () => Promise<T>, operationName: string = 'Delete Record'): Promise<T> {
    return executeWithRetry(operation, {
      operation: operationName,
      method: 'DELETE',
      isIdempotent: false
    }, {
      maxAttempts: 2
      // SAFETY: Uses default safe retry policy - only network errors and explicit rate limits
    });
  }
  
  /**
   * For bulk operations (special handling)
   */
  static async bulk<T>(operation: () => Promise<T>, operationName: string = 'Bulk Operation'): Promise<T> {
    return executeWithRetry(operation, {
      operation: operationName,
      method: 'POST',
      isIdempotent: false
    }, {
      maxAttempts: 3,
      baseDelayMs: 2000, // Longer delays for bulk
      maxDelayMs: 60000
      // SAFETY: Uses default safe retry policy - only network errors and explicit rate limits
    });
  }
}