import { performance } from 'perf_hooks';

export interface RequestLogEntry {
  requestId: string;
  timestamp: string;
  method: string;
  url: string;
  userAgent?: string;
  ip: string;
  headers: Record<string, any>;
  body?: any;
  responseStatus?: number;
  responseTime?: number;
  error?: any;
  salesforceOperation?: string;
  salesforceOrgId?: string;
  recordCount?: number;
}

export interface PerformanceMetrics {
  requestCount: number;
  averageResponseTime: number;
  errorRate: number;
  totalErrors: number;
  lastHourRequests: number;
  slowestEndpoints: Array<{
    endpoint: string;
    averageTime: number;
    callCount: number;
  }>;
}

class Logger {
  private logs: RequestLogEntry[] = [];
  private maxLogEntries = 10000; // Keep last 10k entries in memory
  private requestStartTimes = new Map<string, number>();
  private endpointMetrics = new Map<string, { totalTime: number; callCount: number; errors: number }>();

  generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  startRequest(requestId: string, method: string, url: string, headers: any, body: any, ip: string): void {
    this.requestStartTimes.set(requestId, performance.now());
    
    const logEntry: RequestLogEntry = {
      requestId,
      timestamp: new Date().toISOString(),
      method,
      url,
      userAgent: headers['user-agent'],
      ip,
      headers: this.sanitizeHeaders(headers),
      body: this.sanitizeBody(body),
    };

    this.addLogEntry(logEntry);
    
    // Extract Salesforce operation from URL
    const operation = this.extractSalesforceOperation(url);
    if (operation) {
      this.updateLogEntry(requestId, { salesforceOperation: operation });
    }
  }

  endRequest(requestId: string, responseStatus: number, error?: any): void {
    const startTime = this.requestStartTimes.get(requestId);
    if (startTime) {
      const responseTime = performance.now() - startTime;
      this.requestStartTimes.delete(requestId);
      
      this.updateLogEntry(requestId, {
        responseStatus,
        responseTime: Math.round(responseTime * 100) / 100, // Round to 2 decimal places
        error: error ? this.sanitizeError(error) : undefined
      });

      // Update endpoint metrics
      const logEntry = this.getLogEntry(requestId);
      if (logEntry) {
        this.updateEndpointMetrics(logEntry.url, responseTime, responseStatus >= 400);
      }
    }
  }

  updateSalesforceContext(requestId: string, orgId?: string, recordCount?: number): void {
    const updates: Partial<RequestLogEntry> = {};
    if (orgId) updates.salesforceOrgId = orgId;
    if (recordCount !== undefined) updates.recordCount = recordCount;
    
    this.updateLogEntry(requestId, updates);
  }

  getRecentLogs(limit: number = 100): RequestLogEntry[] {
    return this.logs.slice(-limit).reverse();
  }

  getLogsByTimeRange(startTime: Date, endTime: Date): RequestLogEntry[] {
    return this.logs.filter(log => {
      const logTime = new Date(log.timestamp);
      return logTime >= startTime && logTime <= endTime;
    });
  }

  getLogsByOperation(operation: string): RequestLogEntry[] {
    return this.logs.filter(log => log.salesforceOperation === operation);
  }

  getErrorLogs(): RequestLogEntry[] {
    return this.logs.filter(log => log.error || (log.responseStatus && log.responseStatus >= 400));
  }

  getPerformanceMetrics(): PerformanceMetrics {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentLogs = this.getLogsByTimeRange(oneHourAgo, new Date());
    
    const totalRequests = this.logs.length;
    const totalResponseTime = this.logs
      .filter(log => log.responseTime)
      .reduce((sum, log) => sum + (log.responseTime || 0), 0);
    
    const logsWithResponseTime = this.logs.filter(log => log.responseTime);
    const averageResponseTime = logsWithResponseTime.length > 0 
      ? totalResponseTime / logsWithResponseTime.length 
      : 0;
    
    const totalErrors = this.logs.filter(log => 
      log.error || (log.responseStatus && log.responseStatus >= 400)
    ).length;
    
    const errorRate = totalRequests > 0 ? (totalErrors / totalRequests) * 100 : 0;

    // Calculate slowest endpoints
    const slowestEndpoints = Array.from(this.endpointMetrics.entries())
      .map(([endpoint, metrics]) => ({
        endpoint,
        averageTime: metrics.totalTime / metrics.callCount,
        callCount: metrics.callCount
      }))
      .sort((a, b) => b.averageTime - a.averageTime)
      .slice(0, 10);

    return {
      requestCount: totalRequests,
      averageResponseTime: Math.round(averageResponseTime * 100) / 100,
      errorRate: Math.round(errorRate * 100) / 100,
      totalErrors,
      lastHourRequests: recentLogs.length,
      slowestEndpoints
    };
  }

  clearLogs(): void {
    this.logs = [];
    this.endpointMetrics.clear();
    this.requestStartTimes.clear();
  }

  // Export logs for analysis
  exportLogs(format: 'json' | 'csv' = 'json'): string {
    if (format === 'csv') {
      return this.exportLogsAsCSV();
    }
    return JSON.stringify(this.logs, null, 2);
  }

  private addLogEntry(entry: RequestLogEntry): void {
    this.logs.push(entry);
    
    // Trim logs if we exceed the maximum
    if (this.logs.length > this.maxLogEntries) {
      this.logs = this.logs.slice(-this.maxLogEntries);
    }
  }

  private updateLogEntry(requestId: string, updates: Partial<RequestLogEntry>): void {
    const logIndex = this.logs.findIndex(log => log.requestId === requestId);
    if (logIndex !== -1) {
      this.logs[logIndex] = { ...this.logs[logIndex], ...updates };
    }
  }

  private getLogEntry(requestId: string): RequestLogEntry | undefined {
    return this.logs.find(log => log.requestId === requestId);
  }

  private updateEndpointMetrics(url: string, responseTime: number, isError: boolean): void {
    if (!this.endpointMetrics.has(url)) {
      this.endpointMetrics.set(url, { totalTime: 0, callCount: 0, errors: 0 });
    }
    
    const metrics = this.endpointMetrics.get(url)!;
    metrics.totalTime += responseTime;
    metrics.callCount += 1;
    if (isError) {
      metrics.errors += 1;
    }
  }

  private extractSalesforceOperation(url: string): string | undefined {
    const apiMatch = url.match(/\/api\/(\w+)/);
    return apiMatch ? apiMatch[1] : undefined;
  }

  private sanitizeHeaders(headers: any): Record<string, any> {
    const sanitized = { ...headers };
    
    // Remove or mask sensitive headers
    if (sanitized.authorization) {
      sanitized.authorization = '[REDACTED]';
    }
    if (sanitized.cookie) {
      sanitized.cookie = '[REDACTED]';
    }
    
    return sanitized;
  }

  private sanitizeBody(body: any): any {
    if (!body || typeof body !== 'object') {
      return body;
    }
    
    const sanitized = { ...body };
    
    // Remove or mask sensitive fields
    if (sanitized.access_token) {
      sanitized.access_token = '[REDACTED]';
    }
    if (sanitized.password) {
      sanitized.password = '[REDACTED]';
    }
    if (sanitized.client_secret) {
      sanitized.client_secret = '[REDACTED]';
    }
    
    return sanitized;
  }

  private sanitizeError(error: any): any {
    if (error && typeof error === 'object') {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack ? error.stack.split('\n').slice(0, 5).join('\n') : undefined,
        code: error.code,
        type: error.type
      };
    }
    return error;
  }

  private exportLogsAsCSV(): string {
    if (this.logs.length === 0) {
      return 'No logs available';
    }
    
    const headers = [
      'requestId', 'timestamp', 'method', 'url', 'ip', 'userAgent',
      'responseStatus', 'responseTime', 'salesforceOperation', 'recordCount', 'hasError'
    ];
    
    const csvRows = [headers.join(',')];
    
    for (const log of this.logs) {
      const row = [
        log.requestId,
        log.timestamp,
        log.method,
        log.url,
        log.ip,
        log.userAgent || '',
        log.responseStatus || '',
        log.responseTime || '',
        log.salesforceOperation || '',
        log.recordCount || '',
        log.error ? 'true' : 'false'
      ];
      
      // Escape CSV values that contain commas
      const escapedRow = row.map(value => {
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      });
      
      csvRows.push(escapedRow.join(','));
    }
    
    return csvRows.join('\n');
  }
}

export const logger = new Logger();

// Middleware for Express to automatically log requests
export function requestLoggingMiddleware(req: any, res: any, next: any) {
  const requestId = logger.generateRequestId();
  req.requestId = requestId;
  
  // Get real IP address
  const ip = req.ip || 
    req.connection?.remoteAddress || 
    req.socket?.remoteAddress || 
    (req.connection?.socket ? req.connection.socket.remoteAddress : null) ||
    'unknown';
  
  logger.startRequest(
    requestId,
    req.method,
    req.url,
    req.headers,
    req.body,
    ip
  );
  
  // Override res.json to capture response
  const originalJson = res.json;
  res.json = function(body: any) {
    logger.endRequest(requestId, res.statusCode);
    return originalJson.call(this, body);
  };
  
  // Override res.status to capture status changes
  const originalStatus = res.status;
  res.status = function(code: number) {
    res.statusCode = code;
    return originalStatus.call(this, code);
  };
  
  // Handle errors
  res.on('error', (error: any) => {
    logger.endRequest(requestId, res.statusCode || 500, error);
  });
  
  next();
}

// Helper function for updating Salesforce context from services
export function updateSalesforceContext(req: any, orgId?: string, recordCount?: number) {
  if (req.requestId) {
    logger.updateSalesforceContext(req.requestId, orgId, recordCount);
  }
}