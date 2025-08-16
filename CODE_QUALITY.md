# Code Quality Tools Setup

This project includes a comprehensive set of code quality tools to ensure consistent, maintainable, and high-quality code.

## Tools Overview

### 🎨 **Prettier**

- **Purpose**: Code formatting and style consistency
- **Configuration**: `.prettierrc`
- **Ignore**: `.prettierignore`
- **Commands**:
  - `pnpm format` - Format all files
  - `pnpm format:check` - Check formatting without changes

### 🔍 **ESLint**

- **Purpose**: Code linting and error detection
- **Configuration**:
  - Root: `.eslintrc.js`
  - Backend: `packages/backend/.eslintrc.js`
- **Integration**: Works with Prettier via `eslint-config-prettier`
- **Commands**:
  - `pnpm lint` - Run linting
  - `pnpm lint:fix` - Fix auto-fixable issues

### 🧪 **Jest**

- **Purpose**: Testing framework
- **Configuration**: `packages/backend/jest.config.js`
- **Coverage**: 80% threshold for branches, functions, lines, statements
- **Commands**:
  - `pnpm test` - Run tests
  - `pnpm test:watch` - Run tests in watch mode
  - `pnpm test:coverage` - Run tests with coverage report

### 🪝 **Husky**

- **Purpose**: Git hooks for automated quality checks
- **Hooks**:
  - `pre-commit`: Runs lint-staged
  - `pre-push`: Runs full quality suite
- **Setup**: Automatically installed and configured

### 📦 **lint-staged**

- **Purpose**: Run linters on staged files only
- **Configuration**: In `package.json`
- **Files**: `.js`, `.jsx`, `.ts`, `.tsx`, `.json`, `.md`, `.yml`, `.yaml`

## Available Scripts

### Root Level Commands

```bash
# Development
pnpm dev              # Start backend in development mode
pnpm start            # Start backend in production mode

# Quality Checks
pnpm quality          # Run all quality checks (format, lint, test)
pnpm quality:fix      # Fix all auto-fixable issues
pnpm format           # Format all files with Prettier
pnpm format:check     # Check formatting without changes
pnpm lint             # Run ESLint
pnpm lint:fix         # Fix ESLint issues
pnpm test             # Run tests

# Docker
pnpm docker:build     # Build Docker image
pnpm docker:compose   # Run with Docker Compose
pnpm docker:compose:dev # Run development with Docker Compose

# Maintenance
pnpm clean            # Clean all packages
```

### Backend Package Commands

```bash
cd packages/backend

# Development
npm run dev           # Start with nodemon
npm run start         # Start in production

# Testing
npm run test          # Run tests
npm run test:watch    # Run tests in watch mode
npm run test:coverage # Run tests with coverage

# Linting
npm run lint          # Run ESLint
npm run lint:fix      # Fix ESLint issues

# Docker
npm run docker:build  # Build Docker image
npm run docker:run    # Run Docker container
```

## VS Code Integration

### Recommended Extensions

- **Prettier**: Code formatter
- **ESLint**: JavaScript linting
- **TypeScript**: TypeScript support
- **Docker**: Docker support
- **GitHub Actions**: GitHub Actions support
- **Jest**: Testing support

### Settings

- **Format on Save**: Enabled
- **Default Formatter**: Prettier
- **ESLint Auto-fix**: Enabled on save
- **File Associations**: Proper for all file types

## Git Hooks

### Pre-commit Hook

Automatically runs when you commit:

1. ESLint on staged files
2. Prettier formatting on staged files

### Pre-push Hook

Automatically runs when you push:

1. Format checking
2. Linting
3. Tests

## CI/CD Integration

### GitHub Actions

All workflows include quality checks:

- **Format Check**: Ensures consistent code style
- **Linting**: Catches code issues
- **Testing**: Validates functionality
- **Coverage**: Ensures adequate test coverage

### Quality Gates

- All tests must pass
- All linting rules must pass
- Code must be properly formatted
- Coverage thresholds must be met

## Configuration Files

### Prettier (`.prettierrc`)

```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 80,
  "tabWidth": 2,
  "useTabs": false
}
```

### ESLint (`.eslintrc.js`)

- Extends `eslint:recommended` and `prettier`
- Custom rules for code quality
- Different configurations for different packages

### Jest (`packages/backend/jest.config.js`)

- Coverage thresholds: 80%
- HTML coverage reports
- Verbose output

## Best Practices

### Code Style

1. **Consistent Formatting**: Always use Prettier
2. **Meaningful Names**: Use descriptive variable and function names
3. **Comments**: Add comments for complex logic
4. **Error Handling**: Proper error handling and logging

### Testing

1. **Coverage**: Maintain 80%+ test coverage
2. **Unit Tests**: Test individual functions
3. **Integration Tests**: Test API endpoints
4. **Edge Cases**: Test error conditions

### Git Workflow

1. **Small Commits**: Make focused, small commits
2. **Descriptive Messages**: Use clear commit messages
3. **Quality First**: Never commit code that fails quality checks
4. **Branch Strategy**: Use feature branches for development

## Troubleshooting

### Common Issues

1. **Format/Lint Conflicts**
   - Run `pnpm quality:fix` to resolve
   - Check ESLint and Prettier configurations

2. **Test Failures**
   - Check test coverage requirements
   - Ensure all tests are passing locally

3. **Docker Build Issues**
   - Check Dockerfile configuration
   - Ensure all dependencies are properly listed

### Debug Commands

```bash
# Check formatting
pnpm format:check

# Check linting
pnpm lint

# Run tests with coverage
pnpm test:coverage

# Check all quality gates
pnpm quality
```

## Next Steps

1. **TypeScript Migration**: Consider migrating to TypeScript for better type safety
2. **Additional Linters**: Add specialized linters for security, performance
3. **Performance Testing**: Add performance benchmarks
4. **Documentation**: Add JSDoc comments for better documentation
