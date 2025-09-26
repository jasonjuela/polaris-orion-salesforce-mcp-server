# Salesforce MCP Middleware - Chatbot API

## Base URL
```
https://your-app-domain.replit.app
```

## Authentication

**Server-Managed Authentication** - No tokens required from clients!

### API Key Authentication
All chatbot endpoints use API key authentication:

```bash
X-API-Key: mcp-sf-dev-key-123
```

### Server Configuration
Set these environment variables on your server:

```bash
# Choose ONE authentication method:

# Method 1: Username/Password OAuth (Recommended)
SF_OAUTH_CLIENT_ID=your_connected_app_consumer_key
SF_OAUTH_CLIENT_SECRET=your_connected_app_consumer_secret  
SF_USERNAME=your_salesforce_username
SF_PASSWORD=your_password_plus_security_token
SF_LOGIN_URL=https://login.salesforce.com

# Method 2: JWT Bearer Flow (Production)  
# SF_JWT_CLIENT_ID=your_connected_app_consumer_key
# SF_JWT_USERNAME=integration.user@company.com
# SF_JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----..."
# SF_LOGIN_URL=https://login.salesforce.com
```

## API Endpoints

### Execute SOQL Query
```bash
POST /api/chatbot/query
Content-Type: application/json
X-API-Key: mcp-sf-dev-key-123

{
  "query": "SELECT Id, Name FROM Account LIMIT 10"
}
```

### Get Object Metadata
```bash
POST /api/chatbot/describe
Content-Type: application/json
X-API-Key: mcp-sf-dev-key-123

{
  "object_name": "Account"
}
```

### Create Record
```bash
POST /api/chatbot/record
Content-Type: application/json
X-API-Key: mcp-sf-dev-key-123

{
  "object_name": "Contact",
  "data": {
    "FirstName": "John",
    "LastName": "Doe",
    "Email": "john@example.com"
  }
}
```

### Update Record
```bash
PATCH /api/chatbot/record
Content-Type: application/json
X-API-Key: mcp-sf-dev-key-123

{
  "object_name": "Contact",
  "record_id": "003XX0000001234",
  "data": {
    "Email": "newemail@example.com"
  }
}
```

### Search Records (SOSL)
```bash
POST /api/chatbot/search
Content-Type: application/json
X-API-Key: mcp-sf-dev-key-123

{
  "query": "FIND {John} IN ALL FIELDS RETURNING Contact(Id, Name)"
}
```

### Delete Record
```bash
DELETE /api/chatbot/record
Content-Type: application/json
X-API-Key: mcp-sf-dev-key-123

{
  "object_name": "Contact",
  "record_id": "003XX0000001234"
}
```

### Get Picklist Values
```bash
POST /api/chatbot/picklist
Content-Type: application/json
X-API-Key: mcp-sf-dev-key-123

{
  "object_name": "Account",
  "field_name": "Industry"
}
```

### Search Objects
```bash
POST /api/chatbot/searchObjects
Content-Type: application/json
X-API-Key: mcp-sf-dev-key-123

{
  "search_term": "Contact"
}
```

### Get All Object Schemas
```bash
POST /api/chatbot/getAllObjectSchemas
Content-Type: application/json
X-API-Key: mcp-sf-dev-key-123

{
  "include_custom": true,
  "limit": 50
}
```

## Error Responses

All endpoints return errors in this format:
```json
{
  "error": "Error description",
  "details": "Additional details"
}
```

**Common HTTP Status Codes:**
- `401` - Missing or invalid authentication
- `400` - Missing required fields
- `500` - Server or Salesforce API error

## Setup Required

1. Admin must configure OAuth in the web interface
2. Admin must complete Salesforce authorization
3. Middleware automatically handles token refresh

## Example Integration

```javascript
// Simple SOQL query with server-managed authentication
const queryResponse = await fetch('/api/chatbot/query', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'X-API-Key': 'mcp-sf-dev-key-123' // Use your production key
  },
  body: JSON.stringify({
    query: "SELECT Id, Name FROM Account LIMIT 5"
  })
});
const results = await queryResponse.json();

// Create a new record
const createResponse = await fetch('/api/chatbot/record', {
  method: 'POST',
  headers: { 
    'Content-Type': 'application/json',
    'X-API-Key': 'mcp-sf-dev-key-123'
  },
  body: JSON.stringify({
    object_name: 'Contact',
    data: {
      FirstName: 'Jane',
      LastName: 'Smith',
      Email: 'jane.smith@example.com'
    }
  })
});
const newRecord = await createResponse.json();
```