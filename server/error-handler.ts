import { AxiosError } from 'axios';
import type { Request, Response, NextFunction } from 'express';

export interface SalesforceError {
  type: 'AUTHENTICATION' | 'AUTHORIZATION' | 'VALIDATION' | 'RATE_LIMIT' | 'SERVER_ERROR' | 'NETWORK' | 'NOT_FOUND' | 'CONFLICT' | 'UNKNOWN';
  code: string;
  message: string;
  details?: any;
  recoverable: boolean;
  retryAfter?: number;
  suggestedAction?: string;
}

export class SalesforceErrorHandler {
  static categorizeError(error: any): SalesforceError {
    // Handle Axios errors
    if (error.isAxiosError || error.response) {
      const axiosError = error as AxiosError;
      const status = axiosError.response?.status;
      const responseData = axiosError.response?.data as any;
      
      switch (status) {
        case 401:
          return {
            type: 'AUTHENTICATION',
            code: 'INVALID_SESSION_ID',
            message: 'Authentication failed. Your session has expired or the access token is invalid.',
            details: responseData,
            recoverable: true,
            suggestedAction: 'Please refresh your access token and try again.'
          };
          
        case 403:
          return {
            type: 'AUTHORIZATION',
            code: 'INSUFFICIENT_ACCESS',
            message: 'Access denied. You do not have permission to perform this operation.',
            details: responseData,
            recoverable: false,
            suggestedAction: 'Contact your Salesforce administrator to request the necessary permissions.'
          };
          
        case 400:
          return this.handleBadRequestError(responseData);
          
        case 404:
          return {
            type: 'NOT_FOUND',
            code: 'NOT_FOUND',
            message: 'The requested resource was not found.',
            details: responseData,
            recoverable: false,
            suggestedAction: 'Verify that the object name, field name, or record ID is correct.'
          };
          
        case 409:
          return {
            type: 'CONFLICT',
            code: 'DUPLICATE_VALUE',
            message: 'A conflict occurred. This often indicates a duplicate value or concurrent modification.',
            details: responseData,
            recoverable: true,
            suggestedAction: 'Check for duplicate values or retry the operation.'
          };
          
        case 429:
          const retryAfter = this.extractRetryAfter(axiosError.response?.headers);
          return {
            type: 'RATE_LIMIT',
            code: 'REQUEST_LIMIT_EXCEEDED',
            message: 'Rate limit exceeded. Too many requests have been made.',
            details: responseData,
            recoverable: true,
            retryAfter: retryAfter,
            suggestedAction: `Wait ${retryAfter || 60} seconds before retrying.`
          };
          
        case 500:
        case 502:
        case 503:
        case 504:
          return {
            type: 'SERVER_ERROR',
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Salesforce server error. This is typically a temporary issue.',
            details: responseData,
            recoverable: true,
            suggestedAction: 'Wait a few minutes and retry the operation.'
          };
          
        default:
          return {
            type: 'UNKNOWN',
            code: `HTTP_${status}`,
            message: `Unexpected HTTP status: ${status}`,
            details: responseData,
            recoverable: false,
            suggestedAction: 'Check the Salesforce API documentation or contact support.'
          };
      }
    }
    
    // Handle network errors
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
      return {
        type: 'NETWORK',
        code: error.code,
        message: 'Network connection failed. Unable to reach Salesforce servers.',
        details: { originalError: error.message },
        recoverable: true,
        suggestedAction: 'Check your internet connection and verify the instance URL is correct.'
      };
    }
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      return {
        type: 'VALIDATION',
        code: 'VALIDATION_ERROR',
        message: error.message,
        details: error.details,
        recoverable: true,
        suggestedAction: 'Correct the validation errors and try again.'
      };
    }
    
    // Default unknown error
    return {
      type: 'UNKNOWN',
      code: 'UNKNOWN_ERROR',
      message: error.message || 'An unknown error occurred.',
      details: error,
      recoverable: false,
      suggestedAction: 'Contact support with the error details.'
    };
  }
  
  private static handleBadRequestError(responseData: any): SalesforceError {
    if (responseData && Array.isArray(responseData)) {
      const firstError = responseData[0];
      
      if (firstError?.errorCode) {
        switch (firstError.errorCode) {
          case 'MALFORMED_QUERY':
            return {
              type: 'VALIDATION',
              code: 'MALFORMED_QUERY',
              message: 'The SOQL query syntax is invalid.',
              details: firstError,
              recoverable: true,
              suggestedAction: 'Check your SOQL syntax and ensure all field names and object names are correct.'
            };
            
          case 'INVALID_FIELD':
            return {
              type: 'VALIDATION',
              code: 'INVALID_FIELD',
              message: 'One or more field names are invalid for this object.',
              details: firstError,
              recoverable: true,
              suggestedAction: 'Verify that all field names exist on the target object.'
            };
            
          case 'REQUIRED_FIELD_MISSING':
            return {
              type: 'VALIDATION',
              code: 'REQUIRED_FIELD_MISSING',
              message: 'Required fields are missing from the record.',
              details: firstError,
              recoverable: true,
              suggestedAction: 'Provide values for all required fields.'
            };
            
          case 'DUPLICATE_VALUE':
            return {
              type: 'VALIDATION',
              code: 'DUPLICATE_VALUE',
              message: 'A duplicate value was found for a unique field.',
              details: firstError,
              recoverable: true,
              suggestedAction: 'Use a unique value for the field or update the existing record.'
            };
            
          case 'STRING_TOO_LONG':
            return {
              type: 'VALIDATION',
              code: 'STRING_TOO_LONG',
              message: 'One or more field values exceed the maximum length.',
              details: firstError,
              recoverable: true,
              suggestedAction: 'Reduce the length of the field values to fit within the limits.'
            };
            
          default:
            return {
              type: 'VALIDATION',
              code: firstError.errorCode,
              message: firstError.message || 'Validation error occurred.',
              details: firstError,
              recoverable: true,
              suggestedAction: 'Review the error details and correct the data.'
            };
        }
      }
    }
    
    return {
      type: 'VALIDATION',
      code: 'BAD_REQUEST',
      message: 'Invalid request. Please check your input data.',
      details: responseData,
      recoverable: true,
      suggestedAction: 'Review the request parameters and ensure all required fields are provided.'
    };
  }
  
  private static extractRetryAfter(headers: any): number | undefined {
    const retryAfter = headers?.['retry-after'] || headers?.['Retry-After'];
    if (retryAfter) {
      const seconds = parseInt(retryAfter, 10);
      return isNaN(seconds) ? undefined : seconds;
    }
    return undefined;
  }
  
  static formatErrorForResponse(error: SalesforceError, operation: string): any {
    return {
      error: {
        type: error.type,
        code: error.code,
        message: `${operation} failed: ${error.message}`,
        recoverable: error.recoverable,
        retryAfter: error.retryAfter,
        suggestedAction: error.suggestedAction,
        details: error.details
      }
    };
  }
  
  static shouldRetry(error: SalesforceError): boolean {
    return error.recoverable && (
      error.type === 'RATE_LIMIT' ||
      error.type === 'SERVER_ERROR' ||
      error.type === 'NETWORK'
    );
  }
  
  static getRetryDelay(error: SalesforceError, attempt: number): number {
    if (error.retryAfter) {
      return error.retryAfter * 1000; // Convert to milliseconds
    }
    
    // Exponential backoff with jitter
    const baseDelay = Math.min(1000 * Math.pow(2, attempt), 30000);
    const jitter = Math.random() * 1000;
    return baseDelay + jitter;
  }
}

export class ValidationError extends Error {
  public details: any;
  
  constructor(message: string, details?: any) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

// Custom error class that carries structured error data
export class SalesforceServiceError extends Error {
  public errorData: SalesforceError;
  
  constructor(errorData: SalesforceError, operation?: string) {
    const message = operation ? `${operation} failed: ${errorData.message}` : errorData.message;
    super(message);
    this.name = 'SalesforceServiceError';
    this.errorData = errorData;
  }
  
  static fromError(error: any, operation: string): SalesforceServiceError {
    const salesforceError = SalesforceErrorHandler.categorizeError(error);
    return new SalesforceServiceError(salesforceError, operation);
  }
  
  getHttpStatusCode(): number {
    switch (this.errorData.type) {
      case 'AUTHENTICATION': return 401;
      case 'AUTHORIZATION': return 403;
      case 'VALIDATION': return 400;
      case 'NOT_FOUND': return 404;
      case 'CONFLICT': return 409;
      case 'RATE_LIMIT': return 429;
      case 'NETWORK': return 503;
      case 'SERVER_ERROR': return 502;
      default: return 500;
    }
  }
  
  toResponseObject(): any {
    return {
      error: {
        type: this.errorData.type,
        code: this.errorData.code,
        message: this.message,
        recoverable: this.errorData.recoverable,
        retryAfter: this.errorData.retryAfter,
        suggestedAction: this.errorData.suggestedAction,
        details: this.errorData.details
      }
    };
  }
}

// Centralized Express error handling middleware
export function salesforceErrorHandler(err: any, req: Request, res: Response, next: NextFunction): void {
  // Handle our custom SalesforceServiceError
  if (err instanceof SalesforceServiceError) {
    res.status(err.getHttpStatusCode()).json(err.toResponseObject());
    return;
  }
  
  // Handle ValidationError
  if (err instanceof ValidationError) {
    res.status(400).json({
      error: {
        type: 'VALIDATION',
        code: 'VALIDATION_ERROR',
        message: err.message,
        recoverable: true,
        suggestedAction: 'Correct the validation errors and try again.',
        details: err.details
      }
    });
    return;
  }
  
  // Handle generic errors by categorizing them
  try {
    const salesforceError = SalesforceErrorHandler.categorizeError(err);
    const serviceError = new SalesforceServiceError(salesforceError);
    res.status(serviceError.getHttpStatusCode()).json(serviceError.toResponseObject());
  } catch (fallbackError) {
    // Ultimate fallback for any errors in error handling
    res.status(500).json({
      error: {
        type: 'UNKNOWN',
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred during error processing.',
        recoverable: false,
        suggestedAction: 'Contact support with the error details.'
      }
    });
  }
}

export function validateRequired(data: any, requiredFields: string[]): void {
  const missing = requiredFields.filter(field => 
    data[field] === undefined || 
    data[field] === null || 
    (typeof data[field] === 'string' && data[field].trim() === '')
  );
  
  if (missing.length > 0) {
    throw new ValidationError(
      `Missing required parameters: ${missing.join(', ')}`,
      { missingFields: missing }
    );
  }
}

export function validateSOQL(soql: string): void {
  if (!soql || typeof soql !== 'string') {
    throw new ValidationError('SOQL query must be a non-empty string');
  }
  
  const trimmedSoql = soql.trim();
  if (trimmedSoql.length === 0) {
    throw new ValidationError('SOQL query cannot be empty');
  }
  
  // Basic SOQL validation
  if (!trimmedSoql.toUpperCase().startsWith('SELECT')) {
    throw new ValidationError('SOQL query must start with SELECT');
  }
  
  if (!trimmedSoql.toUpperCase().includes('FROM')) {
    throw new ValidationError('SOQL query must include FROM clause');
  }
}

export function validateObjectName(objectName: string): void {
  if (!objectName || typeof objectName !== 'string') {
    throw new ValidationError('Object name must be a non-empty string');
  }
  
  const trimmedName = objectName.trim();
  if (trimmedName.length === 0) {
    throw new ValidationError('Object name cannot be empty');
  }
  
  // Basic object name validation
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*(__c)?$/.test(trimmedName)) {
    throw new ValidationError(
      'Object name must start with a letter or underscore, contain only alphanumeric characters and underscores, and optionally end with __c for custom objects'
    );
  }
}

export function validateFieldName(fieldName: string): void {
  if (!fieldName || typeof fieldName !== 'string') {
    throw new ValidationError('Field name must be a non-empty string');
  }
  
  const trimmedName = fieldName.trim();
  if (trimmedName.length === 0) {
    throw new ValidationError('Field name cannot be empty');
  }
  
  // Basic field name validation
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*(__c|__r)?$/.test(trimmedName)) {
    throw new ValidationError(
      'Field name must start with a letter or underscore, contain only alphanumeric characters and underscores, and optionally end with __c or __r'
    );
  }
}

export function validateRecordData(data: any): void {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('Record data must be an object');
  }
  
  if (Array.isArray(data)) {
    throw new ValidationError('Record data must be an object, not an array');
  }
  
  // Check for empty object
  if (Object.keys(data).length === 0) {
    throw new ValidationError('Record data cannot be empty');
  }
}

export function validateBatchRecords(records: any[]): void {
  if (!Array.isArray(records)) {
    throw new ValidationError('Batch records must be an array');
  }
  
  if (records.length === 0) {
    throw new ValidationError('Batch records array cannot be empty');
  }
  
  if (records.length > 10000) {
    throw new ValidationError('Batch cannot contain more than 10,000 records');
  }
  
  // Validate each record
  records.forEach((record, index) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new ValidationError(`Record at index ${index} must be an object`);
    }
    
    if (Object.keys(record).length === 0) {
      throw new ValidationError(`Record at index ${index} cannot be empty`);
    }
  });
}