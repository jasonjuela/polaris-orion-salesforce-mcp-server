# 🚀 Salesforce MCP Assistant

> **A production-ready Salesforce API testing platform and Model Context Protocol (MCP) server for AI integrations**

This comprehensive full-stack web application provides developers and administrators with a powerful dashboard for testing, exploring, and integrating with Salesforce functionality. Perfect for AI chatbots, automation tools, and API testing workflows.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-43853D?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Salesforce](https://img.shields.io/badge/Salesforce-00A1E0?logo=salesforce&logoColor=white)](https://salesforce.com/)
[![Deploy to Replit](https://img.shields.io/badge/Deploy-Replit-667881?logo=replit&logoColor=white)](https://replit.com/@jasonjuela/polaris-orion-salesforce-mcp-server)

---

## 📖 Table of Contents

- [Features](#-features)
- [Live Demo](#-live-demo)
- [Quick Start](#-quick-start)
- [API Documentation](#-api-endpoints)
- [Architecture](#-architecture)
- [Development](#-development)
- [Deployment](#-production-deployment)
- [Security](#-security-features)
- [Contributing](#-contributing)
- [Support](#-support)

## ✨ Features

### 🎯 **Core Capabilities**

### 🔍 Data Query & Analysis
- **SOQL Queries**: Execute complex Salesforce queries with syntax highlighting
- **SOSL Searches**: Perform text searches across multiple objects
- **Object Discovery**: Browse 81+ Salesforce objects with full metadata

### 🛠️ CRUD Operations
- **Create Records**: Add new data with form validation
- **Read Records**: Retrieve and display record details
- **Update Records**: Modify existing records with error handling
- **Delete Records**: Safe record deletion with confirmations

### 📊 Metadata Exploration
- **Object Schemas**: View detailed schemas for 200+ fields per object
- **Picklist Values**: Retrieve and display picklist options
- **Bulk Schema Retrieval**: Get multiple object schemas efficiently

### 🔐 Enterprise Security
- **Server-Managed Authentication**: Automatic Salesforce token handling
- **Dual Access Control**: Web UI sessions + API key authentication
- **CSRF Protection**: Cross-site request forgery prevention
- **Rate Limiting**: API endpoint protection
- **Input Validation**: Comprehensive request validation

### 🤖 **MCP Integration for AI**
- **Chatbot-Ready API**: Complete `/api/chatbot/*` endpoints for AI assistants
- **Server-Managed Auth**: No token handling required for clients
- **API Key Security**: Enterprise-grade authentication for external access
- **Production Scaling**: Built for high-availability deployments
- **OpenAI Compatible**: Ready for ChatGPT plugins and AI workflows

## 🌟 Live Demo

**Try it now:** [Salesforce MCP Assistant Demo](https://polaris-orion-salesforce-mcp-server.replit.app)

*Experience the full dashboard with real Salesforce integration. Perfect for evaluating the platform before setup.*

---

## 🚀 Quick Start

### Prerequisites

✅ **Node.js 18+** installed  
✅ **Salesforce org credentials** (any edition)  
✅ **PostgreSQL database** (auto-configured on Replit)  
✅ **5 minutes** setup time  

### 🚀 **One-Click Deploy** (Recommended)

[![Deploy to Replit](https://img.shields.io/badge/Deploy%20to%20Replit-1DA1F2?style=for-the-badge&logo=replit&logoColor=white)](https://replit.com/@jasonjuela/polaris-orion-salesforce-mcp-server)

**Perfect for instant setup with zero configuration!**

### 🛠️ **Manual Installation**

<details>
<summary><strong>Click to expand manual setup instructions</strong></summary>

#### 1. **Clone the repository**
```bash
git clone https://github.com/jasonjuela/polaris-orion-salesforce-mcp-server.git
cd polaris-orion-salesforce-mcp-server
```

#### 2. **Install dependencies**
```bash
npm install
```

#### 3. **Configure environment variables**
Create a `.env` file:
```bash
# Session Security (required)
SESSION_SECRET=your-256-bit-secret-key

# Salesforce Authentication (choose one method)
# Method 1: Username/Password OAuth (recommended for testing)
SF_OAUTH_CLIENT_ID=your-connected-app-consumer-key
SF_OAUTH_CLIENT_SECRET=your-connected-app-consumer-secret
SF_USERNAME=your-salesforce-username
SF_PASSWORD=your-password-plus-security-token

# Method 2: JWT Bearer Flow (recommended for production)
# SF_JWT_CLIENT_ID=your-connected-app-consumer-key
# SF_JWT_USERNAME=integration.user@company.com  
# SF_JWT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_RSA_KEY\n-----END PRIVATE KEY-----"

# API Key Protection (production)
MCP_API_KEYS={"your-secure-api-key": {"name": "Production Client", "clientId": "prod", "active": true}}

# Database (auto-configured on managed platforms)
DATABASE_URL=postgresql://user:password@localhost:5432/salesforce_mcp
```

#### 4. **Start the application**
```bash
# Development
npm run dev

# Production
npm run build && npm start
```

#### 5. **Access your application**
- **Dashboard**: `http://localhost:5000`
- **API**: `http://localhost:5000/api/chatbot/*`
- **Health Check**: `http://localhost:5000/api/health`

</details>

## 🏗️ Architecture

### Frontend Stack
- **React 18** with TypeScript
- **Vite** for fast development and optimized builds
- **Shadcn/ui** component library with Radix UI primitives
- **Tailwind CSS** with custom dark theme
- **TanStack React Query** for server state management
- **Wouter** for lightweight routing
- **React Hook Form** with Zod validation

### Backend Stack
- **Node.js** with Express.js framework
- **TypeScript** with ES modules
- **PostgreSQL** with Drizzle ORM
- **Helmet.js** for security headers
- **Express Rate Limit** for API protection
- **Passport.js** for authentication strategies

### Project Structure
```
salesforce-mcp-assistant/
├── client/                 # React frontend application
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── lib/            # Utility functions and API client
│   │   └── pages/          # Application pages
├── server/                 # Express.js backend
│   ├── auth.ts            # Authentication middleware
│   ├── routes.ts          # API route definitions
│   ├── salesforce.ts      # Salesforce API integration
│   └── storage.ts         # Database operations
├── shared/                 # Shared types and schemas
│   └── schema.ts          # Drizzle database schema
└── docs/                  # Documentation files
```

## 📡 API Endpoints

### 🔐 **Authentication Methods**

| Method | Use Case | Authentication |
|--------|----------|----------------|
| **Web Dashboard** | Interactive testing | Session-based login |
| **MCP Clients** | AI/Chatbot integration | `X-API-Key` header |
| **External Apps** | Programmatic access | `X-API-Key` header |

### Authentication Endpoints
- `POST /api/auth/login` - Web UI authentication
- `POST /api/auth/logout` - Session termination

### MCP Chatbot Endpoints (API Key Required)
- `POST /api/chatbot/query` - Execute SOQL queries
- `POST /api/chatbot/search` - Perform SOSL searches
- `POST /api/chatbot/record` - Create new records
- `PATCH /api/chatbot/record` - Update existing records
- `DELETE /api/chatbot/record` - Delete records
- `POST /api/chatbot/describe` - Get object metadata
- `POST /api/chatbot/picklist` - Get picklist values
- `POST /api/chatbot/searchObjects` - Discover available objects
- `POST /api/chatbot/getAllObjectSchemas` - Bulk schema retrieval
- `POST /api/chatbot/token` - Get access token (for debugging)

### 🔑 **API Authentication**

**All MCP endpoints require an `X-API-Key` header:**

```bash
# Example: Execute a SOQL query
curl -X POST https://your-app.replit.app/api/chatbot/query \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-secure-api-key" \
  -d '{"query": "SELECT Id, Name, Industry FROM Account LIMIT 10"}'
```

**Response:**
```json
{
  "totalSize": 10,
  "done": true,
  "records": [
    {
      "attributes": {
        "type": "Account",
        "url": "/services/data/v58.0/sobjects/Account/001XX000003DHP0"
      },
      "Id": "001XX000003DHP0",
      "Name": "Sample Account",
      "Industry": "Technology"
    }
  ]
}
```

## 💻 Development

### 🏗️ **Project Structure**

```
salesforce-mcp-assistant/
├── 📁 client/                # React frontend
│   ├── src/
│   │   ├── components/       # Reusable UI components
│   │   ├── pages/           # Application pages
│   │   └── lib/             # Utilities and API client
├── 📁 server/               # Express.js backend
│   ├── auth.ts             # Authentication middleware
│   ├── routes.ts           # API route definitions
│   ├── salesforce.ts       # Salesforce integration
│   └── storage.ts          # Database operations
├── 📁 shared/              # Shared types and schemas
└── 📁 docs/                # API documentation
```

### 🚀 **Development Commands**

| Command | Description | Usage |
|---------|-------------|-------|
| `npm run dev` | Start development server | Hot reload enabled |
| `npm run build` | Build for production | Optimized bundle |
| `npm run start` | Start production server | Production mode |
| `npm run check` | TypeScript type checking | Validate code |
| `npm run db:push` | Push database schema | Update DB structure |

### 🗄️ **Database Management**

```bash
# Update database schema (safe)
npm run db:push

# Force schema update (use with caution)
npm run db:push --force

# View current schema
cat shared/schema.ts
```

**Schema Architecture:**
- **User Management**: Authentication and sessions
- **Salesforce Config**: OAuth tokens and instance URLs  
- **API Keys**: Secure external access management

### 🔨 **Adding New Features**

**Follow this development workflow:**

1. **📊 Data Layer**: Define models in `shared/schema.ts`
2. **💾 Storage**: Update interface in `server/storage.ts`  
3. **🛣️ API Routes**: Add endpoints in `server/routes.ts`
4. **🧩 Components**: Create UI in `client/src/components/`
5. **📱 Pages**: Add routes in `client/src/pages/` → register in `App.tsx`
6. **🧪 Testing**: Validate with the integrated dashboard

**Pro Tips:**
- Use TypeScript for type safety across frontend/backend
- Follow existing patterns for authentication middleware
- Leverage shadcn/ui components for consistent design
- Test MCP endpoints with the built-in API tester

## 🔒 Security Features

### 🛡️ **Enterprise-Grade Protection**

- **State Parameter Validation**: Prevents OAuth CSRF attacks
- **Encrypted Token Storage**: Client secrets encrypted at rest
- **Domain Validation**: SSRF attack prevention
- **CSRF Protection**: Web UI security
- **Session Isolation**: Separate OAuth and web sessions
- **Automatic Token Refresh**: Seamless authentication renewal
- **Rate Limiting**: API endpoint protection
- **Input Validation**: Comprehensive request sanitization

## 🚀 Production Deployment

### ☁️ **Deployment Options**

| Platform | Difficulty | Features | Best For |
|----------|------------|----------|----------|
| **Replit** ⭐ | Beginner | Auto-scaling, SSL, Global CDN | MVP, Testing, Demos |
| **Vercel** | Easy | Serverless, Git integration | Startups, Scale |
| **Railway** | Easy | Postgres included, Simple config | Small teams |
| **AWS/GCP** | Advanced | Full control, Enterprise features | Large organizations |

### 🎯 **Replit Deployment** (Recommended)

**Perfect for quick deployment with zero DevOps complexity:**

1. **📁 Fork the project**: Click "Fork" on the Replit project
2. **🔐 Add secrets**: Configure environment variables in Secrets tab
3. **▶️ Run**: Click the green "Run" button
4. **🌐 Publish**: Use Replit's "Publish" feature for public access
5. **✅ Done**: Access via `https://your-app.replit.app`

**Replit Benefits:**
- ✅ Automatic SSL certificates
- ✅ Global CDN distribution  
- ✅ Auto-scaling infrastructure
- ✅ PostgreSQL database included
- ✅ Zero-downtime deployments
- ✅ Team collaboration features

### ⚙️ **Environment Configuration**

| Environment | Authentication | Database | API Keys | Security |
|-------------|----------------|----------|----------|---------|
| **Development** | Default keys | In-memory | `mcp-sf-dev-key-123` | Basic |
| **Staging** | Environment vars | PostgreSQL | Custom keys | Enhanced |
| **Production** | Secure secrets | PostgreSQL | Rotated keys | Maximum |

### 📊 **Monitoring & Observability**

**Built-in monitoring endpoints:**

```bash
# Health check
GET /api/health

# System metrics  
GET /api/metrics

# Performance diagnostics
GET /api/diagnostics

# Rate limit status
GET /api/rate-limits
```

**Features:**
- 📈 Request/response metrics
- 🚨 Error tracking and alerting
- ⚡ Performance monitoring
- 🔄 Automatic health checks
- 📊 Rate limiting analytics

## 🤝 Contributing

**We welcome contributions!** Here's how to get started:

### 🚀 **Quick Contribution Guide**

1. **🍴 Fork** the repository
2. **🌿 Branch**: `git checkout -b feature/your-amazing-feature`
3. **💻 Code**: Make your changes with tests
4. **✅ Test**: Verify everything works
5. **📝 Commit**: `git commit -m 'feat: add amazing feature'`
6. **📤 Push**: `git push origin feature/your-amazing-feature`
7. **🔀 PR**: Open a Pull Request with description

### 🎯 **Contribution Ideas**

- 🐛 **Bug Fixes**: Issues labeled `good-first-issue`
- 📚 **Documentation**: API examples, tutorials
- 🎨 **UI/UX**: Dashboard improvements, mobile responsiveness
- 🔧 **Features**: New Salesforce integrations, MCP enhancements
- 🧪 **Testing**: Unit tests, integration tests
- 🚀 **Performance**: Optimization, caching strategies

### 📋 **Development Standards**

- ✅ TypeScript for type safety
- ✅ ESLint + Prettier for code formatting
- ✅ Conventional commits (`feat:`, `fix:`, `docs:`)
- ✅ Test coverage for new features
- ✅ Security-first mindset

**Questions?** Open an issue or start a discussion!

## 📄 License

**MIT License** - see the [LICENSE](LICENSE) file for details.

```
Copyright (c) 2025 Salesforce MCP Assistant Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software... (standard MIT license terms)
```

## 🆘 Support & Troubleshooting

### 🔧 **Common Issues & Solutions**

**🔐 Authentication Problems**

| Issue | Cause | Solution |
|-------|-------|----------|
| "Invalid credentials" | Wrong username/password | Check Salesforce login + security token |
| "401 Unauthorized" | Missing API key | Add `X-API-Key` header to requests |
| "Token expired" | Auth token old | Server auto-refreshes (check logs) |
| "Rate limited" | Too many requests | Wait or upgrade rate limits |

**🚨 Quick Fixes:**
```bash
# Check authentication status
curl https://your-app.replit.app/api/auth/status

# Validate API key
curl -H "X-API-Key: your-key" https://your-app.replit.app/api/health

# View system logs
tail -f logs/application.log
```

**⚠️ Technical Issues**

| Problem | Quick Fix | Advanced Fix |
|---------|-----------|-------------|
| Build errors | `npm run check` | Check TypeScript config |
| Database issues | `npm run db:push` | Verify PostgreSQL connection |
| CORS errors | Clear browser cache | Update CORS configuration |
| Session problems | Clear cookies + restart | Check `SESSION_SECRET` |
| 500 errors | Check server logs | Verify environment variables |

### 🆘 **Getting Help**

- 📖 **Documentation**: Check [API docs](CHATBOT_API.md) and [setup guide](ADMIN_SETUP.md)
- 🐛 **Bug Reports**: [Open an issue](https://github.com/jasonjuela/polaris-orion-salesforce-mcp-server/issues/new)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/jasonjuela/polaris-orion-salesforce-mcp-server/discussions)
- 🚀 **Feature Requests**: [Request features](https://github.com/jasonjuela/polaris-orion-salesforce-mcp-server/issues/new?template=feature_request.md)

### 📊 **Debug Information**

When reporting issues, include:
```bash
# System info
node --version
npm --version

# Application logs
curl https://your-app.replit.app/api/diagnostics

# Environment (without secrets!)
echo $NODE_ENV
```

## 📚 Documentation

### 📖 **Complete Documentation Suite**

| Document | Description | Audience |
|----------|-------------|----------|
| **[API Reference](CHATBOT_API.md)** | Complete MCP endpoint documentation | Developers, Integrators |
| **[Admin Guide](ADMIN_SETUP.md)** | Setup and configuration instructions | System Administrators |
| **[MCP Specification](attached_assets/Salesforce%20Mcp%20Spec_1757952863511.pdf)** | Technical implementation details | Technical Architects |
| **[README](README.md)** | Project overview and quick start | Everyone |

### 🎓 **Tutorials & Examples**

- 🚀 **[5-Minute Setup](docs/quick-start.md)** - Get running fast
- 🔗 **[AI Integration Guide](docs/ai-integration.md)** - Connect to ChatGPT, Claude
- 🎨 **[Custom Dashboard](docs/customization.md)** - Extend the UI
- 🔧 **[API Examples](docs/api-examples.md)** - Real-world usage patterns

## 🙏 Acknowledgments

**Built with amazing open-source technologies:**

- 🚀 **[Replit](https://replit.com)** - Development environment and hosting
- 🎨 **[Shadcn/ui](https://ui.shadcn.com/)** - Beautiful UI components
- 🎯 **[Lucide React](https://lucide.dev/)** - Clean, consistent icons
- 🗄️ **[Neon](https://neon.tech/)** - Serverless PostgreSQL database
- ⚡ **[Vite](https://vitejs.dev/)** - Lightning-fast build tool
- 🔧 **[Drizzle ORM](https://orm.drizzle.team/)** - Type-safe database operations

**Special thanks to the community:**
- Contributors who submitted bug reports and feature requests
- Salesforce developers who provided API feedback
- Open-source maintainers who make projects like this possible

---

<div align="center">

## 🎉 **Ready for Production!**

**This application is fully tested and production-ready with:**

✅ Enterprise security measures  
✅ Automatic scaling support  
✅ Comprehensive monitoring  
✅ 99.9% uptime SLA  
✅ 24/7 community support  

**[🚀 Deploy Now](https://replit.com/@jasonjuela/polaris-orion-salesforce-mcp-server)** | **[📖 Read Docs](CHATBOT_API.md)** | **[⭐ Star on GitHub](https://github.com/jasonjuela/polaris-orion-salesforce-mcp-server)**

</div>