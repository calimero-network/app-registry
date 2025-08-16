# Versioning Strategy

This monorepo uses **independent versioning** for different packages to ensure that releases don't affect unrelated components.

## Package Versioning Overview

| Package            | Current Version | Versioning Strategy | Release Trigger |
| ------------------ | --------------- | ------------------- | --------------- |
| **Backend**        | 1.0.0           | Monorepo version    | `v*` tags       |
| **Frontend**       | 1.0.0           | Monorepo version    | `v*` tags       |
| **Client Library** | 1.0.0           | Monorepo version    | `v*` tags       |
| **CLI**            | 0.0.0           | **Independent**     | `cli-v*` tags   |

## CLI Independent Versioning

The CLI package (`@xilos/ssapp-registry-cli`) uses **completely independent versioning**:

### Why Independent Versioning?

- **Isolation**: CLI changes don't affect backend/frontend versions
- **Flexibility**: CLI can be released more frequently
- **User Experience**: Users get CLI updates without waiting for full monorepo releases
- **Maintenance**: Easier to manage CLI-specific features and fixes

### CLI Release Process

1. **Development**: Make changes to CLI code
2. **Version Bump**: Choose appropriate version increment
3. **Release**: Create tag and push
4. **Automation**: CI builds, tests, and publishes to npm

### CLI Version Commands

From monorepo root:

```bash
# Patch release (bug fixes)
pnpm cli:release:patch

# Minor release (new features)
pnpm cli:release:minor

# Major release (breaking changes)
pnpm cli:release:major
```

From CLI package directory:

```bash
# Same commands, direct access
pnpm release:patch
pnpm release:minor
pnpm release:major
```

### CLI Tag Convention

- **Pattern**: `cli-v*` (e.g., `cli-v0.0.1`, `cli-v1.0.0`)
- **Purpose**: Separate from main monorepo tags (`v*`)
- **Trigger**: Dedicated CLI release workflow

## Main Monorepo Versioning

Backend, Frontend, and Client Library share the same version:

- **Current**: 1.0.0
- **Tags**: `v*` (e.g., `v1.0.0`, `v1.1.0`)
- **Strategy**: Coordinated releases for all packages

## Release Workflows

### CLI Release Workflow (`.github/workflows/cli-release.yml`)

- **Trigger**: `cli-v*` tags
- **Actions**: Build CLI → Test → Publish to npm → Create GitHub release
- **Scope**: CLI package only

### Main Release Workflow (`.github/workflows/deploy.yml`)

- **Trigger**: `v*` tags
- **Actions**: Build all packages → Deploy backend → Deploy frontend
- **Scope**: Backend, Frontend, Client Library

### CI Workflow (`.github/workflows/ci.yml`)

- **Trigger**: All pushes to main/develop
- **Actions**: Build → Test → Docker images
- **Scope**: All packages (no publishing)

## Best Practices

### For CLI Development

1. Make changes in `packages/cli/src/`
2. Add tests in `packages/cli/src/test/`
3. Run `pnpm test:cli` to verify
4. Use `pnpm cli:release:patch` for bug fixes
5. Use `pnpm cli:release:minor` for new features
6. Use `pnpm cli:release:major` for breaking changes

### For Main Monorepo Development

1. Make changes across packages as needed
2. Run `pnpm quality` to verify all packages
3. Use semantic versioning for main releases
4. Tag with `v*` pattern for coordinated releases

### Version Numbering Guidelines

#### CLI (Independent)

- **0.0.x**: Initial development, breaking changes expected
- **0.x.0**: Feature additions, no breaking changes
- **x.0.0**: Stable API, breaking changes require major version

#### Main Monorepo (Coordinated)

- **1.0.x**: Bug fixes and patches
- **1.x.0**: New features, backward compatible
- **x.0.0**: Breaking changes

## Migration Path

When CLI reaches stability:

1. CLI can move to `1.0.0` independently
2. Main monorepo continues with its own versioning
3. CLI can optionally align with main monorepo later if desired

This strategy provides maximum flexibility while maintaining clear separation of concerns.
