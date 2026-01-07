# Backend Server Dockerfile - Optimized for Turborepo monorepo
FROM node:22-alpine AS base

# Builder stage - prunes monorepo and installs dependencies
FROM base AS builder
RUN apk update && apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# Install turbo globally
RUN npm install -g turbo@^2

# Copy entire monorepo for pruning
COPY . .

# Generate a partial monorepo with pruned lockfile for server workspace
RUN turbo prune server --docker

# Installer stage - installs dependencies from pruned workspace
FROM base AS installer  
RUN apk update && apk add --no-cache libc6-compat python3 make g++
WORKDIR /app

# Copy lockfile and package.json files from pruned workspace
COPY --from=builder /app/out/json/ .
RUN npm install

# Copy source files and build
COPY --from=builder /app/out/full/ .

RUN rm -rf packages/db/generated/ packages/db/dist/
RUN npm run generate --filter=@repo/db
RUN npx turbo build --filter=@repo/db
RUN npx turbo build --filter=@repo/types
RUN npx turbo build --filter=@repo/command-security

# Build the server with inline commands (replicating build script logic)
WORKDIR /app/apps/server
RUN rm -rf dist && \
  echo "📦 Compiling TypeScript..." && \
  npx tsc && \
  echo "🔗 Flattening build structure..." && \
  if [ -d "dist/apps/server/src" ]; then \
  mkdir -p dist_temp && \
  mv dist/apps/server/src/* dist_temp/ && \
  rm -rf dist/apps && \
  mv dist_temp/* dist/ && \
  rm -rf dist_temp; \
  fi && \
  echo "🔗 Resolving path aliases..." && \
  npx tsc-alias && \
  echo "📄 Copying tool instruction files..." && \
  mkdir -p dist/agent/tools/prompts && \
  for tool_dir in src/agent/tools/prompts/*/; do \
  if [ -d "$tool_dir" ]; then \
  tool_name=$(basename "$tool_dir") && \
  mkdir -p "dist/agent/tools/prompts/$tool_name" && \
  cp "$tool_dir"*.md "dist/agent/tools/prompts/$tool_name/" 2>/dev/null || true; \
  fi; \
  done && \
  echo "✅ Server build complete!"

# Runtime stage - minimal production image
FROM base AS runner
WORKDIR /app

# Install runtime dependencies
RUN apk add --no-cache \
  bash \
  git \
  openssh-client \
  curl \
  && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 server && \
  adduser -D -u 1001 -G server server

# Copy built application and dependencies
COPY --from=installer --chown=server:server /app/apps/server/dist ./apps/server/dist
COPY --from=installer --chown=server:server /app/apps/server/package.json ./apps/server/package.json
COPY --from=installer --chown=server:server /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=installer --chown=server:server /app/node_modules ./node_modules
COPY --from=installer --chown=server:server /app/packages ./packages

# Switch to non-root user
USER server

# Environment variables
ENV NODE_ENV=production
ENV PORT=4000

# Expose port
EXPOSE 4000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

# Start the server
CMD ["node", "apps/server/dist/server.js"]