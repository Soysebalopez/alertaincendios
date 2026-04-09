#!/bin/bash
# Sync NASA FIRMS fire data to Supabase cache.
# Run this from a residential IP every 15 minutes.
#
# crontab entry:
#   */15 * * * * /Volumes/Samsung/Web/alertaincendios/scripts/sync-fires.sh >> /tmp/fires-sync.log 2>&1
#
# After syncing fires, also triggers the alert evaluation.

SITE="https://alertaincendios.vercel.app"
SECRET="fad9f905b2213f552215999c370a38105b024c457b64dd40ef5de5bf0e9fd876"

echo "[$(date)] Syncing fires..."
SYNC_RESULT=$(curl -s "${SITE}/api/fires/sync?secret=${SECRET}")
echo "[$(date)] Sync: ${SYNC_RESULT}"

echo "[$(date)] Running alerts..."
ALERT_RESULT=$(curl -s "${SITE}/api/alerts?secret=${SECRET}")
echo "[$(date)] Alerts: ${ALERT_RESULT}"
