"""Fire-danger (FWI) daily sync endpoint.

Triggered by Supabase pg_cron once a day via pg_net HTTP GET. For each TDF zone:
read the carried (ffmc,dmc,dc) state (seed via spin-up if absent), fetch the
16-day Open-Meteo forecast, chain the FWI forward, classify, and persist the new
state + forecast rows to Supabase.

URL: GET /api/fire-danger-sync?secret=<CRON_SECRET>
Auth: same CRON_SECRET pattern as /api/goes-sync.

Env vars: CRON_SECRET, NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL),
SUPABASE_SERVICE_ROLE_KEY.
"""
from __future__ import annotations

import json
import os
import time
import urllib.parse
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler

from fire_danger import openmeteo, supabase_io, spinup
from fire_danger.pipeline import compute_zone_forecast
from fire_danger.zones import ZONES

SPINUP_DAYS = 30


def final_state_for_today(results, start_state, zone):
    """Re-derive the state right after today's day (results[0]) for the rolling
    carry. Recompute one step so the stored state is today's, not day+16's."""
    from fire_danger import fwi
    if not results:
        return start_state
    r0 = results[0]
    out = fwi.fwi_from_weather(
        temp=r0["temp"], rh=r0["rh"], wind=r0["wind"], rain=r0["precip"],
        month=int(r0["target_date"][5:7]), hemisphere=zone.hemisphere, prev=start_state)
    s = out["state"]
    return (s["ffmc"], s["dmc"], s["dc"])


def run_pipeline() -> dict:
    t0 = time.time()
    today = datetime.now(timezone.utc).date().isoformat()
    supabase_io.seed_zones(ZONES)

    zone_summaries = []
    for zone in ZONES:
        state = supabase_io.latest_state(zone.id)
        seeded = False
        if state is None:
            end = datetime.now(timezone.utc).date() - timedelta(days=1)
            start = end - timedelta(days=SPINUP_DAYS)
            history = openmeteo.fetch_history(zone.lat, zone.lng, start.isoformat(), end.isoformat())
            state = tuple(spinup.replay_state(history, zone.hemisphere).values())
            seeded = True

        forecast = openmeteo.fetch_forecast(zone.lat, zone.lng, days=16)
        results, _final_state = compute_zone_forecast(forecast, state, zone.hemisphere)

        supabase_io.insert_forecast(supabase_io.forecast_rows(zone.id, today, results))
        today_state = final_state_for_today(results, state, zone)
        supabase_io.upsert_state([supabase_io.state_row(zone.id, today, today_state)])
        zone_summaries.append({
            "zone": zone.id, "seeded": seeded, "days": len(results),
            "today_class": results[0]["danger_class"] if results else None,
        })

    return {"ok": True, "date": today, "zones": zone_summaries,
            "total_seconds": round(time.time() - t0, 2)}


class handler(BaseHTTPRequestHandler):  # noqa: N801 — Vercel requires lowercase
    def _write_json(self, status: int, body: dict) -> None:
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(body).encode("utf-8"))

    def _is_authorized(self) -> bool:
        expected = os.environ.get("CRON_SECRET")
        if not expected:
            return False
        parsed = urllib.parse.urlparse(self.path)
        qs = urllib.parse.parse_qs(parsed.query)
        if qs.get("secret", [None])[0] == expected:
            return True
        auth_header = self.headers.get("Authorization", "") or ""
        return auth_header.startswith("Bearer ") and auth_header[7:] == expected

    def do_GET(self):  # noqa: N802
        if not self._is_authorized():
            self._write_json(401, {"error": "Unauthorized"})
            return
        try:
            self._write_json(200, run_pipeline())
        except Exception as exc:  # noqa: BLE001
            self._write_json(500, {"ok": False, "error": f"{type(exc).__name__}: {exc}"})
