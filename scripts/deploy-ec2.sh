#!/usr/bin/env bash
set -euo pipefail

# Deploys the backend on an EC2 host.
# Expected on server:
# - Node.js 18+
# - PM2 installed globally
# - .env file present in project root with production values
#
# Usage:
#   BRANCH=main APP_NAME=rnr-backend ./scripts/deploy-ec2.sh

BRANCH="${BRANCH:-main}"
APP_NAME="${APP_NAME:-rnr-backend}"
PROJECT_DIR="${PROJECT_DIR:-$(pwd)}"
export NODE_ENV=production

cd "$PROJECT_DIR"

echo "[1/7] Fetching latest code from $BRANCH..."
git fetch origin "$BRANCH"
git checkout "$BRANCH"
git pull --ff-only origin "$BRANCH"

echo "[2/7] Installing dependencies..."
npm ci

echo "[3/7] Generating Prisma client..."
npx prisma generate

echo "[4/7] Applying production migrations..."
# Uses 'migrate deploy' (never 'migrate dev') — safe for production, no resets.
# If a new migration was already applied manually, resolve it first:
#   npx prisma migrate resolve --applied <migration_name>
npx prisma migrate deploy

echo "[5/7] Building TypeScript..."
npm run build

echo "[6/7] Restarting app with PM2..."
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME"
else
  pm2 start dist/index.js --name "$APP_NAME"
fi

echo "[7/7] Saving PM2 process list..."
pm2 save
# Ensure PM2 restarts automatically if the server reboots.
# Only needs to run once, but is safe to run on every deploy.
pm2 startup --no-daemon 2>/dev/null || true

echo "Deployment complete."
