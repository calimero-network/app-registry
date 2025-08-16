# Commit Message Conventions

This document describes the commit message conventions used for semantic versioning and package-specific releases.

## Conventional Commit Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

## Commit Types

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that do not affect the meaning of the code
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **perf**: A code change that improves performance
- **test**: Adding missing tests or correcting existing tests
- **chore**: Changes to the build process or auxiliary tools

## Package Scopes

Use these scopes to trigger package-specific releases:

- **cli**: CLI package (`@xilos/ssapp-registry-cli`)
- **lib**: Client library (`@ssapp-registry/client`)
- **be**: Backend package
- **fe**: Frontend package
- **docs**: Documentation changes
- **ci**: CI/CD changes
- **deps**: Dependency updates

## Examples

### CLI Package Releases

```bash
# Patch release (bug fix)
git commit -m "fix(cli): resolve command parsing issue"

# Minor release (new feature)
git commit -m "feat(cli): add new list command"

# Patch release (chore)
git commit -m "chore(cli): update dependencies"
```

### Client Library Releases

```bash
# Patch release (bug fix)
git commit -m "fix(lib): fix API response handling"

# Minor release (new feature)
git commit -m "feat(lib): add new API endpoint support"

# Patch release (chore)
git commit -m "chore(lib): update axios version"
```

### Backend Releases

```bash
# Patch release (bug fix)
git commit -m "fix(be): fix health endpoint response"

# Minor release (new feature)
git commit -m "feat(be): add new API endpoint"

# Patch release (chore)
git commit -m "chore(be): update fastify version"
```

### Frontend Releases

```bash
# Patch release (bug fix)
git commit -m "fix(fe): fix navigation issue"

# Minor release (new feature)
git commit -m "feat(fe): add new page component"

# Patch release (chore)
git commit -m "chore(fe): update React version"
```

### Monorepo-wide Releases

```bash
# Patch release (bug fix)
git commit -m "fix: resolve build issues across packages"

# Minor release (new feature)
git commit -m "feat: add new shared utilities"

# Patch release (chore)
git commit -m "chore: update all dependencies"
```

### Documentation Changes

```bash
# Documentation updates (no release)
git commit -m "docs: update README with new examples"

# Documentation updates for specific package
git commit -m "docs(cli): add usage examples"
```

## Release Triggers

| Commit Message   | Package        | Action               |
| ---------------- | -------------- | -------------------- |
| `fix(cli): ...`  | CLI            | Patch release to npm |
| `feat(cli): ...` | CLI            | Minor release to npm |
| `fix(lib): ...`  | Client Library | Patch release to npm |
| `feat(lib): ...` | Client Library | Minor release to npm |
| `fix(be): ...`   | Backend        | Docker image build   |
| `feat(be): ...`  | Backend        | Docker image build   |
| `fix(fe): ...`   | Frontend       | Build artifacts      |
| `feat(fe): ...`  | Frontend       | Build artifacts      |
| `fix: ...`       | All            | Monorepo release     |
| `feat: ...`      | All            | Monorepo release     |

## Testing the Flow

### Current Status: DRY RUN MODE

All releases are currently in **DRY RUN MODE** for testing. The workflow will:

1. ✅ Detect commit message patterns
2. ✅ Show what would be released
3. ✅ Display package and version info
4. ❌ **NOT** actually publish to npm
5. ❌ **NOT** create GitHub releases
6. ❌ **NOT** create tags

### Test Commits

Try these commit messages to test the flow:

```bash
# Test CLI release detection
git commit -m "fix(cli): test dry run mode"

# Test client library release detection
git commit -m "feat(lib): test dry run mode"

# Test backend release detection
git commit -m "fix(be): test dry run mode"

# Test frontend release detection
git commit -m "feat(fe): test dry run mode"

# Test monorepo release detection
git commit -m "fix: test monorepo dry run mode"
```

### Enabling Real Releases

To enable actual releases, uncomment the semantic-release commands in `.github/workflows/semantic-release.yml`:

```yaml
# Change from:
# npx semantic-release --dry-run

# To:
npx semantic-release
```

## Best Practices

1. **Be specific**: Use the appropriate scope for your changes
2. **Be descriptive**: Write clear, concise descriptions
3. **Test first**: Always test in dry-run mode before enabling real releases
4. **Review**: Check the CI logs to ensure the right package is being released
5. **Incremental**: Start with one package, then expand to others

## Troubleshooting

### Common Issues

1. **No release triggered**: Check if commit message matches expected pattern
2. **Wrong package released**: Verify scope in commit message
3. **Multiple releases**: Ensure commit message has only one scope
4. **Dry run not working**: Check workflow configuration

### Debug Commands

```bash
# Test semantic-release locally (CLI)
cd packages/cli
npx semantic-release --dry-run

# Test semantic-release locally (Client Library)
cd packages/client-library
npx semantic-release --dry-run
```
