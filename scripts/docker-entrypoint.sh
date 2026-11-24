#!/bin/sh
#
# Docker entrypoint: runs migrations, then the app.
# Equivalent to the PowerShell supervisor.ps1, but simplified for containers
# (Docker orchestration handles process restart, not us).

set -e

APP_DIR="/app"
SERVER_DIR="$APP_DIR/server"
DATA_DIR="$APP_DIR/data"
LOG_DIR="$APP_DIR/logs"

echo "[CRM] Starting up..."

# Ensure data directory exists
mkdir -p "$DATA_DIR" "$LOG_DIR"

# Set environment defaults
export NODE_ENV=${NODE_ENV:-production}
export PORT=${PORT:-5173}
export HOST=${HOST:-0.0.0.0}
export DATABASE_URL=${DATABASE_URL:-file:$DATA_DIR/crm.db}
export CLIENT_DIST="$APP_DIR/client/dist"

echo "[CRM] Environment:"
echo "  NODE_ENV: $NODE_ENV"
echo "  PORT: $PORT"
echo "  HOST: $HOST"
echo "  DATABASE_URL: $DATABASE_URL (SQLite at $DATA_DIR/crm.db)"
echo "  CLIENT_DIST: $CLIENT_DIST"

# Run Prisma migrations
echo "[CRM] Running database migrations..."
cd "$SERVER_DIR"
npx prisma migrate deploy

# Generate Prisma client (in case schema changed)
echo "[CRM] Generating Prisma client..."
npx prisma generate

# Start the app
echo "[CRM] Starting application..."
exec node "$SERVER_DIR/dist/main.js"
