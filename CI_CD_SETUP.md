# CI/CD Setup Guide

## Overview

This SSApp Registry Backend includes a comprehensive CI/CD pipeline with multiple workflows for different deployment scenarios.

## Workflows

### 1. Basic CI (`.github/workflows/basic-ci.yml`)

**Triggers**: Push to main/develop, Pull requests
**Purpose**: Basic testing and validation without external dependencies

**Features:**

- ✅ Multi-node testing (Node.js 18.x, 20.x)
- ✅ Linting with ESLint
- ✅ Unit tests with Jest
- ✅ Build verification
- ✅ Docker build and container testing
- ✅ Health endpoint validation

**No external secrets required** - ready to use immediately!

### 2. Full CI/CD (`.github/workflows/ci.yml`)

**Triggers**: Push to main/develop, Pull requests
**Purpose**: Complete CI/CD with security scanning and artifact publishing

**Features:**

- ✅ All basic CI features
- ✅ Security audit with npm audit
- ✅ Snyk security scanning
- ✅ Build artifact upload
- ✅ Docker image publishing to Docker Hub

**Required secrets:**

- `SNYK_TOKEN`: For security scanning
- `DOCKER_USERNAME`: Docker Hub username
- `DOCKER_PASSWORD`: Docker Hub password

### 3. Production Deployment (`.github/workflows/deploy.yml`)

**Triggers**: Version tags (e.g., `v1.0.0`)
**Purpose**: Production deployment

**Features:**

- ✅ Full testing and validation
- ✅ Docker image building
- ✅ Production deployment
- ✅ Deployment notifications

## Quick Start

### 1. Push to GitHub

```bash
git remote add origin https://github.com/yourusername/ssapp-registry-backend.git
git push -u origin main
```

### 2. Enable GitHub Actions

- Go to your repository on GitHub
- Navigate to Actions tab
- The Basic CI workflow will run automatically

### 3. Set up Secrets (Optional)

For full CI/CD features, add these secrets in GitHub:

- Go to Settings → Secrets and variables → Actions
- Add the required secrets mentioned above

## Docker Deployment

### Local Development

```bash
# Build and run with Docker Compose
npm run docker:compose:dev

# Or build manually
npm run docker:build
npm run docker:run
```

### Production

```bash
# Build production image
docker build -t ssapp-registry-backend .

# Run with environment variables
docker run -d \
  -p 8080:8080 \
  -e NODE_ENV=production \
  -e CORS_ORIGIN=https://yourdomain.com \
  ssapp-registry-backend
```

## Environment Variables

| Variable        | Default           | Description          |
| --------------- | ----------------- | -------------------- |
| `PORT`          | `8080`            | Server port          |
| `HOST`          | `0.0.0.0`         | Server host          |
| `NODE_ENV`      | `development`     | Environment mode     |
| `LOG_LEVEL`     | `info`            | Logging level        |
| `CORS_ORIGIN`   | Multiple origins  | CORS allowed origins |
| `IPFS_GATEWAYS` | Multiple gateways | IPFS gateway URLs    |

## Health Checks

The application includes health checks at multiple levels:

### Application Level

- `GET /healthz` returns `{status: "ok"}`

### Docker Level

- Built-in health check in Dockerfile
- Checks `/healthz` endpoint every 30 seconds

### CI/CD Level

- Automated health checks in GitHub Actions
- Validates server startup and endpoint response

## Monitoring

### Logs

- Structured JSON logging
- Configurable log levels
- Request/response logging

### Metrics

- Response time tracking
- Request count logging
- Error rate monitoring

## Security

### CI/CD Security

- Dependency vulnerability scanning
- Code quality checks
- Security audit integration

### Application Security

- Input validation
- CORS protection
- Ed25519 signature verification
- JCS canonicalization

## Troubleshooting

### Common Issues

1. **Docker build fails with native dependencies**
   - Fixed: Added Python and build tools to Dockerfile

2. **Port already in use**
   - Use different port: `PORT=8081 npm start`

3. **Health check fails**
   - Check if server is running: `curl http://localhost:8080/healthz`
   - Check logs: `docker logs <container-name>`

### Debug Commands

```bash
# Check server status
curl http://localhost:8080/healthz

# View logs
docker logs ssapp-registry-backend

# Run tests
npm test

# Check linting
npm run lint

# Build Docker image
npm run docker:build
```

## Next Steps

1. **Set up monitoring**: Add application monitoring (e.g., Prometheus, Grafana)
2. **Database integration**: Replace in-memory storage with persistent database
3. **Load balancing**: Set up multiple instances behind a load balancer
4. **SSL/TLS**: Configure HTTPS with proper certificates
5. **Backup strategy**: Implement data backup and recovery procedures
