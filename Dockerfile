# =============================================================================
# Reckoning — Production Multi-Stage Dockerfile
# =============================================================================
# Stage 1: Install dependencies and build all packages
# Stage 2: Lean runtime with only production artifacts
# =============================================================================

# --- Build stage ---
FROM node:20-bookworm-slim AS build

RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

WORKDIR /app

# Copy workspace config and lockfile first (layer caching)
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/
COPY packages/client/ packages/client/
COPY tsconfig.json ./

# Build in dependency order: shared -> server + client
RUN pnpm --filter @reckoning/shared build && \
    pnpm --filter @reckoning/server build && \
    pnpm --filter @reckoning/client build

# --- Production stage ---
FROM node:20-bookworm-slim AS production

RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

# sharp and better-sqlite3 need native deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips42 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace config
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy built artifacts from build stage
COPY --from=build /app/packages/shared/dist/ packages/shared/dist/
COPY --from=build /app/packages/server/dist/ packages/server/dist/
COPY --from=build /app/packages/client/dist/ packages/client/dist/

# Copy client HTML entry points (for reference, built files are in dist/)
COPY --from=build /app/packages/client/index.html packages/client/
COPY --from=build /app/packages/client/party-view.html packages/client/

# Create data directory for SQLite
RUN mkdir -p /app/data && chown -R node:node /app/data

# Environment
ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0
ENV RECKONING_DATA_DIR=/app/data
ENV RECKONING_STATIC_DIR=/app/packages/client/dist

EXPOSE 3001

USER node

CMD ["node", "packages/server/dist/index.js"]
