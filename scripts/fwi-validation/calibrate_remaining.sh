#!/bin/sh
# Self-healing calibration of the remaining FWI zones (Catamarca + Phase 3).
# Waits out the Open-Meteo daily quota: each pass calibrates whatever fits in the
# current quota window (add_province is idempotent — skips already-calibrated zones,
# stops clean on DailyQuotaExceeded); then sleeps and retries until all 35 zones are
# in danger_thresholds.json. Resumable: the om_cache persists, so a re-launch
# continues. Run in the background.
cd "$(dirname "$0")" || exit 1
PROVS="catamarca salta jujuy tucuman santiago-del-estero chaco formosa corrientes entre-rios santa-fe misiones buenos-aires"
TARGET=35   # 10 Phase-1 + 10 Phase-2 (now) + 2 Catamarca + 13 Phase-3 = 35
done_count() { venv/bin/python -c "import json;print(len(json.load(open('../../fire_danger/danger_thresholds.json'))))" 2>/dev/null || echo 0; }

for pass in $(seq 1 120); do
  start=$(done_count)
  echo "========== PASS $pass | $(date -u '+%Y-%m-%d %H:%MUTC') | calibrated ${start}/${TARGET} =========="
  if [ "$start" -ge "$TARGET" ]; then echo "ALL ${TARGET} ZONES CALIBRATED"; break; fi
  for p in $PROVS; do
    echo "----- add_province $p -----"
    venv/bin/python add_province.py "$p" 2>&1 || echo "(stopped on $p — likely DailyQuotaExceeded)"
  done
  n=$(done_count)
  echo "========== after pass $pass: ${n}/${TARGET} =========="
  if [ "$n" -ge "$TARGET" ]; then echo "ALL ${TARGET} ZONES CALIBRATED"; break; fi
  echo "sleeping 3600s before retry (waiting for hourly/daily quota)..."
  sleep 3600
done
echo "WRAPPER DONE: $(done_count)/${TARGET} zones calibrated"
