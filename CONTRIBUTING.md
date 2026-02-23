# Contributing to Calimero Registry

Thank you for your interest in contributing to the Calimero Registry! This document provides comprehensive guidelines for contributing to this project.

## Table of Contents

- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Code Quality Standards](#code-quality-standards)
- [Commit Conventions](#commit-conventions)
- [Versioning Strategy](#versioning-strategy)
- [CI/CD Pipeline](#cicd-pipeline)
- [Automated Releases](#automated-releases)
- [Testing](#testing)
- [Pull Request Process](#pull-request-process)
- [Reporting Issues](#reporting-issues)

## Getting Started

### Prerequisites

- Node.js 18+
- pnpm 8+
- Git

### Quick Start

```bash
# Clone the repository
git clone https://github.com/calimero-network/app-registry.git
cd app-registry

# Install dependencies
pnpm install

# Start development servers
pnpm dev:all
```

### Development Commands

```bash
# Install dependencies
pnpm install

# Run development servers
pnpm dev:all

# Lint and format code
pnpm lint
pnpm format:check

# Run tests
pnpm test

# Build all packages
pnpm build
```

## Development Setup

### Monorepo Structure

This project is organized as a pnpm monorepo with the following packages:

- **`packages/backend`** - Fastify-based API server
- **`packages/frontend`** - React-based web interface
- **`packages/client-library`** - TypeScript client library
- **`packages/cli`** - Command-line interface tool

### Available Scripts

```bash
# Development
pnpm dev:all          # Start all development servers
pnpm dev:backend      # Start backend only
pnpm dev:frontend     # Start frontend only

# Quality checks
pnpm quality          # Run all quality checks (format, lint, test)
pnpm format           # Format code with Prettier
pnpm format:check     # Check code formatting
pnpm lint             # Run ESLint
pnpm test             # Run all tests

# Building
pnpm build            # Build all packages
pnpm build:backend    # Build backend only
pnpm build:frontend   # Build frontend only
pnpm build:lib        # Build client library only
pnpm build:cli        # Build CLI only

# Package management
pnpm clean            # Clean all build artifacts
pnpm install:all      # Install dependencies for all packages
```

## Code Quality Standards

### Code Formatting

We use **Prettier** for consistent code formatting across all packages:

```bash
# Format all code
pnpm format

# Check formatting without changing files
pnpm format:check
```

### Linting

We use **ESLint** with TypeScript support for code quality:

```bash
# Lint all packages
pnpm lint

# Lint specific package
pnpm --filter backend lint
```

### Pre-commit Hooks

We use **Husky** and **lint-staged** to ensure code quality:

- Automatic formatting on commit
- Linting of staged files
- Type checking for TypeScript files

### TypeScript

All packages use TypeScript with strict configuration:

- Strict type checking enabled
- No implicit any types
- Proper type definitions required

## Commit Conventions

We follow the **Conventional Commits** specification for commit messages to enable automated versioning and changelog generation.

### Commit Message Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

### Commit Types

- **`feat`** - New features
- **`fix`** - Bug fixes
- **`docs`** - Documentation changes
- **`style`** - Code style changes (formatting, etc.)
- **`refactor`** - Code refactoring
- **`test`** - Adding or updating tests
- **`chore`** - Maintenance tasks

### Package Scopes

Use package-specific scopes to trigger releases for specific packages:

- **`feat(be)`** - Backend feature (triggers backend release)
- **`fix(fe)`** - Frontend fix (triggers frontend release)
- **`feat(lib)`** - Client library feature (triggers library release)
- **`fix(cli)`** - CLI fix (triggers CLI release)

### Examples

```bash
# Backend feature
git commit -m "feat(be): add user authentication endpoint"

# Frontend fix
git commit -m "fix(fe): resolve navigation menu display issue"

# Client library documentation
git commit -m "docs(lib): update API reference documentation"

# CLI feature
git commit -m "feat(cli): add interactive configuration wizard"

# Monorepo-wide changes
git commit -m "chore: update dependencies across all packages"
```

### Breaking Changes

For breaking changes, include `BREAKING CHANGE:` in the commit body:

```bash
git commit -m "feat(api): restructure authentication endpoints

BREAKING CHANGE: Authentication endpoints now require API key in header
instead of query parameter. Update your client code accordingly."
```

## Versioning Strategy

### Independent Versioning

The CLI and Client Library use **independent versioning**:

- Each package has its own version number
- Releases are triggered by package-specific commits
- Version numbers follow Semantic Versioning (SemVer)

### Coordinated Versioning

Backend and Frontend use **coordinated versioning**:

- Both packages share the same version number
- Releases are synchronized
- Changes to either package trigger releases for both

### Version Numbering

We follow **Semantic Versioning 2.0.0**:

- **MAJOR** - Breaking changes
- **MINOR** - New features (backward compatible)
- **PATCH** - Bug fixes (backward compatible)

### Release Types

- **`fix(scope)`** → Patch release (1.0.0 → 1.0.1)
- **`feat(scope)`** → Minor release (1.0.0 → 1.1.0)
- **`BREAKING CHANGE`** → Major release (1.0.0 → 2.0.0)

## CI/CD Pipeline

### GitHub Actions Workflows

We have several CI/CD workflows:

#### 1. Basic CI (`basic-ci.yml`)

- Runs on all pushes and pull requests
- Tests, linting, and security checks
- No external secrets required

#### 2. Full CI (`ci.yml`)

- Comprehensive testing and security scanning
- Docker image building
- Artifact creation

#### 3. Semantic Release (`semantic-release.yml`)

- Automated versioning and publishing
- Change detection and release triggering
- GitHub releases creation

#### 4. CLI Release (`cli-release.yml`)

- Dedicated CLI package releases
- NPM publishing
- Docker image building (optional)

#### 5. Deploy (`deploy.yml`)

- Production deployment
- Docker image pushing
- Environment-specific configurations

### Quality Gates

All changes must pass:

1. **Code formatting** (Prettier)
2. **Linting** (ESLint)
3. **Type checking** (TypeScript)
4. **Unit tests** (Jest/Vitest)
5. **Security scanning** (Snyk, npm audit)

## Automated Releases

### Smart Change Detection

Our release system automatically detects which packages have changes:

```bash
# Detects changes in packages since last release
./scripts/detect-changes.sh

# Outputs:
# cli-changed=true
# lib-changed=false
# backend-changed=true
# frontend-changed=false
# monorepo-changed=true
# release-type=minor
```

### Release Triggers

Releases are triggered by:

- **Package-specific commits** - `feat(cli)`, `fix(lib)`, etc.
- **Monorepo changes** - Root-level changes
- **Manual triggers** - For testing and emergency releases

### Release Process

1. **Change Detection** - Identify modified packages
2. **Version Calculation** - Determine release type
3. **Build & Test** - Ensure quality
4. **Publishing** - Release to appropriate registries
5. **Documentation** - Update changelogs and releases

### Testing Releases

To test the release process locally:

```bash
# Test change detection
./scripts/detect-changes.sh HEAD~1..HEAD

# Test semantic release (dry-run)
cd packages/cli
npx semantic-release --dry-run
```

## Testing

### Test Structure

Each package has its own test suite:

- **Backend** - Jest with supertest for API testing
- **Frontend** - Vitest with React Testing Library
- **Client Library** - Vitest for unit tests
- **CLI** - Vitest for command testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests for specific package
pnpm --filter backend test
pnpm --filter frontend test

# Run tests in watch mode
pnpm --filter backend test:watch
```

### Test Coverage

We maintain high test coverage:

- Unit tests for all public APIs
- Integration tests for critical paths
- End-to-end tests for user workflows

## Pull Request Process

### Before Submitting

1. **Fork the repository**
2. **Create a feature branch**
3. **Make your changes**
4. **Run quality checks locally**
5. **Write/update tests**
6. **Update documentation**

### PR Guidelines

- **Clear title** describing the change
- **Detailed description** of what and why
- **Link to related issues**
- **Screenshots** for UI changes
- **Test coverage** for new features

### Required Checklist

Before submitting a PR, ensure:

- [ ] **README/docs updated** - Documentation reflects your changes
- [ ] **OpenAPI updated** - If API changes, update `api.yml` specification
- [ ] **Tests added/updated** - New functionality has test coverage
- [ ] **Linting passes** - `pnpm lint` runs without errors
- [ ] **Formatting correct** - `pnpm format:check` passes
- [ ] **All tests pass** - `pnpm test` runs successfully

### Review Process

1. **Automated checks** must pass
2. **Code review** by maintainers
3. **Approval** from at least one maintainer
4. **Merge** when ready

## Reporting Issues

### Bug Reports

When reporting bugs, please include:

- **Clear description** of the problem
- **Steps to reproduce**
- **Expected vs actual behavior**
- **Environment details** (OS, Node version, etc.)
- **Screenshots/logs** if applicable

### Feature Requests

For feature requests:

- **Clear description** of the feature
- **Use case** and motivation
- **Proposed implementation** (if you have ideas)
- **Alternative solutions** considered

### Security Issues

For security issues:

- **Private disclosure** to maintainers
- **Detailed description** of the vulnerability
- **Proof of concept** if possible
- **Suggested fix** if available

---

Thank you for contributing to the Calimero Registry! Your contributions help make this project better for everyone.
