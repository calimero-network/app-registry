# Security Configuration Guide

This document outlines the security measures and configuration options for the SSApp Registry.

## 🔐 **Security Features**

### **Built-in Security**

- **Ed25519 Signature Verification** - Cryptographic signature validation
- **JSON Canonicalization Scheme (JCS)** - Deterministic JSON for signing
- **Input Validation** - SemVer and public key validation
- **CORS Configuration** - Cross-origin request protection
- **Security Headers** - HTTP security headers

### **Dependency Security**

- **npm Audit Integration** - Automated vulnerability scanning
- **Snyk Security Scanning** - Advanced security analysis (optional)
- **Regular Updates** - Dependency update workflows

## 🛡️ **Security Scanning**

### **Automated Scans**

#### **npm Audit**

```bash
# Run security audit
pnpm audit

# Run with specific severity level
pnpm audit --audit-level=moderate

# Generate detailed report
pnpm audit --json > audit-report.json
```

#### **Snyk Security Scan**

```bash
# Install Snyk CLI
npm install -g snyk

# Authenticate with Snyk
snyk auth

# Run security scan
snyk test --severity-threshold=high

# Monitor dependencies
snyk monitor
```

### **GitHub Actions Integration**

#### **Basic Security Check**

The basic CI workflow includes:

- npm audit with high severity threshold
- Continues on error to avoid blocking builds

#### **Advanced Security Check**

The full CI workflow includes:

- npm audit with detailed reporting
- Snyk security scanning (requires token)
- Vulnerability count checking
- JSON report generation

## 🔧 **Configuration**

### **Environment Variables**

#### **Security Headers**

```javascript
// Configure in src/config.js
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Content-Security-Policy': "default-src 'self'",
};
```

#### **CORS Configuration**

```javascript
// Configure in src/config.js
const corsConfig = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};
```

### **Snyk Configuration**

#### **Setup Snyk Token**

1. Create account at [snyk.io](https://snyk.io)
2. Generate API token
3. Add to GitHub repository secrets:
   ```bash
   # In GitHub repository settings
   Settings > Secrets and variables > Actions
   Add secret: SNYK_TOKEN
   ```

#### **Snyk Configuration File**

Create `.snyk` file in project root:

```yaml
version: v1.25.0
ignore:
  'npm:package-name@version':
    - path/to/vulnerable/file.js:
        reason: 'Temporary ignore for development'
        expires: 2024-12-31T00:00:00.000Z
```

## 🚨 **Security Best Practices**

### **Code Security**

1. **Input Validation** - Always validate user inputs
2. **Output Encoding** - Encode outputs to prevent XSS
3. **Error Handling** - Don't expose sensitive information in errors
4. **Authentication** - Implement proper authentication (future)
5. **Authorization** - Implement role-based access control (future)

### **Dependency Security**

1. **Regular Updates** - Keep dependencies updated
2. **Security Audits** - Run audits regularly
3. **Vulnerability Monitoring** - Monitor for new vulnerabilities
4. **Minimal Dependencies** - Only include necessary packages

### **Infrastructure Security**

1. **HTTPS Only** - Use HTTPS in production
2. **Security Headers** - Implement security headers
3. **Rate Limiting** - Implement rate limiting (future)
4. **Logging** - Secure logging practices
5. **Monitoring** - Security monitoring and alerting

## 📋 **Security Checklist**

### **Pre-Deployment**

- [ ] Run `pnpm audit` and fix high/critical vulnerabilities
- [ ] Review Snyk security report (if configured)
- [ ] Check for exposed secrets in code
- [ ] Verify CORS configuration
- [ ] Test input validation
- [ ] Review error messages for sensitive data

### **Post-Deployment**

- [ ] Monitor security logs
- [ ] Set up vulnerability alerts
- [ ] Regular security audits
- [ ] Keep dependencies updated
- [ ] Monitor for suspicious activity

## 🔍 **Security Monitoring**

### **Logging**

```javascript
// Security event logging
server.log.info({
  event: 'security',
  type: 'authentication_failure',
  ip: request.ip,
  userAgent: request.headers['user-agent'],
});
```

### **Alerts**

- Failed authentication attempts
- Unusual request patterns
- High error rates
- Dependency vulnerabilities

## 🛠️ **Troubleshooting**

### **Common Issues**

#### **Snyk Authentication Error**

```
ERROR Authentication error (SNYK-0005)
```

**Solution**:

1. Verify SNYK_TOKEN is set correctly
2. Check token permissions
3. Use `continue-on-error: true` in workflows

#### **npm Audit Failures**

```
npm ERR! code EAUDITNOPJSON
```

**Solution**:

1. Ensure package.json exists
2. Run `pnpm install` first
3. Check for lock file issues

#### **CORS Errors**

```
Access to fetch at 'http://localhost:8080' from origin 'http://localhost:3000' has been blocked by CORS policy
```

**Solution**:

1. Update CORS configuration in `src/config.js`
2. Add frontend origin to allowed origins
3. Restart server after configuration changes

## 📚 **Resources**

- [OWASP Security Guidelines](https://owasp.org/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
- [Snyk Documentation](https://docs.snyk.io/)
- [npm Security](https://docs.npmjs.com/about-audit-reports)

## 🔄 **Security Updates**

### **Automated Updates**

```bash
# Update dependencies
pnpm update

# Check for outdated packages
pnpm outdated

# Update with interactive mode
pnpm update --interactive
```

### **Manual Security Reviews**

- Monthly dependency reviews
- Quarterly security audits
- Annual penetration testing (recommended)
