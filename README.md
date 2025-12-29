# SSApp Registry Monorepo

[![CI](https://github.com/calimero-network/app-registry/workflows/CI/badge.svg)](https://github.com/calimero-network/app-registry/actions/workflows/basic-ci.yml)
[![Lint](https://img.shields.io/badge/Lint-ESLint-blue.svg)](https://eslint.org/)
[![Test](https://img.shields.io/badge/Test-Jest%20%7C%20Vitest-green.svg)](https://jestjs.io/)
[![Coverage](https://img.shields.io/badge/Coverage-Enabled-brightgreen.svg)](https://github.com/calimero-network/app-registry/actions/workflows/basic-ci.yml)
[![OpenAPI](https://img.shields.io/badge/OpenAPI-3.0-brightgreen.svg)](https://github.com/calimero-network/app-registry/blob/main/api.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![pnpm](https://img.shields.io/badge/pnpm-workspace-orange.svg)](https://pnpm.io/workspaces)

A comprehensive monorepo for the SSApp (Self Sovereign Application) Registry system, featuring a backend API, frontend web application, client library, and CLI tool.

## 🏗️ Monorepo Structure

```
registry/
├── packages/
│   ├── backend/          # Fastify-based API server
│   ├── frontend/         # React + TypeScript web app
│   ├── client-library/   # TypeScript client library
│   └── cli/             # Command-line interface tool
├── scripts/             # Build and utility scripts
├── .github/             # GitHub Actions workflows
└── docs/               # Documentation
```

## 🚀 V1 API - Production Ready!

The registry now features a **complete V1 API** with advanced dependency resolution, security controls, and comprehensive validation:

### **✅ Core Features:**

- **📋 Manifest Management** - Submit, retrieve, and validate V1 manifests
- **🔍 Advanced Search** - Search by app ID, name, interfaces, and dependencies
- **🔗 Dependency Resolution** - Automatic dependency resolution with cycle detection
- **🔐 Security Controls** - Rate limiting, size limits, and depth protection
- **✍️ Signature Verification** - Ed25519 signature validation with JCS canonicalization
- **📦 Artifact Validation** - SHA256 digest verification and URI validation

### **✅ CLI Commands:**

```bash
# V1 API Commands
calimero-registry v1 push manifest.json --local    # Submit manifest
calimero-registry v1 get app-id --local           # Get app versions
calimero-registry v1 get app-id version --local   # Get specific manifest
calimero-registry v1 ls --search query --local     # Search applications
calimero-registry v1 resolve app-id version --local # Resolve dependencies
calimero-registry v1 verify manifest.json         # Verify manifest locally
```

### **✅ API Endpoints:**

```bash
# V1 API Endpoints
POST   /v1/apps                    # Submit manifest
GET    /v1/apps/:id                # Get app versions
GET    /v1/apps/:id/:version       # Get specific manifest
GET    /v1/search?q=query          # Search applications
POST   /v1/resolve                 # Resolve dependencies
```

## 🏠 Local Development Registry

The CLI now includes a complete **local registry** for development purposes, allowing you to test app submissions and manage applications without requiring a remote server or IPFS.

### Key Features

- **🔄 Offline Development**: Work without internet connection
- **📁 File-Based Storage**: JSON files instead of database
- **🔧 Local Artifacts**: HTTP serving instead of IPFS
- **⚡ Fast Iteration**: No network delays
- **🛡️ Data Isolation**: Safe development environment

### Quick Local Development

```bash
# Start local registry
calimero-registry local start

# Use with existing commands
calimero-registry apps list --local
calimero-registry apps submit manifest.json --local
calimero-registry health --local

# Stop local registry
calimero-registry local stop
```

For detailed local registry documentation, see [packages/cli/LOCAL_REGISTRY.md](./packages/cli/LOCAL_REGISTRY.md).

## 🚀 Quick Start

### Prerequisites

- **Node.js** 18+
- **pnpm** 8+ (recommended package manager)
- **Git**

### Installation

```bash
# Clone the repository
git clone https://github.com/calimero-network/app-registry.git
cd app-registry

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Start development servers
pnpm dev:all
```

## 📦 Packages

| Package                                     | Description                   | Tech Stack               | Status              |
| ------------------------------------------- | ----------------------------- | ------------------------ | ------------------- |
| [Backend](./packages/backend)               | API server for SSApp registry | Fastify, Node.js         | ✅ Production Ready |
| [Frontend](./packages/frontend)             | Web interface for registry    | React, TypeScript, Vite  | ✅ Production Ready |
| [Client Library](./packages/client-library) | TypeScript client for API     | TypeScript, Axios        | ✅ Production Ready |
| [CLI](./packages/cli)                       | Command-line interface        | TypeScript, Commander.js | ✅ Production Ready |

## 📚 Documentation

- **[Contributing](CONTRIBUTING.md)** - Development guidelines and contribution process
- **[Security](SECURITY.md)** - Security policy and vulnerability reporting
- **[Support](SUPPORT.md)** - Getting help and troubleshooting
- **[Code of Conduct](CODE_OF_CONDUCT.md)** - Community guidelines
- **[License](LICENSE.md)** - MIT License

## 🛠️ Development Workflow

### Available Scripts

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests across all packages
pnpm test

# Run linting across all packages
pnpm lint

# Format code with Prettier
pnpm format

# Check code quality (lint + test + format)
pnpm quality

# Fix code quality issues
pnpm quality:fix

# Start development servers
pnpm dev:all

# Start specific package in dev mode
pnpm --filter backend dev
pnpm --filter frontend dev
```

### Package-Specific Commands

```bash
# Backend
pnpm --filter backend start
pnpm --filter backend test
pnpm --filter backend lint

# Frontend
pnpm --filter frontend dev
pnpm --filter frontend build
pnpm --filter frontend test

# Client Library
pnpm --filter client-library build
pnpm --filter client-library test

# CLI
pnpm --filter cli build
pnpm --filter cli test
```

## 🧪 Testing

### Test Coverage

- **Backend**: Jest for unit and integration tests
- **Frontend**: Vitest + React Testing Library
- **Client Library**: Vitest for unit tests
- **CLI**: Vitest for unit tests

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests with coverage
pnpm test:coverage

# Run tests in watch mode
pnpm test:watch

# Run tests for specific package
pnpm --filter backend test
pnpm --filter frontend test
```

## 🔍 Code Quality

### Quality Standards

- **ESLint**: Code linting with TypeScript support
- **Prettier**: Code formatting
- **Husky**: Git hooks for pre-commit validation
- **lint-staged**: Run linters on staged files only

### Quality Commands

```bash
# Check code quality
pnpm quality

# Fix quality issues
pnpm quality:fix

# Format code
pnpm format

# Lint code
pnpm lint

# Lint with auto-fix
pnpm lint:fix
```

### Pre-commit Hooks

The repository uses Husky to ensure code quality:

- **Pre-commit**: Runs linting and formatting on staged files
- **Pre-push**: Runs tests to ensure nothing is broken

## 🚀 CI/CD Pipeline

### GitHub Actions Workflows

| Workflow             | Trigger                   | Purpose                                   |
| -------------------- | ------------------------- | ----------------------------------------- |
| **CI/CD Pipeline**   | Push to main/develop, PRs | Build, test, security scan, Docker images |
| **Semantic Release** | Push to main              | Automated versioning and releases         |
| **Basic CI**         | Push to main/develop, PRs | CI without external secrets               |

### Automated Features

- ✅ **Automated Testing**: All packages tested on every push
- ✅ **Security Scanning**: Snyk vulnerability scanning
- ✅ **Docker Builds**: Automated Docker image creation
- ✅ **Semantic Versioning**: Automated releases based on conventional commits
- ✅ **Package Publishing**: CLI and client library published to npm

### Release Strategy

- **Independent Versioning**: Each package has its own version
- **Automated Detection**: Only packages with changes get new versions
- **Conventional Commits**: Automatic release type detection
- **Dry-Run Mode**: Safe testing without actual releases

## 📚 Documentation

### Core Documentation

- [**API Specification**](./api.yml) - OpenAPI 3.0 specification
  All development guidelines, versioning strategy, commit conventions, and release automation details are now consolidated in the [**Contributing Guide**](CONTRIBUTING.md).

### Package Documentation

- [**Backend**](./packages/backend/README.md) - API server documentation
- [**Frontend**](./packages/frontend/README.md) - Web application documentation
- [**Client Library**](./packages/client-library/README.md) - TypeScript client docs
- [**CLI**](./packages/cli/README.md) - Command-line tool documentation

## 🔧 Configuration

### Environment Variables

```bash
# Backend
NODE_ENV=development
PORT=3000
IPFS_GATEWAY=https://ipfs.io/ipfs/
CORS_ORIGIN=http://localhost:5173

# Frontend
VITE_API_URL=http://localhost:3000
VITE_IPFS_GATEWAY=https://ipfs.io/ipfs/

# CI/CD
GITHUB_TOKEN=your_github_token
NPM_TOKEN=your_npm_token
DOCKER_USERNAME=your_docker_username
```

### Development Setup

```bash
# Copy environment files
cp packages/backend/.env.example packages/backend/.env
cp packages/frontend/.env.example packages/frontend/.env

# Configure your environment variables
# Edit the .env files with your specific values
```

## 🐳 Docker

### Available Images

- **Backend**: `calimero-registry/backend:latest`
- **Frontend**: `calimero-registry/frontend:latest`

### Running with Docker

```bash
# Build all images
docker-compose build

# Start all services
docker-compose up

# Start specific service
docker-compose up backend
docker-compose up frontend
```

## 🤝 Contributing

### Development Process

1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Make** your changes following the coding standards
4. **Test** your changes: `pnpm quality`
5. **Commit** using conventional commits: `git commit -m "feat: add amazing feature"`
6. **Push** to your branch: `git push origin feature/amazing-feature`
7. **Create** a Pull Request

### Code Standards

- Follow the existing code style
- Write tests for new features
- Update documentation as needed
- Use conventional commits
- Ensure all quality checks pass

### Commit Message Format

```
type(scope): description

[optional body]

[optional footer]
```

Examples:

- `feat(cli): add new command for listing apps`
- `fix(backend): resolve authentication issue`
- `docs(frontend): update installation guide`

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

### Getting Help

- **Issues**: Create an issue on GitHub
- **Discussions**: Use GitHub Discussions for questions
- **Documentation**: Check package-specific READMEs

### Common Issues

- **Build failures**: Run `pnpm clean && pnpm install`
- **Test failures**: Ensure all dependencies are installed
- **Linting errors**: Run `pnpm quality:fix`

## 🔗 Links

- **Repository**: https://github.com/calimero-network/app-registry
- **Issues**: https://github.com/calimero-network/app-registry/issues
- **Discussions**: https://github.com/calimero-network/app-registry/discussions
- **Releases**: https://github.com/calimero-network/app-registry/releases

---

**Built with ❤️ by the Calimero Network team**
