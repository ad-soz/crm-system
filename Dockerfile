# Multi-stage build: compile the app and client in one image, run in a lean runtime.

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copy workspace root files
COPY package*.json ./
COPY tsconfig*.json ./

# Copy server and client workspaces
COPY server ./server
COPY client ./client
COPY server/prisma ./server/prisma

# Install dependencies
RUN npm ci

# Generate Prisma client BEFORE build (TypeScript needs the types)
RUN cd server && npx prisma generate && cd ..

# Build both server and client
RUN npm run build

# Stage 2: Runtime
FROM node:22-alpine

WORKDIR /app

# Install dumb-init and openssl for Prisma
RUN apk add --no-cache dumb-init openssl

# Create data directory for SQLite database and backups
RUN mkdir -p /app/data /app/logs

# Copy package files
COPY package*.json ./
COPY server/package.json ./server/

# Install production dependencies only
RUN npm ci --omit=dev

# Copy Prisma schema and migrations
COPY server/prisma ./server/prisma

# Copy built artifacts from builder
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/client/dist ./client/dist

# Copy startup script
COPY scripts/docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

# Expose port
EXPOSE 5173

# Health check: ping the API health endpoint
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5173/api/health', (r) => { if (r.statusCode !== 200) throw new Error(r.statusCode); })" || exit 1

# Use dumb-init as the entry point to handle signals
ENTRYPOINT ["dumb-init", "--"]

# Run the app
CMD ["/app/docker-entrypoint.sh"]
