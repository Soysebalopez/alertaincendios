#!/bin/bash
# Sync NASA FIRMS fire data to Supabase cache.
# Run this from a residential IP every 15 minutes.
#
# Setup: copy scripts/sync-fires.env.example to scripts/sync-fires.env,
# fill in CRON_SECRET (the same value set in Vercel env), and chmod 600.
# The .env file is .gitignored.
#
# crontab entry:
#   */15 * * * * /Volumes/Samsung/Web/alertaincendios/scripts/sync-fires.sh >> /tmp/fires-sync.log 2>&1
#
# After syncing fires, also triggers the alert evaluation.

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load secrets from local .env file (NOT committed to repo)
if [ -f "${SCRIPT_DIR}/sync-fires.env" ]; then
  # shellcheck disable=SC1091
  source "${SCRIPT_DIR}/sync-fires.env"
fi

: "${CRON_SECRET:?CRON_SECRET is not set — create scripts/sync-fires.env from sync-fires.env.example}"

SITE="${SITE_URL:-https://alertaincendios.vercel.app}"

echo "[$(date)] Syncing fires..."
SYNC_RESULT=$(curl -s "${SITE}/api/fires/sync?secret=${CRON_SECRET}")
echo "[$(date)] Sync: ${SYNC_RESULT}"

echo "[$(date)] Running alerts..."
ALERT_RESULT=$(curl -s "${SITE}/api/alerts?secret=${CRON_SECRET}")
echo "[$(date)] Alerts: ${ALERT_RESULT}"

echo "[$(date)] Running lightning alerts..."
LIGHTNING_RESULT=$(curl -s "${SITE}/api/lightning-alerts?secret=${CRON_SECRET}")
echo "[$(date)] Lightning: ${LIGHTNING_RESULT}"
