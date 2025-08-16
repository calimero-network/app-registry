# SSApp Registry

A production-ready SSApp registry with backend API and modern frontend UI. Built with Node.js/Fastify backend and React/TypeScript frontend, featuring OpenAPI 3.0 specification, JCS canonicalization, Ed25519 signature verification, and IPFS integration.

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- Docker (optional)

### Local Development

```bash
# Install dependencies
pnpm install

# Start backend development server
pnpm dev

# Start frontend development server
pnpm dev:frontend

# Start both backend and frontend
pnpm dev:all

# Run tests
pnpm test

# Run linting
pnpm lint

# Check formatting
pnpm format:check
```

### Docker

```bash
# Build image
pnpm docker:build

# Run container
pnpm docker:run

# Or use Docker Compose
pnpm docker:compose
```

## 📦 Docker Images

Docker images are automatically built and published to **GitHub Container Registry**:

```bash
# Pull the latest image
docker pull ghcr.io/calimero-network/app-registry/ssapp-registry-backend:latest

# Run with specific version
docker run -p 8080:8080 ghcr.io/calimero-network/app-registry/ssapp-registry-backend:latest
```

## 🔧 Configuration

### Environment Variables

- `PORT`: Server port (default: 8080)
- `HOST`: Server host (default: 0.0.0.0)
- `NODE_ENV`: Environment (development/production)

### IPFS Gateways

Configured IPFS gateways for artifact storage:

- `https://ipfs.io/ipfs/`
- `https://gateway.pinata.cloud/ipfs/`
- `https://cloudflare-ipfs.com/ipfs/`

## 🛡️ Security Features

- **JCS Canonicalization**: Deterministic JSON serialization
- **Ed25519 Signatures**: Cryptographic verification of manifests
- **SemVer Immutability**: Same (pubkey, name, semver) = same artifact CIDs
- **Automated Security Scanning**: Snyk integration for vulnerability detection

## 📚 API Documentation

- **OpenAPI 3.0**: Full API specification in `api.yml`
- **Interactive Docs**: Available at `/docs` when server is running
- **Health Check**: `/healthz` endpoint for monitoring

## 🏗️ Architecture

### Core Components

- **Fastify Server**: High-performance web framework
- **OpenAPI Integration**: Automatic validation and documentation
- **JCS Library**: JSON Canonicalization Scheme implementation
- **Ed25519 Verification**: Cryptographic signature validation
- **IPFS Integration**: Decentralized artifact storage

### Project Structure

```
packages/
├── backend/              # Fastify API server
│   ├── src/
│   │   ├── server.js     # Main server setup
│   │   ├── config.js     # Configuration management
│   │   ├── lib/verify.js # JCS + Ed25519 verification
│   │   ├── schemas/      # JSON schemas
│   │   └── routes/       # API endpoints
│   ├── tests/            # Test suite
│   └── Dockerfile        # Container configuration
└── frontend/             # React application
    ├── src/
    │   ├── components/   # Reusable UI components
    │   ├── pages/        # Page components
    │   ├── lib/          # API client and utilities
    │   ├── types/        # TypeScript definitions
    │   └── App.tsx       # Main app component
    └── dist/             # Built assets
```

## 🚀 CI/CD Pipeline

### Automated Workflows

- **Tests**: Jest test suite with coverage
- **Linting**: ESLint + Prettier code quality
- **Security**: Snyk vulnerability scanning
- **Docker**: Automated image building and publishing
- **Deployment**: Production deployment on version tags

### Quality Gates

- ✅ All tests must pass
- ✅ No linting errors
- ✅ Code formatting compliance
- ✅ Security scan clean
- ✅ Docker build successful

## 🔍 Monitoring

### Health Endpoints

- `GET /healthz`: Basic health check
- `GET /docs`: API documentation
- `GET /apps`: List available applications

### Logging

- Structured JSON logging
- Request/response tracking
- Error handling with context

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run quality checks: `pnpm quality`
5. Submit a pull request

## 📞 Support

For questions or issues:

- Create an issue on GitHub
- Check the API documentation at `/docs`
- Review the test suite for usage examples
