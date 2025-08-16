# SSApp Registry CLI

Command-line interface for interacting with the SSApp Registry.

## Installation

```bash
npm install -g @xilos/ssapp-registry-cli
```

## Usage

```bash
ssapp-registry --help
```

## Development

```bash
# Install dependencies
pnpm install

# Build the CLI
pnpm build

# Run tests
pnpm test

# Run in development mode
pnpm dev
```

## Versioning Strategy

This CLI package uses **independent versioning** from the main monorepo. This means:

- CLI versions are managed separately from backend/frontend versions
- CLI releases don't affect other packages in the monorepo
- CLI has its own release cycle and version numbers

### Current Version: 0.0.0

Starting from version 0.0.0 for initial development.

### Release Process

#### Manual Release (Recommended)

1. **Bump version** (choose one):

   ```bash
   # Patch release (bug fixes)
   pnpm release:patch

   # Minor release (new features)
   pnpm release:minor

   # Major release (breaking changes)
   pnpm release:major
   ```

2. **Push the tag**:
   ```bash
   git push origin main --tags
   ```

#### What happens during release:

1. Version is bumped in `package.json`
2. Git commit is created with version bump
3. Git tag is created (e.g., `cli-v0.0.1`)
4. CI automatically:
   - Builds and tests the CLI
   - Publishes to npm as `@xilos/ssapp-registry-cli`
   - Creates GitHub release

### Version Scripts

- `pnpm version:patch` - Bump patch version (0.0.0 → 0.0.1)
- `pnpm version:minor` - Bump minor version (0.0.0 → 0.1.0)
- `pnpm version:major` - Bump major version (0.0.0 → 1.0.0)
- `pnpm release:patch` - Full patch release process
- `pnpm release:minor` - Full minor release process
- `pnpm release:major` - Full major release process

### Tag Convention

CLI releases use the tag pattern: `cli-v*` (e.g., `cli-v0.0.1`, `cli-v1.0.0`)

This ensures CLI releases are completely separate from other package releases.

## Architecture

- **Framework**: Commander.js for CLI structure
- **Styling**: Chalk for colored output
- **Spinners**: Ora for loading indicators
- **Tables**: Table for formatted output
- **Build**: tsup for fast TypeScript bundling
- **Testing**: Vitest for unit tests

## Contributing

1. Make changes in `src/`
2. Add tests in `src/test/`
3. Run `pnpm test` to ensure tests pass
4. Run `pnpm build` to ensure build works
5. Create a release when ready
