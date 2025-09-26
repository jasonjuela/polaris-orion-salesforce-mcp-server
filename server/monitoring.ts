import type { Express, Request, Response, NextFunction } from "express";
import { logger } from "./logger";
import { RateLimiter, RequestQueue } from "./rate-limiter";
import { SalesforceErrorHandler } from './error-handler';
import { monitorEventLoopDelay } from 'perf_hooks';
import { readFileSync } from "fs";
import { join } from "path";

interface RequestMetrics {
  method: string;
  path: string;
  count: number;
  totalDurationMs: number;
  avgDurationMs: number;
  lastTenDurations: number[];
  lastRequest: number; // timestamp
}

interface ErrorMetrics {
  type: string;
  code: string;
  operation: string;
  count: number;
  lastOccurrence: number; // timestamp
}

interface SystemMetrics {
  uptime: number;
  eventLoopLag: number;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  nodeVersion: string;
}

interface MonitoringData {
  requests: Map<string, RequestMetrics>;
  errors: Map<string, ErrorMetrics>;
  startTime: number;
  totalRequests: number;
  totalErrors: number;
}

class AdvancedMonitor {
  private data: MonitoringData;
  private eventLoopMonitor: any;
  private lastEventLoopLag: number = 0;

  constructor() {
    this.data = {
      requests: new Map(),
      errors: new Map(),
      startTime: Date.now(),
      totalRequests: 0,
      totalErrors: 0
    };

    // Initialize event loop monitoring
    this.initializeEventLoopMonitoring();
  }

  private initializeEventLoopMonitoring() {
    // Monitor event loop delay
    this.eventLoopMonitor = monitorEventLoopDelay({ resolution: 20 });
    this.eventLoopMonitor.enable();

    // Update event loop lag every 5 seconds
    setInterval(() => {
      const mean = this.eventLoopMonitor.mean / 1000000; // Convert from nanoseconds to milliseconds
      this.lastEventLoopLag = mean;
    }, 5000);
  }

  recordRequest(method: string, path: string): void {
    this.data.totalRequests++;
  }

  recordResponse(method: string, path: string, status: number, durationMs: number): void {
    const key = `${method} ${this.normalizePath(path)}`;
    
    if (!this.data.requests.has(key)) {
      this.data.requests.set(key, {
        method,
        path: this.normalizePath(path),
        count: 0,
        totalDurationMs: 0,
        avgDurationMs: 0,
        lastTenDurations: [],
        lastRequest: Date.now()
      });
    }

    const metrics = this.data.requests.get(key)!;
    metrics.count++;
    metrics.totalDurationMs += durationMs;
    metrics.avgDurationMs = metrics.totalDurationMs / metrics.count;
    metrics.lastRequest = Date.now();

    // Keep last 10 durations for percentile calculation
    metrics.lastTenDurations.push(durationMs);
    if (metrics.lastTenDurations.length > 10) {
      metrics.lastTenDurations.shift();
    }
  }

  recordError(type: string, code: string, operation: string): void {
    this.data.totalErrors++;
    
    const key = `${type}:${code}:${operation}`;
    
    if (!this.data.errors.has(key)) {
      this.data.errors.set(key, {
        type,
        code,
        operation,
        count: 0,
        lastOccurrence: Date.now()
      });
    }

    const errorMetrics = this.data.errors.get(key)!;
    errorMetrics.count++;
    errorMetrics.lastOccurrence = Date.now();
  }

  getAdvancedMetrics(): any {
    const systemMetrics = this.getSystemMetrics();
    const rateLimiterStatus = RateLimiter.getStatus();
    const queueStatus = RequestQueue.getQueueStatus();

    // Convert Maps to objects for JSON serialization
    const requestMetrics: Record<string, any> = {};
    for (const [key, value] of Array.from(this.data.requests.entries())) {
      requestMetrics[key] = {
        ...value,
        p95Duration: this.calculateP95(value.lastTenDurations),
        p99Duration: this.calculateP99(value.lastTenDurations)
      };
    }

    const errorMetrics: Record<string, any> = {};
    for (const [key, value] of Array.from(this.data.errors.entries())) {
      errorMetrics[key] = value;
    }

    return {
      system: systemMetrics,
      requests: {
        total: this.data.totalRequests,
        byEndpoint: requestMetrics
      },
      errors: {
        total: this.data.totalErrors,
        byType: errorMetrics,
        errorRate: this.data.totalRequests > 0 ? 
                  (this.data.totalErrors / this.data.totalRequests * 100).toFixed(2) + '%' : 
                  '0%'
      },
      rateLimiting: rateLimiterStatus,
      queues: queueStatus,
      timestamp: new Date().toISOString()
    };
  }

  getSystemMetrics(): SystemMetrics {
    const memoryUsage = process.memoryUsage();
    
    return {
      uptime: Date.now() - this.data.startTime,
      eventLoopLag: this.lastEventLoopLag,
      memoryUsage: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        rss: memoryUsage.rss
      },
      nodeVersion: process.version
    };
  }

  isHealthy(): { healthy: boolean; issues: string[] } {
    const issues: string[] = [];
    
    // Check event loop lag
    if (this.lastEventLoopLag > 200) { // 200ms threshold
      issues.push(`High event loop lag: ${this.lastEventLoopLag.toFixed(2)}ms`);
    }
    
    // Check memory usage
    const memoryUsage = process.memoryUsage();
    const heapUsagePercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
    if (heapUsagePercent > 90) { // 90% threshold
      issues.push(`High memory usage: ${heapUsagePercent.toFixed(1)}%`);
    }
    
    // Check queue backlogs
    const queueStatus = RequestQueue.getQueueStatus();
    for (const [queueKey, status] of Object.entries(queueStatus)) {
      if (status.queueLength > 50) { // 50 item threshold
        issues.push(`Large queue backlog in ${queueKey}: ${status.queueLength} items`);
      }
    }
    
    // Check error rate (last 100 requests)
    if (this.data.totalRequests > 100) {
      const errorRate = (this.data.totalErrors / this.data.totalRequests) * 100;
      if (errorRate > 25) { // 25% error rate threshold
        issues.push(`High error rate: ${errorRate.toFixed(1)}%`);
      }
    }
    
    return {
      healthy: issues.length === 0,
      issues
    };
  }

  async testSalesforceConnectivity(accessToken: string, instanceUrl: string): Promise<{
    reachable: boolean;
    latency?: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      // Simple connectivity test with short timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(`${instanceUrl}/services/data/v58.0/`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      const latency = Date.now() - startTime;
      
      if (response.ok) {
        return { reachable: true, latency };
      } else {
        return { 
          reachable: false, 
          latency, 
          error: `HTTP ${response.status}: ${response.statusText}` 
        };
      }
    } catch (error: any) {
      const latency = Date.now() - startTime;
      return { 
        reachable: false, 
        latency, 
        error: error.message || 'Connection failed' 
      };
    }
  }

  private normalizePath(path: string): string {
    // Remove query parameters and normalize API paths
    const cleanPath = path.split('?')[0];
    
    // Replace IDs with placeholders for better grouping
    return cleanPath
      .replace(/\/[0-9a-fA-F]{18}/g, '/:salesforceId') // Salesforce IDs
      .replace(/\/[0-9a-fA-F-]{36}/g, '/:uuid')        // UUIDs
      .replace(/\/\d+/g, '/:id');                       // Numeric IDs
  }

  private calculateP95(durations: number[]): number {
    if (durations.length === 0) return 0;
    const sorted = [...durations].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * 0.95) - 1;
    return sorted[Math.max(0, index)];
  }

  private calculateP99(durations: number[]): number {
    if (durations.length === 0) return 0;
    const sorted = [...durations].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * 0.99) - 1;
    return sorted[Math.max(0, index)];
  }
}

// Singleton instances
const advancedMonitor = new AdvancedMonitor();

export function registerMonitoringRoutes(app: Express): void {
  // Get recent logs endpoint
  app.get('/api/logs', (req, res) => {
    try {
      const limit = parseInt(req.query.limit as string) || 100;
      const logs = logger.getRecentLogs(limit);
      res.json({
        logs,
        total: logs.length,
        limit
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve logs' });
    }
  });

  // Get logs by time range
  app.get('/api/logs/range', (req, res) => {
    try {
      const startTime = req.query.start ? new Date(req.query.start as string) : new Date(Date.now() - 24 * 60 * 60 * 1000);
      const endTime = req.query.end ? new Date(req.query.end as string) : new Date();
      
      if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
        return res.status(400).json({ error: 'Invalid date format' });
      }
      
      const logs = logger.getLogsByTimeRange(startTime, endTime);
      res.json({
        logs,
        total: logs.length,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString()
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve logs by time range' });
    }
  });

  // Get logs by Salesforce operation
  app.get('/api/logs/operation/:operation', (req, res) => {
    try {
      const operation = req.params.operation;
      const logs = logger.getLogsByOperation(operation);
      res.json({
        logs,
        total: logs.length,
        operation
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve logs by operation' });
    }
  });

  // Get error logs only
  app.get('/api/logs/errors', (req, res) => {
    try {
      const logs = logger.getErrorLogs();
      res.json({
        logs,
        total: logs.length
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve error logs' });
    }
  });

  // Get performance metrics
  app.get('/api/metrics', (req, res) => {
    try {
      const metrics = logger.getPerformanceMetrics();
      res.json({
        metrics,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve performance metrics' });
    }
  });

  // Export logs (JSON or CSV)
  app.get('/api/logs/export', (req, res) => {
    try {
      const format = (req.query.format as string) || 'json';
      
      if (format !== 'json' && format !== 'csv') {
        return res.status(400).json({ error: 'Format must be json or csv' });
      }
      
      const exportedLogs = logger.exportLogs(format as 'json' | 'csv');
      
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="salesforce-logs-${new Date().toISOString().split('T')[0]}.csv"`);
      } else {
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="salesforce-logs-${new Date().toISOString().split('T')[0]}.json"`);
      }
      
      res.send(exportedLogs);
    } catch (error) {
      res.status(500).json({ error: 'Failed to export logs' });
    }
  });

  // Clear logs (for testing/maintenance)
  app.post('/api/logs/clear', (req, res) => {
    try {
      logger.clearLogs();
      res.json({ 
        message: 'Logs cleared successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to clear logs' });
    }
  });

  // Health check endpoint with basic metrics (legacy)
  app.get('/api/health', (req, res) => {
    try {
      const metrics = logger.getPerformanceMetrics();
      const uptime = process.uptime();
      const memoryUsage = process.memoryUsage();
      
      res.json({
        status: 'healthy',
        uptime: Math.floor(uptime),
        uptimeHuman: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`,
        memory: {
          used: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          total: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          external: Math.round(memoryUsage.external / 1024 / 1024)
        },
        requests: {
          total: metrics.requestCount,
          lastHour: metrics.lastHourRequests,
          averageResponseTime: metrics.averageResponseTime,
          errorRate: metrics.errorRate
        },
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ 
        status: 'unhealthy',
        error: 'Failed to retrieve health metrics',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Liveness probe - always returns 200 if service is running
  app.get('/api/health/live', (req, res) => {
    res.json({
      status: 'alive',
      timestamp: new Date().toISOString()
    });
  });

  // Readiness probe - returns 200 if system is ready to handle requests
  app.get('/api/health/ready', (req, res) => {
    try {
      const healthCheck = advancedMonitor.isHealthy();
      
      if (healthCheck.healthy) {
        res.json({
          status: 'ready',
          timestamp: new Date().toISOString()
        });
      } else {
        res.status(503).json({
          status: 'not_ready',
          issues: healthCheck.issues,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      res.status(503).json({
        status: 'not_ready',
        issues: ['Health check system failure'],
        timestamp: new Date().toISOString()
      });
    }
  });

  // Salesforce connectivity health check
  app.post('/api/health/salesforce', async (req, res) => {
    try {
      const { access_token, instance_url } = req.body;
      
      if (!access_token || !instance_url) {
        return res.status(400).json({
          error: 'Missing required parameters: access_token, instance_url',
          timestamp: new Date().toISOString()
        });
      }

      const connectivityTest = await advancedMonitor.testSalesforceConnectivity(access_token, instance_url);
      
      res.json({
        salesforce: connectivityTest,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({
        salesforce: {
          reachable: false,
          error: 'Internal connectivity test error'
        },
        timestamp: new Date().toISOString()
      });
    }
  });

  // Advanced metrics endpoint (secured for internal use only)
  app.get('/api/health/metrics', (req, res) => {
    // Enhanced security check for internal metrics access
    const authHeader = req.headers['x-internal-metrics-key'];
    const expectedKey = process.env.INTERNAL_METRICS_KEY || 'dev-only-metrics-key';
    
    if (authHeader !== expectedKey) {
      return res.status(401).json({
        error: 'Unauthorized access to internal metrics',
        message: 'This endpoint requires internal authentication credentials',
        timestamp: new Date().toISOString()
      });
    }

    try {
      const advancedMetrics = advancedMonitor.getAdvancedMetrics();
      
      // Sanitize sensitive information for security
      const sanitizedMetrics = {
        ...advancedMetrics,
        // Remove potentially sensitive queue details and rate limiter internals
        queues: Object.keys(advancedMetrics.queues || {}).length > 0 ? 
                { hasActiveQueues: true, queueCount: Object.keys(advancedMetrics.queues).length } :
                { hasActiveQueues: false, queueCount: 0 },
        rateLimiting: { configured: true, types: Object.keys(advancedMetrics.rateLimiting || {}) },
        // Remove detailed error information that could be sensitive
        errors: {
          total: advancedMetrics.errors?.total || 0,
          errorRate: advancedMetrics.errors?.errorRate || '0.00%',
          // Don't expose specific error details
          hasRecentErrors: (advancedMetrics.errors?.total || 0) > 0
        }
      };
      
      res.json(sanitizedMetrics);
    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to retrieve advanced metrics',
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get system information and diagnostics
  app.get('/api/diagnostics', (req, res) => {
    try {
      const metrics = logger.getPerformanceMetrics();
      const recentErrors = logger.getErrorLogs().slice(-10);
      
      res.json({
        system: {
          nodeVersion: process.version,
          platform: process.platform,
          arch: process.arch,
          uptime: process.uptime(),
          memory: process.memoryUsage(),
          cpuUsage: process.cpuUsage()
        },
        performance: metrics,
        recentErrors: recentErrors.map(log => ({
          timestamp: log.timestamp,
          url: log.url,
          method: log.method,
          status: log.responseStatus,
          error: log.error?.message || 'Unknown error',
          operation: log.salesforceOperation
        })),
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve diagnostics' });
    }
  });

  // Get rate limiting status
  app.get('/api/rate-limits', (req, res) => {
    try {
      const rateLimitStatus = RateLimiter.getStatus();
      const queueStatus = RequestQueue.getQueueStatus();
      
      res.json({
        rateLimits: rateLimitStatus,
        queues: queueStatus,
        timestamp: new Date().toISOString(),
        description: {
          general: "General API rate limiting (100 requests per 15 minutes)",
          query: "SOQL/SOSL query rate limiting (20 requests per minute)",
          bulk: "Bulk operation rate limiting (5 operations per 5 minutes)",
          crud: "CRUD operation rate limiting (30 requests per minute)",
          metadata: "Metadata operation rate limiting (50 requests per minute)"
        }
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to retrieve rate limiting status' });
    }
  });

  // Clear request queues (for testing/maintenance)
  app.post('/api/rate-limits/clear-queues', (req, res) => {
    try {
      RequestQueue.clearAllQueues();
      res.json({ 
        message: 'All request queues cleared successfully',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      res.status(500).json({ error: 'Failed to clear request queues' });
    }
  });

  // Serve OpenAPI specification
  app.get('/api/openapi.json', (req, res) => {
    try {
      const specPath = join(process.cwd(), 'server', 'openapi-spec.json');
      const spec = readFileSync(specPath, 'utf8');
      const parsedSpec = JSON.parse(spec);
      
      // Update server URLs with current host if available
      if (req.get('host')) {
        const protocol = req.secure ? 'https' : 'http';
        const currentUrl = `${protocol}://${req.get('host')}/api`;
        
        parsedSpec.servers = [
          {
            url: currentUrl,
            description: "Current server"
          },
          ...parsedSpec.servers
        ];
      }
      
      res.json(parsedSpec);
    } catch (error) {
      res.status(500).json({ error: 'Failed to serve OpenAPI specification' });
    }
  });

  // Serve Swagger UI for interactive documentation
  app.get('/api/docs', (req, res) => {
    const swaggerUiHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Salesforce MCP Assistant API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
  <style>
    html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; background: #fafafa; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: '/api/openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout",
        validatorUrl: null,
        tryItOutEnabled: true,
        requestInterceptor: function(request) {
          // Add any custom headers or modifications here
          return request;
        }
      });
    };
  </script>
</body>
</html>`;
    
    res.setHeader('Content-Type', 'text/html');
    res.send(swaggerUiHtml);
  });
}

/**
 * Express middleware to automatically record request metrics
 */
export function requestMonitoringMiddleware() {
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Record request start
    advancedMonitor.recordRequest(req.method, req.path);
    
    // Hook into response finish to record completion
    const originalSend = res.send;
    res.send = function(body) {
      const duration = Date.now() - startTime;
      advancedMonitor.recordResponse(req.method, req.path, res.statusCode, duration);
      return originalSend.call(this, body);
    };
    
    next();
  };
}

/**
 * Express error middleware to automatically record error metrics
 */
export function errorMonitoringMiddleware() {
  return (err: any, req: Request, res: Response, next: NextFunction) => {
    // Categorize the error using our existing handler
    try {
      const salesforceError = SalesforceErrorHandler.categorizeError(err);
      advancedMonitor.recordError(salesforceError.type, salesforceError.code, req.path);
    } catch (categorizationError) {
      // Fallback if categorization fails
      advancedMonitor.recordError('UNKNOWN', 'CATEGORIZATION_FAILED', req.path);
    }
    
    next(err); // Continue to next error handler
  };
}

export { advancedMonitor as Monitor };
export type { SystemMetrics, RequestMetrics, ErrorMetrics };