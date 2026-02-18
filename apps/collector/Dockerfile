# ============================================================
# Stage 1: Builder — compile TypeScript + install native deps
# ============================================================
FROM node:20-slim AS builder

# better-sqlite3 requires build tools for native compilation
RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 make g++ && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json ./
RUN npm install

# Copy source and compile
COPY tsconfig.json ./
COPY src/ src/
RUN npm run build

# ============================================================
# Stage 2: Runtime — minimal image, non-root user
# ============================================================
FROM node:20-slim AS runtime

# better-sqlite3 needs libstdc++ at runtime (already in node:20-slim)
# No extra apt packages needed.

WORKDIR /app

# Create non-root user
RUN groupadd --gid 1001 collector && \
    useradd --uid 1001 --gid collector --shell /bin/sh --create-home collector

# Copy production dependencies from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy compiled JS
COPY --from=builder /app/dist ./dist

# Create data directory for SQLite volume mount
RUN mkdir -p /data && chown collector:collector /data

# Install curl for healthcheck
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Switch to non-root
USER collector

EXPOSE 3001

ENV PORT=3001
ENV DB_PATH=/data/market-data.db

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
