"""Fire-danger (FWI) daily sync endpoint.

Triggered by Supabase pg_cron once a day via pg_net HTTP GET. For each TDF zone:
read the carried per-point (ffmc,dmc,dc) grid state (seed via spin-up if absent
or if the grid shape changed), fetch the 16-day Open-Meteo forecast for every
land grid point in one request, chain the FWI forward per point, aggregate the
zone value as the p95 across points, classify, and persist the new per-point
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

from fire_danger import grids, openmeteo, supabase_io, spinup
from fire_danger.pipeline import compute_zone_forecast_grid
from fire_danger.zones import ZONES

SPINUP_DAYS = 30


def _sync_zone(zone, today: str) -> dict:
    """Compute and persist one zone over its land grid. Each grid point carries
    its own FWI state; the zone value is the p95 across points. Raises on failure
    so the caller isolates it per zone."""
    points = grids.grid_points(zone.id) or ((zone.lat, zone.lng),)

    states = supabase_io.latest_grid_state(zone.id, before_date=today)
    seeded = False
    # Re-seed when there is no grid state yet OR the grid changed shape (e.g. the
    # density was regenerated) — never chain misaligned per-point states.
    if states is None or len(states) != len(points):
        end = datetime.now(timezone.utc).date() - timedelta(days=1)
        start = end - timedelta(days=SPINUP_DAYS)
        histories = openmeteo.fetch_history_multi(list(points), start.isoformat(), end.isoformat())
        states = [tuple(spinup.replay_state(h, zone.hemisphere).values()) for h in histories]
        seeded = True

    forecasts = openmeteo.fetch_forecast_multi(list(points), days=16)
    results, carry_states = compute_zone_forecast_grid(forecasts, states, zone.hemisphere, zone.id)

    supabase_io.insert_forecast(supabase_io.forecast_rows(zone.id, today, results))
    supabase_io.upsert_state([supabase_io.grid_state_row(zone.id, today, carry_states)])
    return {
        "zone": zone.id, "seeded": seeded, "points": len(points), "days": len(results),
        "today_class": results[0]["danger_class"] if results else None,
    }


def run_pipeline() -> dict:
    t0 = time.time()
    today = datetime.now(timezone.utc).date().isoformat()

    seed_error = None
    try:
        supabase_io.seed_zones(ZONES)
    except Exception as exc:  # noqa: BLE001 — best-effort; per-zone writes still surface table errors
        seed_error = f"{type(exc).__name__}: {exc}"

    # Zones are independent — a failure on one must not block the others.
    zone_summaries = []
    for zone in ZONES:
        try:
            zone_summaries.append(_sync_zone(zone, today))
        except Exception as exc:  # noqa: BLE001
            zone_summaries.append({"zone": zone.id, "error": f"{type(exc).__name__}: {exc}"})

    ok = seed_error is None and all("error" not in z for z in zone_summaries)
    result = {"ok": ok, "date": today, "zones": zone_summaries,
              "total_seconds": round(time.time() - t0, 2)}
    if seed_error:
        result["seed_error"] = seed_error
    return result


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
            result = run_pipeline()
            self._write_json(200 if result.get("ok") else 500, result)
        except Exception as exc:  # noqa: BLE001
            self._write_json(500, {"ok": False, "error": f"{type(exc).__name__}: {exc}"})
