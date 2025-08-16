# Support

Thank you for using the SSApp Registry! This document provides information on how to get help and support.

## Getting Help

### Documentation

Start with our comprehensive documentation:

- **[README.md](README.md)** - Project overview and quick start guide
- **[CONTRIBUTING.md](CONTRIBUTING.md)** - Development guidelines and contribution process
- **[SECURITY.md](SECURITY.md)** - Security policy and vulnerability reporting
- **Package-specific READMEs**:
  - [Backend README](packages/backend/README.md)
  - [Frontend README](packages/frontend/README.md)
  - [Client Library README](packages/client-library/README.md)
  - [CLI README](packages/cli/README.md)

### Community Support

#### GitHub Discussions

For general questions, feature requests, and community discussions:

- Visit our [GitHub Discussions](https://github.com/calimero-network/app-registry/discussions)
- Search existing discussions before creating a new one
- Use appropriate categories for your post

#### GitHub Issues

For bug reports and specific technical issues:

- Check existing [issues](https://github.com/calimero-network/app-registry/issues) first
- Use the issue templates when creating new issues
- Provide detailed information including:
  - Steps to reproduce
  - Expected vs actual behavior
  - Environment details (OS, Node version, etc.)
  - Error messages and logs

### Professional Support

For enterprise users and professional support:

- **Email**: [support@calimero.network](mailto:support@calimero.network)
- **Priority Support**: Available for enterprise customers
- **Custom Development**: Contact us for custom features and integrations

## Common Issues

### Installation Problems

#### Node.js Version Issues

**Problem**: "Unsupported Node.js version" errors

**Solution**: Ensure you're using Node.js 18 or higher:

```bash
node --version  # Should be 18.x or higher
```

#### pnpm Installation Issues

**Problem**: "pnpm command not found"

**Solution**: Install pnpm globally:

```bash
npm install -g pnpm
# or
curl -fsSL https://get.pnpm.io/install.sh | sh -
```

#### Dependency Installation Issues

**Problem**: "ERR_PNPM_OUTDATED_LOCKFILE"

**Solution**: Update the lock file:

```bash
pnpm install  # Without --frozen-lockfile
```

### Development Issues

#### Build Failures

**Problem**: Build errors in CI or locally

**Solution**: Run quality checks locally first:

```bash
pnpm quality  # Runs format, lint, and test
```

#### Test Failures

**Problem**: Tests failing locally

**Solution**: Check your environment:

```bash
# Clean and reinstall
pnpm clean
pnpm install

# Run tests with verbose output
pnpm test --verbose
```

#### Docker Issues

**Problem**: Docker build failures

**Solution**: Check Docker configuration:

```bash
# Build with verbose output
docker build --progress=plain -t ssapp-registry .

# Check Docker logs
docker logs <container-name>
```

### Runtime Issues

#### Backend Server Issues

**Problem**: Backend won't start

**Solution**: Check configuration and logs:

```bash
# Check environment variables
echo $NODE_ENV
echo $PORT

# Run with debug logging
DEBUG=* pnpm dev:backend
```

#### Frontend Issues

**Problem**: Frontend build or runtime errors

**Solution**: Check browser console and build output:

```bash
# Build with verbose output
pnpm build:frontend --verbose

# Check for TypeScript errors
pnpm --filter frontend type-check
```

## Troubleshooting Guide

### Performance Issues

#### Slow Build Times

**Solutions**:

- Use pnpm cache: `pnpm store prune` to clear cache if needed
- Enable parallel builds: `pnpm build --parallel`
- Check disk space and memory usage

#### Slow Development Server

**Solutions**:

- Use `pnpm dev:backend` or `pnpm dev:frontend` instead of `pnpm dev:all`
- Check for file watchers limit: `ulimit -n`
- Disable unnecessary services

### Security Issues

#### Authentication Problems

**Solutions**:

- Check API keys and tokens
- Verify CORS configuration
- Review security headers

#### SSL/TLS Issues

**Solutions**:

- Check certificate validity
- Verify proxy configuration
- Review HTTPS settings

## Feature Requests

### Before Submitting

1. **Check existing issues** - Your request might already be planned
2. **Search discussions** - Community might have discussed this
3. **Review roadmap** - Check if it aligns with project goals

### Submitting Requests

Use the [Feature Request template](https://github.com/calimero-network/app-registry/issues/new?template=feature_request.md) and include:

- **Clear description** of the feature
- **Use case** and motivation
- **Proposed implementation** (if you have ideas)
- **Alternative solutions** considered

## Reporting Bugs

### Before Reporting

1. **Search existing issues** - Bug might already be reported
2. **Try latest version** - Issue might be fixed
3. **Reproduce locally** - Ensure it's not environment-specific

### Bug Report Template

Use the [Bug Report template](https://github.com/calimero-network/app-registry/issues/new?template=bug_report.md) and include:

- **Clear description** of the problem
- **Steps to reproduce**
- **Expected vs actual behavior**
- **Environment details** (OS, Node version, etc.)
- **Screenshots/logs** if applicable

## Contributing to Support

### Improving Documentation

- Fix typos and clarify unclear sections
- Add missing examples and use cases
- Update outdated information
- Translate documentation to other languages

### Helping Others

- Answer questions in discussions
- Help debug issues in comments
- Share your solutions and workarounds
- Review and test pull requests

### Community Guidelines

- Be respectful and patient
- Provide constructive feedback
- Help maintain a positive environment
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md)

## Contact Information

### General Inquiries

- **Email**: [info@calimero.network](mailto:info@calimero.network)
- **GitHub**: [@calimero-network](https://github.com/calimero-network)

### Security Issues

- **Email**: [security@calimero.network](mailto:security@calimero.network)
- **PGP Key**: Available upon request

### Enterprise Support

- **Email**: [enterprise@calimero.network](mailto:enterprise@calimero.network)
- **Phone**: Available for enterprise customers

---

Thank you for using the SSApp Registry! We're here to help you succeed.
