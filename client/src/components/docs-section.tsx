import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface CodeExampleProps {
  title: string;
  code: string;
  language?: string;
}

function CodeExample({ title, code, language = "json" }: CodeExampleProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">{title}</h4>
        <Button
          variant="ghost"
          size="sm"
          onClick={copyToClipboard}
          className="h-8 w-8 p-0"
          data-testid={`button-copy-${title.toLowerCase().replace(/\s+/g, '-')}`}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        </Button>
      </div>
      <div className="bg-muted p-4 rounded-md font-mono text-sm overflow-x-auto">
        <pre>{code}</pre>
      </div>
    </div>
  );
}

export default function DocsSection() {
  return (
    <div className="max-w-6xl mx-auto" data-testid="docs-section">
      <div className="mb-8">
        <h2 className="text-3xl font-bold mb-2">API Documentation</h2>
        <p className="text-lg text-muted-foreground">
          Complete reference for the Salesforce MCP Assistant API with examples and interactive testing capabilities.
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6" data-testid="docs-tabs">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="overview" data-testid="tab-overview">Overview</TabsTrigger>
          <TabsTrigger value="authentication" data-testid="tab-authentication">Auth</TabsTrigger>
          <TabsTrigger value="query" data-testid="tab-query">Query</TabsTrigger>
          <TabsTrigger value="crud" data-testid="tab-crud">CRUD</TabsTrigger>
          <TabsTrigger value="bulk" data-testid="tab-bulk">Bulk</TabsTrigger>
          <TabsTrigger value="metadata" data-testid="tab-metadata">Metadata</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6" data-testid="content-overview">
          <Card>
            <CardHeader>
              <CardTitle>API Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="text-center p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">16</div>
                  <div className="text-sm text-muted-foreground">Total Endpoints</div>
                </div>
                <div className="text-center p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">REST</div>
                  <div className="text-sm text-muted-foreground">API Architecture</div>
                </div>
                <div className="text-center p-4 bg-purple-50 dark:bg-purple-950 rounded-lg">
                  <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">JSON</div>
                  <div className="text-sm text-muted-foreground">Response Format</div>
                </div>
              </div>
              
              <Separator />
              
              <div>
                <h3 className="text-lg font-semibold mb-3">Base URL</h3>
                <div className="bg-muted p-3 rounded-md font-mono">
                  <span className="text-blue-600 dark:text-blue-400">https://your-domain.replit.app/api/</span>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">Rate Limiting</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>General API:</span>
                      <Badge variant="secondary">100/15min</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Query Operations:</span>
                      <Badge variant="secondary">20/min</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>CRUD Operations:</span>
                      <Badge variant="secondary">30/min</Badge>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Bulk Operations:</span>
                      <Badge variant="destructive">5/5min</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Metadata:</span>
                      <Badge variant="secondary">50/min</Badge>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Error Handling</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <p className="text-muted-foreground">
                  All endpoints return consistent error responses with proper HTTP status codes:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline">200</Badge>
                      <span className="text-sm">Success</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline">400</Badge>
                      <span className="text-sm">Bad Request / Validation</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline">401</Badge>
                      <span className="text-sm">Unauthorized</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline">429</Badge>
                      <span className="text-sm">Rate Limited</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline">500</Badge>
                      <span className="text-sm">Server Error</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Badge variant="outline">503</Badge>
                      <span className="text-sm">Service Unavailable</span>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="authentication" className="space-y-6" data-testid="content-authentication">
          <Card>
            <CardHeader>
              <CardTitle>Authentication</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <p className="text-muted-foreground mb-4">
                  All API endpoints require Salesforce OAuth credentials. Include these in your request body:
                </p>
                <CodeExample
                  title="Required Authentication Parameters"
                  code={`{
  "access_token": "00D000000000000!AQEAQGFud0fakeTokenExample123456789",
  "instance_url": "https://yourinstance.salesforce.com"
}`}
                />
              </div>

              <Separator />

              <div>
                <h3 className="text-lg font-semibold mb-3">How to Get Credentials</h3>
                <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                  <li>Create a Connected App in Salesforce Setup</li>
                  <li>Configure OAuth settings with appropriate scopes</li>
                  <li>Use OAuth 2.0 authorization flow to get access token</li>
                  <li>Extract instance_url from login response</li>
                </ol>
              </div>

              <div>
                <h3 className="text-lg font-semibold mb-3">Required OAuth Scopes</h3>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">api</Badge>
                  <Badge variant="outline">refresh_token</Badge>
                  <Badge variant="outline">web</Badge>
                  <Badge variant="outline">full</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="query" className="space-y-6" data-testid="content-query">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Badge variant="secondary">POST</Badge>
                  <span>/api/runSOQLQuery</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Execute SOQL (Salesforce Object Query Language) queries to retrieve data.
                </p>
                <CodeExample
                  title="Request Body"
                  code={`{
  "access_token": "your_token",
  "instance_url": "https://yourinstance.salesforce.com",
  "soql": "SELECT Id, Name, Email FROM Contact LIMIT 10"
}`}
                />
                <CodeExample
                  title="Response"
                  code={`{
  "totalSize": 2,
  "done": true,
  "records": [
    {
      "attributes": {
        "type": "Contact",
        "url": "/services/data/v58.0/sobjects/Contact/003..."
      },
      "Id": "003000000000001",
      "Name": "John Doe",
      "Email": "john.doe@example.com"
    }
  ]
}`}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Badge variant="secondary">POST</Badge>
                  <span>/api/runSOSLQuery</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Execute SOSL (Salesforce Object Search Language) queries for text search.
                </p>
                <CodeExample
                  title="Request Body"
                  code={`{
  "access_token": "your_token",
  "instance_url": "https://yourinstance.salesforce.com",
  "search_term": "John",
  "objects": ["Contact", "Account"]
}`}
                />
                <CodeExample
                  title="Response"
                  code={`{
  "searchRecords": [
    {
      "attributes": {
        "type": "Contact",
        "url": "/services/data/v58.0/sobjects/Contact/003..."
      },
      "Id": "003000000000001",
      "Name": "John Doe"
    }
  ]
}`}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="crud" className="space-y-6" data-testid="content-crud">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Badge variant="secondary">POST</Badge>
                  <span>/api/createRecord</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <CodeExample
                  title="Request Body"
                  code={`{
  "access_token": "your_token",
  "instance_url": "https://yourinstance.salesforce.com",
  "object_name": "Contact",
  "fields": {
    "FirstName": "Jane",
    "LastName": "Smith",
    "Email": "jane.smith@example.com"
  }
}`}
                />
                <CodeExample
                  title="Response"
                  code={`{
  "id": "003000000000002",
  "success": true,
  "errors": []
}`}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Badge variant="secondary">POST</Badge>
                  <span>/api/updateRecord</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <CodeExample
                  title="Request Body"
                  code={`{
  "access_token": "your_token",
  "instance_url": "https://yourinstance.salesforce.com",
  "object_name": "Contact",
  "record_id": "003000000000002",
  "fields": {
    "Email": "jane.smith.updated@example.com"
  }
}`}
                />
                <CodeExample
                  title="Response"
                  code={`{
  "success": true,
  "id": "003000000000002"
}`}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Badge variant="secondary">POST</Badge>
                  <span>/api/deleteRecord</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <CodeExample
                  title="Request Body"
                  code={`{
  "access_token": "your_token",
  "instance_url": "https://yourinstance.salesforce.com",
  "object_name": "Contact",
  "record_id": "003000000000002"
}`}
                />
                <CodeExample
                  title="Response"
                  code={`{
  "success": true,
  "id": "003000000000002"
}`}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Badge variant="secondary">POST</Badge>
                  <span>/api/upsertRecord</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <CodeExample
                  title="Request Body"
                  code={`{
  "access_token": "your_token",
  "instance_url": "https://yourinstance.salesforce.com",
  "object_name": "Contact",
  "external_id_field": "Email",
  "external_id_value": "jane.doe@example.com",
  "fields": {
    "FirstName": "Jane",
    "LastName": "Doe"
  }
}`}
                />
                <CodeExample
                  title="Response"
                  code={`{
  "success": true,
  "id": "003000000000003",
  "created": true
}`}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="bulk" className="space-y-6" data-testid="content-bulk">
          <Card>
            <CardHeader>
              <CardTitle>Bulk Operations</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground mb-4">
                Bulk operations use Salesforce's Bulk API 2.0 for processing large datasets efficiently.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-3">Bulk Job Management</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <code className="text-green-600">/api/createBulkJob</code>
                      <Badge variant="outline">Create</Badge>
                    </div>
                    <div className="flex justify-between">
                      <code className="text-green-600">/api/addBatchToBulkJob</code>
                      <Badge variant="outline">Add Data</Badge>
                    </div>
                    <div className="flex justify-between">
                      <code className="text-green-600">/api/closeBulkJob</code>
                      <Badge variant="outline">Execute</Badge>
                    </div>
                    <div className="flex justify-between">
                      <code className="text-green-600">/api/getBulkJobStatus</code>
                      <Badge variant="outline">Monitor</Badge>
                    </div>
                    <div className="flex justify-between">
                      <code className="text-green-600">/api/getBulkJobResults</code>
                      <Badge variant="outline">Results</Badge>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold mb-3">Bulk Query</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <code className="text-green-600">/api/executeBulkQuery</code>
                      <Badge variant="outline">Query</Badge>
                    </div>
                    <div className="flex justify-between">
                      <code className="text-green-600">/api/getBulkQueryResults</code>
                      <Badge variant="outline">Results</Badge>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Bulk Query Example</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <CodeExample
                title="Execute Bulk Query"
                code={`{
  "access_token": "your_token",
  "instance_url": "https://yourinstance.salesforce.com",
  "soql": "SELECT Id, Name, Email FROM Contact WHERE CreatedDate = TODAY"
}`}
              />
              <CodeExample
                title="Response"
                code={`{
  "id": "7500000000000001",
  "operation": "query",
  "object": "Contact",
  "createdDate": "2023-01-01T10:00:00.000+0000",
  "state": "JobComplete",
  "concurrencyMode": "Parallel",
  "contentType": "CSV"
}`}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="metadata" className="space-y-6" data-testid="content-metadata">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Badge variant="secondary">POST</Badge>
                  <span>/api/getObjectSchema</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Get detailed metadata about a Salesforce object including fields, relationships, and permissions.
                </p>
                <CodeExample
                  title="Request Body"
                  code={`{
  "access_token": "your_token",
  "instance_url": "https://yourinstance.salesforce.com",
  "object_name": "Contact"
}`}
                />
                <CodeExample
                  title="Response (Excerpt)"
                  code={`{
  "name": "Contact",
  "label": "Contact",
  "fields": [
    {
      "name": "Id",
      "type": "id",
      "label": "Contact ID",
      "length": 18,
      "unique": true,
      "createable": false,
      "updateable": false
    },
    {
      "name": "Email",
      "type": "email",
      "label": "Email",
      "length": 80,
      "createable": true,
      "updateable": true
    }
  ]
}`}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Badge variant="secondary">POST</Badge>
                  <span>/api/getPicklistValues</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Get picklist values for a specific field, useful for forms and data validation.
                </p>
                <CodeExample
                  title="Request Body"
                  code={`{
  "access_token": "your_token",
  "instance_url": "https://yourinstance.salesforce.com",
  "object_name": "Lead",
  "field_name": "Status"
}`}
                />
                <CodeExample
                  title="Response"
                  code={`{
  "values": [
    {
      "label": "Open - Not Contacted",
      "value": "Open - Not Contacted",
      "active": true,
      "defaultValue": false
    },
    {
      "label": "Working - Contacted",
      "value": "Working - Contacted", 
      "active": true,
      "defaultValue": false
    },
    {
      "label": "Closed - Converted",
      "value": "Closed - Converted",
      "active": true,
      "defaultValue": false
    }
  ]
}`}
                />
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
