# Calimero Registry Backend

A high-performance Fastify-based API server for the Calimero Registry (self-sovereign application registry), featuring JCS canonicalization, Ed25519 signature verification, and Google Cloud Storage for bundle binaries.

## 🚀 Features

- **Fastify Server**: High-performance web framework
- **OpenAPI 3.0**: Automatic API documentation and validation
- **JCS Canonicalization**: Deterministic JSON serialization
- **Ed25519 Verification**: Cryptographic signature validation
- **Blob Storage**: Bundle `.mpk` binaries in a GCS bucket; manifests, indexes and counters in Redis
- **SemVer Immutability**: A published `package@version` is never overwritten (except under `ALLOW_BUNDLE_OVERWRITE`, for migrations)
- **Security Scanning**: Snyk integration for vulnerability detection

## 📦 Installation

```bash
# Install dependencies
pnpm install

# Build the project
pnpm build

# Start development server
pnpm dev

# Start production server
pnpm start
```

## 🔧 Configuration

### Environment Variables

```bash
# Server Configuration
PORT=3000                    # Server port (default: 3000)
HOST=0.0.0.0                # Server host (default: 0.0.0.0)
NODE_ENV=development        # Environment (development/production)

# CORS Configuration
CORS_ORIGIN=http://localhost:5173   # Allowed CORS origins

# Security
JWT_SECRET=your_jwt_secret          # JWT signing secret
```

### Environment Setup

```bash
# Copy environment file
cp .env.example .env

# Edit with your configuration
nano .env
```

## 🏗️ Architecture

### Project Structure

```
packages/backend/
├── src/
│   ├── server.js           # Main server setup
│   ├── config.js           # Configuration management
│   ├── lib/
│   │   └── verify.js       # JCS + Ed25519 verification
│   ├── schemas/            # JSON schemas for validation
│   │   └── manifest.js     # self-sovereign application manifest schema
│   └── routes/             # API endpoints
│       ├── apps.js         # Application management
│       ├── developers.js   # Developer management
│       └── attestations.js # Attestation handling
├── tests/                  # Test suite
│   ├── health.test.js      # Health endpoint tests
│   └── verify.test.js      # Verification library tests
├── Dockerfile              # Container configuration
└── package.json            # Package configuration
```

### Core Components

#### 1. **Verification Library** (`src/lib/verify.js`)

- **JCS Canonicalization**: Deterministic JSON serialization
- **Ed25519 Verification**: Cryptographic signature validation
- **SemVer Validation**: Semantic versioning compliance
- **Public Key Validation**: Ed25519 public key format validation

#### 2. **API Routes**

- **Applications**: CRUD operations for self-sovereign application manifests
- **Developers**: Developer registration and management
- **Attestations**: Attestation creation and verification
- **Health**: System health monitoring

#### 3. **JSON Schemas**

- **Manifest Schema**: self-sovereign application manifest validation
- **Request/Response Schemas**: API input/output validation

## 📚 API Documentation

### Interactive Documentation

When the server is running, visit:

- **Swagger UI**: `http://localhost:3000/docs`
- **OpenAPI JSON**: `http://localhost:3000/docs/json`

### OpenAPI Specification

The complete API specification is available in the root `api.yml` file.

### Key Endpoints

#### Health Check

```http
GET /healthz
```

Returns server health status.

#### Applications

```http
GET /apps                    # List all applications
GET /apps/:id               # Get specific application
POST /apps                  # Register new application
PUT /apps/:id              # Update application
DELETE /apps/:id           # Delete application
```

#### Developers

```http
GET /developers             # List all developers
GET /developers/:id        # Get specific developer
POST /developers           # Register new developer
PUT /developers/:id        # Update developer
DELETE /developers/:id     # Delete developer
```

#### Attestations

```http
GET /attestations           # List all attestations
GET /attestations/:id      # Get specific attestation
POST /attestations         # Create new attestation
```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run specific test file
pnpm test tests/health.test.js
```

### Test Coverage

- **Unit Tests**: Individual function testing
- **Integration Tests**: API endpoint testing
- **Verification Tests**: JCS and Ed25519 functionality

### Test Examples

#### Health Endpoint Test

```javascript
describe('Health endpoint', () => {
  it('should return 200 with status ok', async () => {
    const response = await request(app).get('/healthz').expect(200);

    expect(response.body).toEqual({
      status: 'ok',
      timestamp: expect.any(String),
    });
  });
});
```

#### Verification Test

```javascript
describe('Verification library', () => {
  it('should canonicalize JSON correctly', () => {
    const input = { b: 2, a: 1, c: 3 };
    const expected = '{"a":1,"b":2,"c":3}';

    expect(canonicalizeJSON(input)).toBe(expected);
  });
});
```

## 🐳 Docker

### Building Image

```bash
# Build Docker image
docker build -t calimero-registry-backend .

# Run container
docker run -p 3000:3000 calimero-registry-backend

# Run with environment variables
docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  calimero-registry-backend
```

### Docker Compose

```yaml
version: '3.8'
services:
  backend:
    build: .
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
      - PORT=3000
    volumes:
      - ./logs:/app/logs
```

## 🔍 Monitoring

### Health Endpoints

- `GET /healthz`: Basic health check
- `GET /docs`: API documentation
- `GET /metrics`: Application metrics (if enabled)

### Logging

- **Structured JSON logging**
- **Request/response tracking**
- **Error handling with context**
- **Performance monitoring**

### Example Log Output

```json
{
  "level": 30,
  "time": 1640995200000,
  "pid": 12345,
  "hostname": "server-1",
  "reqId": "req-1",
  "req": {
    "method": "GET",
    "url": "/apps",
    "headers": {
      "user-agent": "Mozilla/5.0..."
    }
  },
  "res": {
    "statusCode": 200
  },
  "responseTime": 15
}
```

## 🛡️ Security

### Security Features

- **JCS Canonicalization**: Deterministic JSON serialization
- **Ed25519 Signatures**: Cryptographic verification of manifests
- **Input Validation**: Comprehensive request validation
- **CORS Protection**: Configurable cross-origin restrictions
- **Rate Limiting**: Request rate limiting (if enabled)

### Security Best Practices

- **Environment Variables**: Sensitive data in environment variables
- **Input Sanitization**: All inputs validated and sanitized
- **Error Handling**: Secure error messages without information leakage
- **Dependency Scanning**: Regular security vulnerability scanning

## 🚀 Deployment

### Production Deployment

```bash
# Build for production
pnpm build

# Start production server
NODE_ENV=production pnpm start

# Using PM2
pm2 start dist/server.js --name calimero-registry-backend
```

### Environment Configuration

```bash
# Production environment variables
NODE_ENV=production
PORT=3000
CORS_ORIGIN=https://your-frontend-domain.com
JWT_SECRET=your_secure_jwt_secret
```

## 🔧 Development

### Development Commands

```bash
# Start development server with hot reload
pnpm dev

# Run linting
pnpm lint

# Fix linting issues
pnpm lint:fix

# Format code
pnpm format

# Check code quality
pnpm quality
```

### Code Quality

- **ESLint**: Code linting with TypeScript support
- **Prettier**: Code formatting
- **Jest**: Testing framework
- **Coverage**: Test coverage reporting

## 📄 License

This package is licensed under the MIT License - see the [LICENSE](../../LICENSE) file for details.

## 🤝 Contributing

See the main [CONTRIBUTING](../../CONTRIBUTING.md) guide for details on how to contribute to this package.

## 🆘 Support

- **Issues**: Create an issue on GitHub
- **Documentation**: Check the API documentation at `/docs`
- **Examples**: Review the test suite for usage examples

# Backend deployment test - Sat Aug 16 16:09:34 CEST 2025
