# Registry Integration Checklist

## Quick Reference for Registry Integration

### 🏠 Local Registry Integration

#### Prerequisites

- [ ] Node.js 18+ installed
- [ ] CLI package built (`npm run build`)
- [ ] Dependencies installed (`npm install`)

#### Setup Steps

- [ ] Start local registry: `calimero-registry local start`
- [ ] Verify health: `calimero-registry health --local`
- [ ] Seed sample data: `calimero-registry local seed`
- [ ] Test app listing: `calimero-registry apps list --local`

#### Configuration

- [ ] Set data directory: `~/.calimero-registry/data`
- [ ] Configure port: `--port 8082` (default)
- [ ] Set artifacts directory: `~/.calimero-registry/artifacts`

#### Testing

- [ ] Submit test app: `calimero-registry apps submit manifest.json --local`
- [ ] Verify app appears: `calimero-registry apps list --local`
- [ ] Check manifest: `calimero-registry apps manifest app-id 1.0.0 --local`
- [ ] Test artifact serving: `curl http://localhost:8082/artifacts/app/1.0.0/file.wasm`

### 🌐 Remote Registry Integration

#### Prerequisites

- [ ] Remote registry server running
- [ ] Network connectivity
- [ ] Authentication credentials (if required)

#### Setup Steps

- [ ] Configure base URL: `--url https://registry.example.com`
- [ ] Set timeout: `--timeout 10000`
- [ ] Add authentication: `client.setAuthToken('token')`

#### Testing

- [ ] Test connection: `calimero-registry health --url https://registry.example.com`
- [ ] List apps: `calimero-registry apps list --url https://registry.example.com`
- [ ] Submit app: `calimero-registry apps submit manifest.json --url https://registry.example.com`

### 🔄 Hybrid Integration

#### Environment Detection

- [ ] Set environment variable: `NODE_ENV=development`
- [ ] Configure registry type: `REGISTRY_TYPE=local`
- [ ] Implement switching logic: `const useLocal = process.env.REGISTRY_TYPE === 'local'`

#### Data Synchronization

- [ ] Export local data: `calimero-registry local backup data.json`
- [ ] Import to remote: `curl -X POST https://registry.example.com/import -d @data.json`
- [ ] Verify data consistency between registries

### 🛠️ Custom Registry Integration

#### Interface Implementation

- [ ] Implement `RegistryClient` interface
- [ ] Add `getApps()` method
- [ ] Add `getAppVersions()` method
- [ ] Add `getAppManifest()` method
- [ ] Add `submitAppManifest()` method
- [ ] Add `healthCheck()` method

#### Registration

- [ ] Register custom client: `registerRegistryClient('custom', customClient)`
- [ ] Add CLI option: `--registry custom`
- [ ] Test integration: `calimero-registry apps list --registry custom`

### 📋 Common Issues & Solutions

#### Local Registry Issues

- [ ] **Port already in use**: Use `--port 8083`
- [ ] **Permission denied**: Fix data directory permissions
- [ ] **Artifact not found**: Check file paths and permissions
- [ ] **Server not starting**: Check port availability and configuration

#### Remote Registry Issues

- [ ] **Connection refused**: Check network connectivity and URL
- [ ] **Authentication failed**: Verify credentials and tokens
- [ ] **Timeout errors**: Increase timeout value
- [ ] **Rate limiting**: Implement retry logic with backoff

#### Data Synchronization Issues

- [ ] **Data inconsistency**: Verify schema compatibility
- [ ] **Migration failures**: Check data format and validation
- [ ] **Conflict resolution**: Implement merge strategies
- [ ] **Backup/restore**: Test data integrity

### ✅ Integration Validation

#### Local Registry Validation

- [ ] Server starts without errors
- [ ] Health endpoint returns 200
- [ ] Apps can be listed and submitted
- [ ] Artifacts are served correctly
- [ ] Data persists between restarts
- [ ] Backup/restore works

#### Remote Registry Validation

- [ ] Connection established successfully
- [ ] Authentication works (if required)
- [ ] All CRUD operations work
- [ ] Error handling is proper
- [ ] Performance is acceptable
- [ ] Security measures are in place

#### Hybrid Integration Validation

- [ ] Environment detection works
- [ ] Switching between registries works
- [ ] Data synchronization is reliable
- [ ] No data loss during migration
- [ ] Both registries maintain consistency
- [ ] Error handling covers all scenarios

### 🚀 Production Readiness

#### Security

- [ ] Authentication implemented
- [ ] Authorization configured
- [ ] Input validation in place
- [ ] Rate limiting enabled
- [ ] HTTPS enforced
- [ ] Secrets management configured

#### Performance

- [ ] Response times acceptable
- [ ] Caching implemented
- [ ] Database optimized
- [ ] Artifact serving optimized
- [ ] Monitoring in place
- [ ] Load testing completed

#### Reliability

- [ ] Error handling comprehensive
- [ ] Retry logic implemented
- [ ] Circuit breakers configured
- [ ] Health checks working
- [ ] Backup strategy in place
- [ ] Disaster recovery tested

### 📚 Documentation

#### User Documentation

- [ ] Integration guide written
- [ ] API documentation updated
- [ ] CLI help updated
- [ ] Examples provided
- [ ] Troubleshooting guide created

#### Developer Documentation

- [ ] Architecture documented
- [ ] Code comments added
- [ ] README files updated
- [ ] Changelog maintained
- [ ] Contributing guide written

### 🧪 Testing

#### Unit Tests

- [ ] All components tested
- [ ] Edge cases covered
- [ ] Error scenarios tested
- [ ] Mock implementations used
- [ ] Test coverage > 80%

#### Integration Tests

- [ ] End-to-end scenarios tested
- [ ] Local registry integration tested
- [ ] Remote registry integration tested
- [ ] Data synchronization tested
- [ ] Performance tests completed

#### User Acceptance Tests

- [ ] CLI commands work as expected
- [ ] User workflows tested
- [ ] Error messages are clear
- [ ] Documentation is accurate
- [ ] User experience is smooth

---

## Quick Commands Reference

### Local Registry

```bash
# Start/stop
calimero-registry local start
calimero-registry local stop
calimero-registry local status

# Data management
calimero-registry local seed
calimero-registry local reset --force
calimero-registry local backup
calimero-registry local restore backup.json

# App management
calimero-registry apps list --local
calimero-registry apps submit manifest.json --local
calimero-registry apps manifest app-id 1.0.0 --local
calimero-registry health --local
```

### Remote Registry

```bash
# App management
calimero-registry apps list --url https://registry.example.com
calimero-registry apps submit manifest.json --url https://registry.example.com
calimero-registry health --url https://registry.example.com
```

### Hybrid Usage

```bash
# Environment-based switching
NODE_ENV=development calimero-registry apps list  # Uses local
NODE_ENV=production calimero-registry apps list  # Uses remote

# Manual switching
calimero-registry apps list --local    # Force local
calimero-registry apps list            # Use default (remote)
```
