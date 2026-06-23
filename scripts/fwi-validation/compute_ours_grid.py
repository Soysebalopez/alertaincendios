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
_RETRY_DELAYS = [5, 15, 30, 60]  # seconds between retries on 429
CACHE_DIR = pathlib.Path(__file__).resolve().parent / "om_cache"


def _fetch_with_retry(points, start, end):
    """Fetch history for many points, retrying on 429 with exponential backoff."""
    import requests
    for attempt, delay in enumerate(_RETRY_DELAYS + [None]):
        try:
            return openmeteo.fetch_history_multi(points, start, end)
        except requests.exceptions.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 429 and delay is not None:
                print(f"  429 rate-limit; waiting {delay}s before retry {attempt + 1}...")
                time.sleep(delay)
                continue
            raise


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
