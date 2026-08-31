# Multi-stage build for Calimero Registry V1 API
FROM node:24-alpine AS base

# Pinned to match the root package.json "packageManager" and the lockfile that
# pnpm 8 generated. Unpinned, this tracked pnpm@latest and broke the image the
# day pnpm started verifying the package-manager identity against the lockfile.
RUN npm install -g pnpm@8.15.0

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY packages/backend/package.json ./packages/backend/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/backend/ ./packages/backend/

# Build stage
FROM base AS build

# Build the application
WORKDIR /app/packages/backend
RUN npm run build

# Production stage
FROM node:24-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S registry -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY packages/backend/package.json ./packages/backend/

# Install pnpm and dependencies (same pin as the base stage)
RUN npm install -g pnpm@8.15.0
RUN pnpm install --frozen-lockfile --prod

# Copy source code
COPY packages/backend/ ./packages/backend/

# Create data directory
RUN mkdir -p /app/data && chown -R registry:nodejs /app

# Switch to non-root user
USER registry

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/healthz', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080
ENV HOST=0.0.0.0

# Start the application
CMD ["node", "packages/backend/src/server.js"]
