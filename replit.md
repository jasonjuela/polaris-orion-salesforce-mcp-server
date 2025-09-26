# Salesforce MCP Assistant

## Overview

This is a full-stack web application that serves as a Salesforce API testing interface and MCP (Model Context Protocol) Assistant. The application provides a comprehensive dashboard for interacting with Salesforce APIs, including SOQL queries, object schema retrieval, CRUD operations, and metadata exploration. Built with a modern React frontend and Express.js backend, it offers a user-friendly interface for developers and administrators to test and explore Salesforce functionality.

## User Preferences

Preferred communication style: Simple, everyday language.

## Server-Managed Authentication Setup

### Overview
The application uses **server-managed authentication** with two access methods:
- **Session-based authentication** for web UI access (login/logout)
- **API key authentication** for MCP client access (programmatic)

### Production Deployment Requirements

**Required Environment Variables**:
```bash
# Session Security
SESSION_SECRET=your-secure-session-secret

# Salesforce Authentication (Username/Password OAuth)
SF_OAUTH_CLIENT_ID=your-salesforce-consumer-key
SF_OAUTH_CLIENT_SECRET=your-salesforce-consumer-secret
SF_USERNAME=your-salesforce-username
SF_PASSWORD=your-salesforce-password-and-security-token

# API Key Protection (Production)
MCP_API_KEYS={"your-production-key": {"name": "Production Client", "clientId": "prod", "active": true}}
```

### Quick Setup Guide

**Step 1: Salesforce Credentials**
- Use your existing Salesforce org credentials
- Append security token to password: `password123securitytoken456`
- No Connected App setup required (uses Username/Password OAuth)

**Step 2: Set Environment Variables**
- Add the required variables above to your Replit Secrets
- Development uses default keys, production requires proper `MCP_API_KEYS`

**Step 3: Ready to Use**
- Web UI: Login with any username/password (development) 
- MCP Clients: Use API key authentication header

### MCP Client Integration

**API Authentication**: Use `X-API-Key` header for all `/api/chatbot/*` endpoints:

```bash
# Example SOQL query
curl -X POST https://your-app.replit.app/api/chatbot/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"query": "SELECT Id, Name FROM Account LIMIT 5"}'
```

**Available MCP Endpoints**:
- `/api/chatbot/query` - SOQL queries
- `/api/chatbot/search` - SOSL searches  
- `/api/chatbot/record` - CRUD operations (POST/PATCH/DELETE)
- `/api/chatbot/describe` - Object metadata
- `/api/chatbot/picklist` - Picklist values
- `/api/chatbot/searchObjects` - Object discovery
- `/api/chatbot/getAllObjectSchemas` - Bulk schema retrieval

### Security Features

- **State Parameter Validation**: Prevents OAuth CSRF attacks
- **Encrypted Token Storage**: Client secrets and refresh tokens encrypted at rest
- **Domain Validation**: Prevents SSRF attacks through instance URL validation
- **CSRF Protection**: Web UI protected against cross-site request forgery
- **Session Isolation**: OAuth and web sessions properly separated
- **Automatic Token Refresh**: Tokens refreshed automatically before expiry

## Current Status (September 2025)

### ✅ Fully Working Features
- **Data Query Tab**: SOQL queries, SOSL searches, object discovery (81+ objects)
- **CRUD Operations Tab**: Create, Read, Update, Delete records with proper error handling
- **Metadata Tab**: Object schemas (200+ fields), picklist values, bulk schema retrieval  
- **Authentication**: Server-managed Salesforce connection with automatic token refresh
- **MCP Integration**: Complete chatbot-ready API with `/api/chatbot/*` endpoints
- **Security**: Production-grade authentication, validation, rate limiting, and monitoring

### 📝 Application State
- **Frontend**: All tabs functional with real Salesforce data integration
- **Backend**: Robust API layer with comprehensive error handling and logging  
- **Database**: PostgreSQL with Drizzle ORM for session and configuration storage
- **Ready for Production**: Security audit complete, all major functionality verified

### 🚀 Deployment Ready
The application is fully tested and production-ready for deployment on Replit with:
- Comprehensive security measures (CSRF, rate limiting, input validation)
- Automatic scaling and health monitoring  
- Private deployment compatible (API access works regardless)
- Team collaboration support for development

### Troubleshooting

**Authentication Issues**:
1. **Salesforce Login**: Verify username/password and security token are correct
2. **API Access**: Ensure MCP clients use proper `X-API-Key` header format  
3. **Token Refresh**: Monitor logs for automatic token refresh status
4. **Rate Limits**: Check endpoint-specific rate limiting if requests fail

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Build Tool**: Vite for fast development and optimized production builds
- **UI Components**: Shadcn/ui component library with Radix UI primitives
- **Styling**: Tailwind CSS with custom dark theme configuration
- **State Management**: TanStack React Query for server state management
- **Routing**: Wouter for lightweight client-side routing
- **Form Handling**: React Hook Form with Zod validation

### Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript with ES modules
- **API Pattern**: RESTful API with dedicated Salesforce service layer
- **Error Handling**: Centralized error middleware with proper HTTP status codes
- **Request Processing**: JSON body parsing with CORS support
- **Development**: Hot reload with Vite integration in development mode

### Data Storage Solutions
- **Database**: PostgreSQL configured through Drizzle ORM
- **Schema Management**: Drizzle Kit for migrations and schema definition
- **Connection**: Neon Database serverless connection
- **Memory Storage**: In-memory storage implementation for development/testing
- **Session Management**: Connect-pg-simple for PostgreSQL session storage

### Authentication and Authorization
- **Server-Managed Authentication**: Simplified Username/Password OAuth for automatic token handling
- **Dual Access Control**: Session-based authentication for web UI, API key authentication for MCP clients  
- **API Key Protection**: Secure endpoints with API key validation and request logging
- **Session Handling**: Express session middleware with PostgreSQL backing and secure cookies
- **Enterprise Security**: CSRF protection, rate limiting, input validation, and SSRF prevention
- **Production Ready**: Comprehensive security headers, Helmet.js, and encrypted secrets

### External Dependencies

#### Core Framework Dependencies
- **@neondatabase/serverless**: Serverless PostgreSQL database connection
- **drizzle-orm**: Type-safe SQL query builder and ORM
- **axios**: HTTP client for external API requests
- **express**: Web application framework for Node.js

#### UI and Styling Dependencies
- **@radix-ui/***: Comprehensive set of accessible UI primitives
- **tailwindcss**: Utility-first CSS framework
- **class-variance-authority**: Utility for managing CSS class variants
- **lucide-react**: Icon library for React components

#### Development and Build Tools
- **vite**: Fast build tool and development server
- **typescript**: Type checking and compilation
- **esbuild**: Fast JavaScript bundler for production builds
- **tsx**: TypeScript execution environment for development

#### Third-Party Services
- **Salesforce REST API v58.0**: Primary integration for CRM data operations
- **Neon Database**: Managed PostgreSQL hosting service
- **Replit Integration**: Development environment plugins and runtime error handling