import axios from 'axios';
import { SalesforceErrorHandler, SalesforceServiceError, ValidationError, validateRequired, validateSOQL, validateObjectName, validateFieldName, validateRecordData, validateBatchRecords } from './error-handler';
import { RetryableOperation } from './retry';
import { URL } from 'url';
import { SalesforceOAuthService } from './oauth';
import { storage } from './storage';
import type { User } from '@shared/schema';

// Validate Salesforce instance URL to prevent SSRF attacks
export function validateSalesforceUrl(instanceUrl: string): void {
  if (!instanceUrl || typeof instanceUrl !== 'string') {
    throw new ValidationError('Instance URL is required and must be a string');
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(instanceUrl);
  } catch (error) {
    throw new ValidationError('Invalid instance URL format');
  }

  // Must use HTTPS
  if (parsedUrl.protocol !== 'https:') {
    throw new ValidationError('Instance URL must use HTTPS protocol');
  }

  // Must be a legitimate Salesforce domain
  const hostname = parsedUrl.hostname.toLowerCase();
  const allowedDomains = [
    '.salesforce.com',
    '.force.com',
    '.lightning.force.com',
    '.my.salesforce.com',
    '.sandbox.my.salesforce.com',
    '.develop.my.salesforce.com',
    '.scratch.my.salesforce.com'
  ];

  const isAllowedDomain = allowedDomains.some(domain => 
    hostname.endsWith(domain) || hostname === domain.substring(1)
  );

  if (!isAllowedDomain) {
    throw new ValidationError(`Instance URL must be a valid Salesforce domain (${allowedDomains.join(', ')})`);
  }

  // Prevent localhost, private IPs, and internal networks
  const forbiddenPatterns = [
    /^localhost$/i,
    /^127\./,
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^192\.168\./,
    /^169\.254\./, // Link-local
    /^::1$/, // IPv6 localhost
    /^fe80::/i, // IPv6 link-local
    /^fc00::/i, // IPv6 private
    /^fd00::/i  // IPv6 private
  ];

  const isForbiddenHost = forbiddenPatterns.some(pattern => pattern.test(hostname));
  if (isForbiddenHost) {
    throw new ValidationError('Instance URL cannot target private/internal networks');
  }

  // Additional port restrictions (only standard HTTPS port allowed)
  if (parsedUrl.port && parsedUrl.port !== '443') {
    throw new ValidationError('Instance URL must use standard HTTPS port (443)');
  }
}

class SalesforceService {
  private getHeaders(accessToken: string) {
    return {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };
  }

  // Check if token is expired and refresh if needed
  private async ensureValidToken(user: User): Promise<{ accessToken: string; instanceUrl: string }> {
    if (!user.sf_access_token || !user.sf_instance_url) {
      throw new Error('No Salesforce credentials found. Please authenticate first.');
    }

    // Check if token is expired (with 5 minute buffer)
    const now = new Date();
    const expiresAt = user.sf_token_expires_at;
    const bufferTime = 5 * 60 * 1000; // 5 minutes in milliseconds
    
    if (expiresAt && (now.getTime() + bufferTime) >= expiresAt.getTime()) {
      console.log('Access token is expired or expiring soon, refreshing...');
      
      // Check if we have refresh token
      if (!user.sf_refresh_token || !user.sf_client_id || !user.sf_client_secret) {
        throw new Error('Access token expired and no refresh token available. Please re-authenticate.');
      }

      try {
        // Refresh the token
        const tokenResponse = await SalesforceOAuthService.refreshAccessToken(
          user.sf_refresh_token,
          {
            clientId: user.sf_client_id,
            clientSecret: user.sf_client_secret
          }
        );

        // Update stored tokens
        const expiresAt = SalesforceOAuthService.calculateExpirationTime(tokenResponse.expires_in);
        const updatedUser = await storage.updateUserSalesforceTokens(user.id, {
          sf_access_token: tokenResponse.access_token,
          sf_refresh_token: tokenResponse.refresh_token || user.sf_refresh_token,
          sf_token_expires_at: expiresAt,
          sf_instance_url: tokenResponse.instance_url || user.sf_instance_url
        });

        if (!updatedUser) {
          throw new Error('Failed to update user tokens after refresh');
        }

        console.log('Access token refreshed successfully');
        return {
          accessToken: tokenResponse.access_token,
          instanceUrl: tokenResponse.instance_url || user.sf_instance_url!
        };
      } catch (error: any) {
        console.error('Token refresh failed:', error.message);
        throw new Error(`Token refresh failed: ${error.message}. Please re-authenticate.`);
      }
    }

    // Token is still valid
    return {
      accessToken: user.sf_access_token,
      instanceUrl: user.sf_instance_url!
    };
  }

  // Wrapper method to handle token refresh before API calls
  private async withTokenRefresh<T>(
    userId: string, 
    operation: (accessToken: string, instanceUrl: string) => Promise<T>
  ): Promise<T> {
    const user = await storage.getUser(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const { accessToken, instanceUrl } = await this.ensureValidToken(user);
    
    try {
      return await operation(accessToken, instanceUrl);
    } catch (error: any) {
      // If we get an auth error, try refreshing once more
      if (error.response?.status === 401 && user.sf_refresh_token) {
        console.log('Received 401 error, attempting token refresh...');
        
        try {
          const tokenResponse = await SalesforceOAuthService.refreshAccessToken(
            user.sf_refresh_token,
            {
              clientId: user.sf_client_id!,
              clientSecret: user.sf_client_secret!
            }
          );

          const expiresAt = SalesforceOAuthService.calculateExpirationTime(tokenResponse.expires_in);
          await storage.updateUserSalesforceTokens(user.id, {
            sf_access_token: tokenResponse.access_token,
            sf_refresh_token: tokenResponse.refresh_token || user.sf_refresh_token!,
            sf_token_expires_at: expiresAt,
            sf_instance_url: tokenResponse.instance_url || user.sf_instance_url!
          });

          // Retry the operation with the new token
          return await operation(
            tokenResponse.access_token,
            tokenResponse.instance_url || user.sf_instance_url!
          );
        } catch (refreshError: any) {
          console.error('Retry after token refresh failed:', refreshError.message);
          throw new Error('Authentication failed. Please re-authenticate.');
        }
      }
      
      throw error;
    }
  }

  // Session-based method with automatic token refresh
  async runSOQLQueryWithRefresh(userId: string, soql: string) {
    return this.withTokenRefresh(userId, async (accessToken, instanceUrl) => {
      return this.runSOQLQuery(accessToken, instanceUrl, soql);
    });
  }

  // Original method for backward compatibility and direct usage
  async runSOQLQuery(accessToken: string, instanceUrl: string, soql: string) {
    // Validate inputs
    validateRequired({ accessToken, instanceUrl, soql }, ['accessToken', 'instanceUrl', 'soql']);
    validateSalesforceUrl(instanceUrl);
    validateSOQL(soql);

    return RetryableOperation.query(async () => {
      const response = await axios.get(
        `${instanceUrl}/services/data/v58.0/query?q=${encodeURIComponent(soql)}`,
        { headers: this.getHeaders(accessToken) }
      );
      
      return {
        soql,
        records: response.data.records,
        totalSize: response.data.totalSize,
        done: response.data.done
      };
    }, 'SOQL Query');
  }

  // Session-based method with automatic token refresh
  async getObjectSchemaWithRefresh(userId: string, objectName: string) {
    return this.withTokenRefresh(userId, async (accessToken, instanceUrl) => {
      return this.getObjectSchema(accessToken, instanceUrl, objectName);
    });
  }

  // Original method for backward compatibility
  async getObjectSchema(accessToken: string, instanceUrl: string, objectName: string) {
    // Validate inputs
    validateRequired({ accessToken, instanceUrl, objectName }, ['accessToken', 'instanceUrl', 'objectName']);
    validateSalesforceUrl(instanceUrl);
    validateObjectName(objectName);

    return RetryableOperation.metadata(async () => {
      const response = await axios.get(
        `${instanceUrl}/services/data/v58.0/sobjects/${objectName}/describe`,
        { headers: this.getHeaders(accessToken) }
      );
      
      return {
        name: response.data.name,
        label: response.data.label,
        fields: response.data.fields.map((field: any) => ({
          name: field.name,
          label: field.label,
          type: field.type,
          required: !field.nillable && !field.defaultedOnCreate,
          picklistValues: field.picklistValues || []
        })),
        relationships: response.data.childRelationships || []
      };
    }, 'Schema Retrieval');
  }

  async searchObjects(accessToken: string, instanceUrl: string, searchTerm: string) {
    // Validate inputs
    validateRequired({ accessToken, instanceUrl, searchTerm }, ['accessToken', 'instanceUrl', 'searchTerm']);
    validateSalesforceUrl(instanceUrl);

    return RetryableOperation.query(async () => {
      const response = await axios.get(
        `${instanceUrl}/services/data/v58.0/sobjects`,
        { headers: this.getHeaders(accessToken) }
      );
      
      const filteredObjects = response.data.sobjects.filter((obj: any) => 
        obj.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        obj.label.toLowerCase().includes(searchTerm.toLowerCase())
      );
      
      return {
        searchTerm,
        objects: filteredObjects.map((obj: any) => ({
          name: obj.name,
          label: obj.label,
          type: obj.custom ? 'custom' : 'standard'
        }))
      };
    }, 'Object Search');
  }

  async getAllObjectSchemas(accessToken: string, instanceUrl: string, options: { includeCustom?: boolean, limit?: number } = {}) {
    try {
      // Validate inputs
      validateRequired({ accessToken, instanceUrl }, ['accessToken', 'instanceUrl']);
      validateSalesforceUrl(instanceUrl);

      // Get all objects first
      const response = await axios.get(
        `${instanceUrl}/services/data/v58.0/sobjects`,
        { headers: this.getHeaders(accessToken) }
      );
      
      let objects = response.data.sobjects;
      
      // Filter based on options
      if (options.includeCustom === false) {
        objects = objects.filter((obj: any) => !obj.custom);
      }
      
      // Limit the number of objects to avoid overwhelming the API
      const limit = options.limit || 50;
      objects = objects.slice(0, limit);
      
      const schemas: any[] = [];
      const errors: any[] = [];
      
      // Fetch schema for each object (with basic rate limiting)
      for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        
        try {
          // Add small delay to avoid hitting rate limits too hard
          if (i > 0 && i % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
          
          const schema = await this.getObjectSchema(accessToken, instanceUrl, obj.name);
          schemas.push({
            ...schema,
            isCustom: obj.custom,
            queryable: obj.queryable,
            createable: obj.createable,
            updateable: obj.updateable,
            deletable: obj.deletable
          });
          
        } catch (error: any) {
          errors.push({
            objectName: obj.name,
            error: error.message || 'Failed to fetch schema'
          });
        }
      }
      
      return {
        totalObjects: response.data.sobjects.length,
        processedObjects: objects.length,
        successfulSchemas: schemas.length,
        schemas,
        errors: errors.length > 0 ? errors : undefined
      };
      
    } catch (error: any) {
      throw SalesforceServiceError.fromError(error, 'Bulk Schema Retrieval');
    }
  }

  async runSOSLQuery(accessToken: string, instanceUrl: string, searchTerm: string, objects: string[]) {
    // Validate inputs
    validateRequired({ accessToken, instanceUrl, searchTerm, objects }, ['accessToken', 'instanceUrl', 'searchTerm', 'objects']);
    validateSalesforceUrl(instanceUrl);
    
    if (!Array.isArray(objects) || objects.length === 0) {
      throw new ValidationError('Objects parameter must be a non-empty array');
    }

    return RetryableOperation.query(async () => {
      const objectList = objects.join(',');
      const soslQuery = `FIND {${searchTerm}} IN ALL FIELDS RETURNING ${objectList}`;
      
      const response = await axios.get(
        `${instanceUrl}/services/data/v58.0/search?q=${encodeURIComponent(soslQuery)}`,
        { headers: this.getHeaders(accessToken) }
      );
      
      return {
        searchTerm,
        objects: objects,
        results: response.data.searchRecords || []
      };
    }, 'SOSL Search');
  }

  async getPicklistValues(accessToken: string, instanceUrl: string, objectName: string, fieldName: string) {
    // Validate inputs
    validateRequired({ accessToken, instanceUrl, objectName, fieldName }, ['accessToken', 'instanceUrl', 'objectName', 'fieldName']);
    validateSalesforceUrl(instanceUrl);
    validateObjectName(objectName);
    validateFieldName(fieldName);

    return RetryableOperation.metadata(async () => {
      const response = await axios.get(
        `${instanceUrl}/services/data/v58.0/sobjects/${objectName}/describe`,
        { headers: this.getHeaders(accessToken) }
      );
      
      const field = response.data.fields.find((f: any) => f.name === fieldName);
      if (!field) {
        throw new ValidationError(`Field '${fieldName}' not found on object '${objectName}'`);
      }
      
      return {
        object: objectName,
        field: fieldName,
        values: field.picklistValues || []
      };
    }, 'Picklist Values Retrieval');
  }

  async createRecord(accessToken: string, instanceUrl: string, objectName: string, fields: any) {
    // Validate inputs
    validateRequired({ accessToken, instanceUrl, objectName, fields }, ['accessToken', 'instanceUrl', 'objectName', 'fields']);
    validateSalesforceUrl(instanceUrl);
    validateObjectName(objectName);
    validateRecordData(fields);

    return RetryableOperation.create(async () => {
      const response = await axios.post(
        `${instanceUrl}/services/data/v58.0/sobjects/${objectName}`,
        fields,
        { headers: this.getHeaders(accessToken) }
      );
      
      return {
        id: response.data.id,
        success: response.data.success,
        created: true
      };
    }, 'Record Creation');
  }

  async updateRecord(accessToken: string, instanceUrl: string, objectName: string, recordId: string, fields: any) {
    // Validate inputs
    validateRequired({ accessToken, instanceUrl, objectName, recordId, fields }, ['accessToken', 'instanceUrl', 'objectName', 'recordId', 'fields']);
    validateSalesforceUrl(instanceUrl);
    validateObjectName(objectName);
    validateRecordData(fields);

    return RetryableOperation.update(async () => {
      const response = await axios.patch(
        `${instanceUrl}/services/data/v58.0/sobjects/${objectName}/${recordId}`,
        fields,
        { headers: this.getHeaders(accessToken) }
      );
      
      return {
        id: recordId,
        success: true,
        updated: true
      };
    }, 'Record Update');
  }

  async deleteRecord(accessToken: string, instanceUrl: string, objectName: string, recordId: string) {
    // Validate inputs
    validateRequired({ accessToken, instanceUrl, objectName, recordId }, ['accessToken', 'instanceUrl', 'objectName', 'recordId']);
    validateSalesforceUrl(instanceUrl);
    validateObjectName(objectName);

    return RetryableOperation.delete(async () => {
      await axios.delete(
        `${instanceUrl}/services/data/v58.0/sobjects/${objectName}/${recordId}`,
        { headers: this.getHeaders(accessToken) }
      );
      
      return {
        id: recordId,
        success: true,
        deleted: true
      };
    }, 'Record Deletion');
  }

  async upsertRecord(accessToken: string, instanceUrl: string, objectName: string, externalIdField: string, externalIdValue: string, fields: any) {
    // Validate inputs
    validateRequired({ accessToken, instanceUrl, objectName, externalIdField, externalIdValue, fields }, ['accessToken', 'instanceUrl', 'objectName', 'externalIdField', 'externalIdValue', 'fields']);
    validateSalesforceUrl(instanceUrl);
    validateObjectName(objectName);
    validateFieldName(externalIdField);
    validateRecordData(fields);

    return RetryableOperation.update(async () => {
      const response = await axios.patch(
        `${instanceUrl}/services/data/v58.0/sobjects/${objectName}/${externalIdField}/${externalIdValue}`,
        fields,
        { headers: this.getHeaders(accessToken) }
      );
      
      return {
        id: response.data.id,
        success: true,
        created: response.data.created || false,
        updated: !response.data.created
      };
    }, 'Record Upsert');
  }

  // Batch Processing Operations
  async createBulkJob(accessToken: string, instanceUrl: string, objectName: string, operation: 'insert' | 'update' | 'upsert' | 'delete', externalIdField?: string) {
    // Validate inputs
    validateRequired({ accessToken, instanceUrl, objectName, operation }, ['accessToken', 'instanceUrl', 'objectName', 'operation']);
    validateSalesforceUrl(instanceUrl);
    validateObjectName(objectName);
    
    if (!['insert', 'update', 'upsert', 'delete'].includes(operation)) {
      throw new ValidationError(`Invalid operation: ${operation}. Must be one of: insert, update, upsert, delete`);
    }
    
    if (operation === 'upsert' && !externalIdField) {
      throw new ValidationError('External ID field is required for upsert operations');
    }
    
    if (externalIdField) {
      validateFieldName(externalIdField);
    }

    return RetryableOperation.bulk(async () => {
      const jobData: any = {
        object: objectName,
        operation: operation,
        contentType: 'CSV',
        lineEnding: 'LF'
      };

      if (operation === 'upsert' && externalIdField) {
        jobData.externalIdFieldName = externalIdField;
      }

      const response = await axios.post(
        `${instanceUrl}/services/data/v58.0/jobs/ingest`,
        jobData,
        { headers: this.getHeaders(accessToken) }
      );
      
      return {
        jobId: response.data.id,
        state: response.data.state,
        object: response.data.object,
        operation: response.data.operation,
        createdDate: response.data.createdDate
      };
    }, 'Bulk Job Creation');
  }

  async addBatchToBulkJob(accessToken: string, instanceUrl: string, jobId: string, records: any[]) {
    // Validate inputs
    validateRequired({ accessToken, instanceUrl, jobId, records }, ['accessToken', 'instanceUrl', 'jobId', 'records']);
    validateSalesforceUrl(instanceUrl);
    validateBatchRecords(records);

    return RetryableOperation.bulk(async () => {
      const csvData = this.convertRecordsToCSV(records);
      
      if (!csvData) {
        throw new ValidationError('Failed to convert records to CSV format');
      }
      
      const response = await axios.put(
        `${instanceUrl}/services/data/v58.0/jobs/ingest/${jobId}/batches`,
        csvData,
        { 
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'text/csv; charset=UTF-8',
            'Accept': 'application/json'
          }
        }
      );
      
      return {
        jobId: jobId,
        batchAdded: true,
        recordCount: records.length
      };
    }, 'Batch Upload');
  }

  async closeBulkJob(accessToken: string, instanceUrl: string, jobId: string) {
    // Validate inputs
    validateRequired({ accessToken, instanceUrl, jobId }, ['accessToken', 'instanceUrl', 'jobId']);
    validateSalesforceUrl(instanceUrl);

    return RetryableOperation.bulk(async () => {
      const response = await axios.patch(
        `${instanceUrl}/services/data/v58.0/jobs/ingest/${jobId}`,
        { state: 'UploadComplete' },
        { headers: this.getHeaders(accessToken) }
      );
      
      return {
        jobId: response.data.id,
        state: response.data.state,
        numberBatchesQueued: response.data.numberBatchesQueued,
        numberBatchesInProgress: response.data.numberBatchesInProgress,
        numberBatchesCompleted: response.data.numberBatchesCompleted
      };
    }, 'Bulk Job Closure');
  }

  async getBulkJobStatus(accessToken: string, instanceUrl: string, jobId: string) {
    // Validate inputs
    validateRequired({ accessToken, instanceUrl, jobId }, ['accessToken', 'instanceUrl', 'jobId']);
    validateSalesforceUrl(instanceUrl);

    return RetryableOperation.metadata(async () => {
      const response = await axios.get(
        `${instanceUrl}/services/data/v58.0/jobs/ingest/${jobId}`,
        { headers: this.getHeaders(accessToken) }
      );
      
      return {
        jobId: response.data.id,
        state: response.data.state,
        object: response.data.object,
        operation: response.data.operation,
        createdDate: response.data.createdDate,
        numberBatchesQueued: response.data.numberBatchesQueued || 0,
        numberBatchesInProgress: response.data.numberBatchesInProgress || 0,
        numberBatchesCompleted: response.data.numberBatchesCompleted || 0,
        numberBatchesFailed: response.data.numberBatchesFailed || 0,
        numberRecordsProcessed: response.data.numberRecordsProcessed || 0,
        numberRecordsFailed: response.data.numberRecordsFailed || 0,
        numberRetries: response.data.numberRetries || 0
      };
    }, 'Bulk Job Status Retrieval');
  }

  async getBulkJobResults(accessToken: string, instanceUrl: string, jobId: string) {
    // Validate inputs
    validateRequired({ accessToken, instanceUrl, jobId }, ['accessToken', 'instanceUrl', 'jobId']);
    validateSalesforceUrl(instanceUrl);

    return RetryableOperation.metadata(async () => {
      const response = await axios.get(
        `${instanceUrl}/services/data/v58.0/jobs/ingest/${jobId}/successfulResults`,
        { 
          headers: this.getHeaders(accessToken),
          responseType: 'text'
        }
      );
      
      const failedResponse = await axios.get(
        `${instanceUrl}/services/data/v58.0/jobs/ingest/${jobId}/failedResults`,
        { 
          headers: this.getHeaders(accessToken),
          responseType: 'text'
        }
      );
      
      return {
        jobId: jobId,
        successfulResults: this.parseCSVResults(response.data),
        failedResults: this.parseCSVResults(failedResponse.data)
      };
    }, 'Bulk Job Results Retrieval');
  }

  async executeBulkQuery(accessToken: string, instanceUrl: string, soql: string) {
    // Validate inputs
    validateRequired({ accessToken, instanceUrl, soql }, ['accessToken', 'instanceUrl', 'soql']);
    validateSalesforceUrl(instanceUrl);
    validateSOQL(soql);

    return RetryableOperation.bulk(async () => {
      const jobData = {
        operation: 'query',
        query: soql,
        contentType: 'CSV',
        columnDelimiter: 'COMMA',
        lineEnding: 'LF'
      };

      const response = await axios.post(
        `${instanceUrl}/services/data/v58.0/jobs/query`,
        jobData,
        { headers: this.getHeaders(accessToken) }
      );
      
      return {
        jobId: response.data.id,
        state: response.data.state,
        query: soql,
        createdDate: response.data.createdDate
      };
    }, 'Bulk Query Execution');
  }

  async getBulkQueryResults(accessToken: string, instanceUrl: string, jobId: string) {
    // Validate inputs
    validateRequired({ accessToken, instanceUrl, jobId }, ['accessToken', 'instanceUrl', 'jobId']);
    validateSalesforceUrl(instanceUrl);

    return RetryableOperation.metadata(async () => {
      const response = await axios.get(
        `${instanceUrl}/services/data/v58.0/jobs/query/${jobId}/results`,
        { 
          headers: this.getHeaders(accessToken),
          responseType: 'text'
        }
      );
      
      return {
        jobId: jobId,
        results: this.parseCSVResults(response.data)
      };
    }, 'Bulk Query Results Retrieval');
  }

  // Helper methods for batch processing
  private convertRecordsToCSV(records: any[]): string {
    if (records.length === 0) return '';
    
    const headers = Object.keys(records[0]);
    const csvRows = [headers.join(',')];
    
    for (const record of records) {
      const values = headers.map(header => {
        const value = record[header];
        
        // Handle null, undefined, or empty values
        if (value === null || value === undefined) {
          return '';
        }
        
        const stringValue = String(value);
        
        // Quote and escape if contains comma, quote, newline, or carriage return
        if (stringValue.includes(',') || stringValue.includes('"') || 
            stringValue.includes('\n') || stringValue.includes('\r')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        
        return stringValue;
      });
      csvRows.push(values.join(','));
    }
    
    return csvRows.join('\n');
  }

  private parseCSVResults(csvData: string): any[] {
    if (!csvData.trim()) return [];
    
    const lines = csvData.split('\n').filter(line => line.trim());
    if (lines.length === 0) return [];
    
    const parseCSVLine = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
          if (inQuotes && nextChar === '"') {
            // Escaped quote
            current += '"';
            i++; // Skip next quote
          } else {
            // Toggle quote state
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          // Field separator
          result.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      
      result.push(current);
      return result;
    };
    
    const headers = parseCSVLine(lines[0]).map(h => h.trim());
    const results = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      const record: any = {};
      
      headers.forEach((header, index) => {
        record[header] = values[index]?.trim() || '';
      });
      
      results.push(record);
    }
    
    return results;
  }
}

export const salesforceService = new SalesforceService();
