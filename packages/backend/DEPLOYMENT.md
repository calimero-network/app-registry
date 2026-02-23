# Calimero Registry V1 - Deployment Guide

This guide covers deploying the Calimero Registry V1 API using Docker and Docker Compose.

## 🐳 Docker Deployment

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- At least 1GB RAM
- At least 2GB disk space

### Quick Start

1. **Clone the repository:**

   ```bash
   git clone https://github.com/calimero-network/app-registry.git
   cd app-registry/packages/backend
   ```

2. **Build and start the registry:**

   ```bash
   docker-compose up -d
   ```

3. **Verify deployment:**
   ```bash
   curl http://localhost:8080/healthz
   ```

### Configuration

The registry can be configured using environment variables in the `docker-compose.yml` file:

#### Security Settings

```yaml
ENABLE_RATE_LIMITING: 'true' # Enable rate limiting
ENABLE_SIZE_LIMITS: 'true' # Enable size limits
REQUIRE_SIGNATURES: 'false' # Require signatures
ALLOW_UNVERIFIED: 'true' # Allow unverified manifests
```

#### Limits

```yaml
MAX_MANIFEST_SIZE: '1048576' # 1MB max manifest size
MAX_DEPENDENCIES: '32' # Max dependencies per manifest
MAX_PROVIDES: '16' # Max provides interfaces
MAX_REQUIRES: '16' # Max requires interfaces
MAX_SEARCH_RESULTS: '100' # Max search results
MAX_RESOLVE_DEPTH: '10' # Max dependency resolution depth
RATE_LIMIT_MAX: '100' # Max requests per window
RATE_LIMIT_WINDOW: '60000' # Rate limit window (ms)
```

#### Features

```yaml
ENABLE_CANONICAL_JCS: 'true' # Enable JCS canonicalization
ENABLE_INTERFACE_RESOLUTION: 'true' # Enable interface resolution
ENABLE_CYCLE_DETECTION: 'true' # Enable cycle detection
```

#### Development

```yaml
DEV_MODE: 'false' # Development mode
DEBUG_LOGGING: 'false' # Debug logging
ALLOW_LOCAL_ARTIFACTS: 'false' # Allow local artifacts
ALLOW_BUNDLE_OVERWRITE: 'false' # If 'true'/'1', push may overwrite existing bundle (migrations only; do not enable in production)
```

### Production Deployment

For production deployment, consider the following:

1. **Use a reverse proxy (nginx/traefik):**

   ```yaml
   # Add to docker-compose.yml
   nginx:
     image: nginx:alpine
     ports:
       - '80:80'
       - '443:443'
     volumes:
       - ./nginx.conf:/etc/nginx/nginx.conf
     depends_on:
       - registry-api
   ```

2. **Enable HTTPS:**

   ```yaml
   environment:
     # ... other settings
     HTTPS_ENABLED: 'true'
     SSL_CERT_PATH: '/app/certs/cert.pem'
     SSL_KEY_PATH: '/app/certs/key.pem'
   ```

3. **Use external database (optional):**

   ```yaml
   # Add to docker-compose.yml
   postgres:
     image: postgres:15-alpine
     environment:
       POSTGRES_DB: registry
       POSTGRES_USER: registry
       POSTGRES_PASSWORD: ${DB_PASSWORD}
     volumes:
       - postgres-data:/var/lib/postgresql/data
   ```

4. **Enable monitoring:**
   ```yaml
   # Add to docker-compose.yml
   prometheus:
     image: prom/prometheus:latest
     ports:
       - '9090:9090'
     volumes:
       - ./prometheus.yml:/etc/prometheus/prometheus.yml
   ```

### Health Checks

The registry includes built-in health checks:

- **Health endpoint:** `GET /healthz`
- **Configuration endpoint:** `GET /v1/config` (dev mode only)
- **Stats endpoint:** `GET /stats`

### Monitoring

Monitor the registry using:

```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs -f registry-api

# Check health
curl http://localhost:8080/healthz

# View configuration (dev mode)
curl http://localhost:8080/v1/config
```

### Scaling

To scale the registry:

```bash
# Scale to 3 instances
docker-compose up -d --scale registry-api=3
```

**Note:** For production scaling, consider using:

- Load balancer (nginx, traefik)
- Shared storage (Redis, PostgreSQL)
- Container orchestration (Kubernetes, Docker Swarm)

### Backup and Recovery

#### Backup

```bash
# Backup data volume
docker run --rm -v registry_data:/data -v $(pwd):/backup alpine tar czf /backup/registry-backup.tar.gz -C /data .
```

#### Restore

```bash
# Restore data volume
docker run --rm -v registry_data:/data -v $(pwd):/backup alpine tar xzf /backup/registry-backup.tar.gz -C /data
```

### Troubleshooting

#### Common Issues

1. **Port already in use:**

   ```bash
   # Check what's using port 8080
   lsof -i :8080
   # Kill the process or change port in docker-compose.yml
   ```

2. **Permission denied:**

   ```bash
   # Fix volume permissions
   sudo chown -R 1001:1001 ./data
   ```

3. **Out of memory:**

   ```bash
   # Increase Docker memory limit
   # Or reduce MAX_MANIFEST_SIZE in environment
   ```

4. **Rate limiting too strict:**
   ```bash
   # Increase rate limits in docker-compose.yml
   RATE_LIMIT_MAX: "1000"
   RATE_LIMIT_WINDOW: "60000"
   ```

#### Debug Mode

Enable debug mode for troubleshooting:

```yaml
environment:
  DEV_MODE: 'true'
  DEBUG_LOGGING: 'true'
  DEBUG_LOGGING_LEVEL: 'debug'
```

### Security Considerations

1. **Network Security:**
   - Use reverse proxy with SSL/TLS
   - Restrict access to management endpoints
   - Use firewall rules

2. **Container Security:**
   - Run as non-root user (already configured)
   - Use minimal base image (alpine)
   - Regular security updates

3. **Data Security:**
   - Encrypt data volumes
   - Regular backups
   - Access control

### Performance Tuning

1. **Memory:**

   ```yaml
   deploy:
     resources:
       limits:
         memory: 512M
       reservations:
         memory: 256M
   ```

2. **CPU:**

   ```yaml
   deploy:
     resources:
       limits:
         cpus: '1.0'
       reservations:
         cpus: '0.5'
   ```

3. **Storage:**
   - Use SSD storage for better I/O
   - Consider external database for large datasets

### Environment Variables Reference

| Variable               | Default      | Description                |
| ---------------------- | ------------ | -------------------------- |
| `NODE_ENV`             | `production` | Node environment           |
| `PORT`                 | `8080`       | Server port                |
| `HOST`                 | `0.0.0.0`    | Server host                |
| `ENABLE_RATE_LIMITING` | `true`       | Enable rate limiting       |
| `ENABLE_SIZE_LIMITS`   | `true`       | Enable size limits         |
| `REQUIRE_SIGNATURES`   | `false`      | Require signatures         |
| `ALLOW_UNVERIFIED`     | `true`       | Allow unverified manifests |
| `MAX_MANIFEST_SIZE`    | `1048576`    | Max manifest size (bytes)  |
| `MAX_DEPENDENCIES`     | `32`         | Max dependencies           |
| `RATE_LIMIT_MAX`       | `100`        | Max requests per window    |
| `RATE_LIMIT_WINDOW`    | `60000`      | Rate limit window (ms)     |
| `DEV_MODE`             | `false`      | Development mode           |
| `DEBUG_LOGGING`        | `false`      | Debug logging              |

### Support

For issues and questions:

- GitHub Issues: https://github.com/calimero-network/app-registry/issues
- Documentation: https://docs.calimero.network
- Community: https://discord.gg/calimero
