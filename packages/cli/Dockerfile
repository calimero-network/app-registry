# Multi-stage build for CLI
FROM node:18-alpine AS builder

# Install pnpm
RUN npm install -g pnpm@8

# Set working directory
WORKDIR /app

# Copy root package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy all package.json files
COPY packages/cli/package.json ./packages/cli/
COPY packages/client-library/package.json ./packages/client-library/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/cli/src ./packages/cli/src
COPY packages/cli/tsconfig.json ./packages/cli/
COPY packages/cli/tsup.config.ts ./packages/cli/
COPY packages/client-library/src ./packages/client-library/src
COPY packages/client-library/tsconfig.json ./packages/client-library/
COPY packages/client-library/tsup.config.ts ./packages/client-library/

# Build packages
RUN pnpm --filter client-library build
RUN pnpm --filter cli build

# Production stage
FROM node:18-alpine AS production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create app user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Set working directory
WORKDIR /app

# Copy built packages
COPY --from=builder --chown=nodejs:nodejs /app/packages/cli/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/packages/cli/package.json ./package.json

# Switch to non-root user
USER nodejs

# Expose port (if needed for any CLI features)
EXPOSE 3000

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Default command
CMD ["node", "dist/index.js", "--help"]
