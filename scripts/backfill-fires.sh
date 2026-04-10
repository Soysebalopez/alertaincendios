#!/bin/bash
# Backfill fires_daily_history from FIRMS archive
# Usage: ./scripts/backfill-fires.sh [days_back]
# Default: 365 days back

export LC_NUMERIC=C  # Force dot as decimal separator

MAP_KEY="56276c396c1241ed29f501e8dc0f2c2d"
BBOX="-73.6,-55.1,-53.6,-21.8"
SUPABASE_TOKEN="sbp_c6c178e838144b3ca30834ebf49ac47306d8a7f3"
SUPABASE_URL="https://api.supabase.com/v1/projects/qmzuwnilehldvobjsbcs/database/query"
DAYS_BACK=${1:-365}
CHUNK=5

echo "Backfilling $DAYS_BACK days of fire data..."

OFFSET=0
TOTAL_INSERTED=0

while [ $OFFSET -lt $DAYS_BACK ]; do
  END_DATE=$(date -v-${OFFSET}d +%Y-%m-%d 2>/dev/null || date -d "-${OFFSET} days" +%Y-%m-%d)

  REMAINING=$((DAYS_BACK - OFFSET))
  CURRENT_CHUNK=$CHUNK
  if [ $REMAINING -lt $CHUNK ]; then
    CURRENT_CHUNK=$REMAINING
  fi

  echo -n "Fetching $END_DATE (${CURRENT_CHUNK}d)... "

  CSV=$(curl -s "https://firms.modaps.eosdis.nasa.gov/api/area/csv/${MAP_KEY}/VIIRS_SNPP_NRT/${BBOX}/${CURRENT_CHUNK}/${END_DATE}" 2>/dev/null)

  if echo "$CSV" | head -1 | grep -q "latitude"; then
    DAILY=$(echo "$CSV" | tail -n +2 | LC_NUMERIC=C awk -F',' '
      NF >= 13 && $1 != "" {
        date = $6
        conf = $10
        frp = $13 + 0
        count[date]++
        frp_sum[date] += frp
        if (conf == "high" || conf == "h") high[date]++
      }
      END {
        for (d in count) {
          avg = (count[d] > 0) ? frp_sum[d] / count[d] : 0
          hc = (d in high) ? high[d] : 0
          printf "%s|%d|%.2f|%d\n", d, count[d], avg, hc
        }
      }
    ')

    CHUNK_COUNT=0
    while IFS='|' read -r date count avg_frp high_conf; do
      if [ -n "$date" ] && [ -n "$count" ]; then
        SQL="INSERT INTO fires_daily_history (date, count, avg_frp, high_conf) VALUES ('${date}', ${count}, ${avg_frp}, ${high_conf}) ON CONFLICT (date) DO UPDATE SET count = EXCLUDED.count, avg_frp = EXCLUDED.avg_frp, high_conf = EXCLUDED.high_conf;"

        RESULT=$(curl -s -X POST "$SUPABASE_URL" \
          -H "Authorization: Bearer $SUPABASE_TOKEN" \
          -H "Content-Type: application/json" \
          -d "{\"query\": \"$SQL\"}")

        CHUNK_COUNT=$((CHUNK_COUNT + 1))
        TOTAL_INSERTED=$((TOTAL_INSERTED + 1))
      fi
    done <<< "$DAILY"

    echo "${CHUNK_COUNT} days"
  else
    echo "no data"
  fi

  OFFSET=$((OFFSET + CHUNK))
  sleep 1
done

echo ""
echo "Done! Total: $TOTAL_INSERTED days inserted"
