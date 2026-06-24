# scripts/fwi-validation/compute_ours_grid.py
"""Re-validate OUR gridded FWI (p95) vs CEMS. Mirrors compute_ours.py but, instead
of one representative point, computes the FWI at a SUBSET of the zone's grid
points, chains each point's state independently, and aggregates each day by p95 —
the same aggregation production uses. Writes ours_tdf.csv; then re-run compare.py.

REDUCED SCOPE (sanity check): the full grid (32+39 points) x 10 years exceeds the
Open-Meteo archive free-tier weight limit (429 Too Many Requests). This is a
SANITY CHECK — does p95-over-grid degrade the CEMS correlation vs single-point? —
so we sample every SUBSET_STEP-th land point over recent years only. Statistically
ample (~1000+ days) and far lighter on the API. Production still uses the full
grid; only this offline validation samples. Set SUBSET_STEP=1 / widen YEARS for a
full-fidelity run if a paid Open-Meteo key is available."""
import sys
import time
import pathlib
import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from fire_danger import fwi as fwi_eq          # noqa: E402
from fire_danger import openmeteo, grids       # noqa: E402
from fire_danger.aggregate import aggregate_fwi  # noqa: E402
from fwi_cache import cached_fetch             # noqa: E402

# validation point name -> production zone id
ZONE_OF = {"rio_grande": "tdf-norte-estepa", "ushuaia": "tdf-sur-bosque"}
YEARS = list(range(2013, 2023))  # 10 years for stable tail percentiles (calibration)
SUBSET_STEP = 1                  # FULL grid (all land points) — isolate the sampling factor
SPINUP_DROP = 30
_RETRY_DELAYS = [5, 15, 30, 60]  # seconds between retries on a minutely / unspecified 429
CACHE_DIR = pathlib.Path(__file__).resolve().parent / "om_cache"
_HOURLY_WAIT = 900       # 15 min: the free-tier *hourly* budget refills over the clock hour
_MAX_HOURLY_WAITS = 20   # ~5 h of patience before giving up on a stuck hourly limit


class DailyQuotaExceeded(RuntimeError):
    """Open-Meteo's *daily* free-tier budget is exhausted — cannot proceed until it
    resets (next UTC day). Distinct from the hourly limit, which we just wait out.
    The resumable cache means a re-run tomorrow continues from where this stopped."""


def _fetch_with_retry(points, start, end):
    """Fetch history for many points, pacing around the Open-Meteo free-tier limits.

    The 429 *reason* (in the response body) tells us which budget we hit:
    - 'hourly'  -> wait it out (the hourly bucket refills); retry up to _MAX_HOURLY_WAITS.
    - 'daily'   -> raise DailyQuotaExceeded; today's budget is gone, resume tomorrow.
    - else (minutely / transient) -> short exponential backoff."""
    import requests
    hourly_waits = 0
    short_idx = 0
    while True:
        try:
            return openmeteo.fetch_history_multi(points, start, end)
        except requests.exceptions.HTTPError as exc:
            resp = exc.response
            if resp is None or resp.status_code != 429:
                raise
            try:
                reason = (resp.json() or {}).get("reason", "") or ""
            except Exception:  # noqa: BLE001 — body may not be JSON
                reason = (resp.text or "")[:200]
            low = reason.lower()
            if "daily" in low:
                raise DailyQuotaExceeded(reason) from exc
            if "hourly" in low:
                hourly_waits += 1
                if hourly_waits > _MAX_HOURLY_WAITS:
                    raise RuntimeError(f"hourly limit not clearing after {hourly_waits} waits") from exc
                print(f"  hourly limit; waiting {_HOURLY_WAIT}s "
                      f"({hourly_waits}/{_MAX_HOURLY_WAITS})...", flush=True)
                time.sleep(_HOURLY_WAIT)
                continue
            delay = _RETRY_DELAYS[min(short_idx, len(_RETRY_DELAYS) - 1)]
            short_idx += 1
            if short_idx > 8:
                raise
            print(f"  rate-limit ({reason or '429'}); waiting {delay}s...", flush=True)
            time.sleep(delay)
            continue


def _series_for_point(days):
    state = fwi_eq.DEFAULT_STATE
    out = []
    for d in days:
        r = fwi_eq.fwi_from_weather(temp=d.temp, rh=d.rh, wind=d.wind, rain=d.precip,
                                    month=d.month, hemisphere="south", prev=state)
        s = r["state"]
        state = (s["ffmc"], s["dmc"], s["dc"])
        out.append((d.date, r["fwi"]))
    return out[SPINUP_DROP:]


def compute_zone(zone_id):
    points = list(grids.grid_points(zone_id))[::SUBSET_STEP]  # reduced sample (see docstring)
    # fetch history per point, year by year (archive responses get large)
    per_point_days = [[] for _ in points]
    for year in YEARS:
        # Cache key encodes zone + year + point count so a SUBSET_STEP change misses
        # the cache. Resumable: a 429 mid-run leaves earlier (zone, year) files on
        # disk; the next run reads them and only fetches what's still missing.
        key = f"{zone_id}-{year}-{len(points)}pts"
        cached = (CACHE_DIR / f"{key}.json").exists()
        print(f"  year {year}{' (cached)' if cached else ''}...")
        blocks = cached_fetch(
            CACHE_DIR, key,
            lambda y=year: _fetch_with_retry(points, f"{y}-01-01", f"{y}-12-31"))
        for i, days in enumerate(blocks):
            per_point_days[i].extend(days)
        if not cached:
            time.sleep(2)  # courtesy pause only when we actually hit the API

    per_point_series = [dict(_series_for_point(days)) for days in per_point_days]
    dates = sorted(per_point_series[0])
    rows = []
    for date in dates:
        fwis = [s[date] for s in per_point_series if date in s]
        rows.append({"date": date, "fwi_ours": round(aggregate_fwi(fwis), 3)})
    return rows


if __name__ == "__main__":
    all_rows = []
    for name, zid in ZONE_OF.items():
        sampled = len(list(grids.grid_points(zid))[::SUBSET_STEP])
        full = len(grids.grid_points(zid))
        print(f"Computing {name} over grid ({sampled} of {full} points, {YEARS[0]}-{YEARS[-1]})...")
        for r in compute_zone(zid):
            all_rows.append({"point": name, **r})
    pd.DataFrame(all_rows).to_csv("ours_tdf.csv", index=False)
    print(f"wrote ours_tdf.csv: {len(all_rows)} rows")
