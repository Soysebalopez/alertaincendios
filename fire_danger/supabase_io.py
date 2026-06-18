"""Supabase PostgREST I/O for the fire-danger engine. Direct `requests` to the
REST endpoint with the service-role key (same approach as api/goes-sync.py)."""
from __future__ import annotations

import os

import requests


def _base() -> tuple[str, str]:
    url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    return url.rstrip("/"), key


def _headers(key: str, prefer: str) -> dict:
    return {"apikey": key, "Authorization": f"Bearer {key}",
            "Content-Type": "application/json", "Prefer": prefer}


# --- pure payload shaping (unit-tested) ---
def forecast_rows(zone_id: str, computed_at: str, results: list[dict]) -> list[dict]:
    return [{
        "zone_id": zone_id, "computed_at": computed_at,
        "target_date": r["target_date"], "fwi": r["fwi"], "danger_class": r["danger_class"],
        "isi": r["isi"], "bui": r["bui"], "temp": r["temp"], "rh": r["rh"],
        "wind": r["wind"], "precip": r["precip"],
    } for r in results]


def state_row(zone_id: str, date: str, state: tuple[float, float, float]) -> dict:
    ffmc, dmc, dc = state
    return {"zone_id": zone_id, "date": date, "ffmc": ffmc, "dmc": dmc, "dc": dc}


# --- network I/O (covered by the e2e smoke test, not unit-mocked) ---
def latest_state(zone_id: str, before_date: str | None = None) -> tuple[float, float, float] | None:
    """Most-recent carried (ffmc, dmc, dc) for a zone, or None if never seeded.

    When `before_date` is given, only rows STRICTLY before it are considered, so
    a same-day re-run reads yesterday's state (not the one it just wrote) and the
    rolling chain stays idempotent — a second run on the same UTC date recomputes
    today identically instead of drifting the state one extra day."""
    url, key = _base()
    if not url or not key:
        return None
    params = {"zone_id": f"eq.{zone_id}", "select": "ffmc,dmc,dc,date",
              "order": "date.desc", "limit": 1}
    if before_date:
        params["date"] = f"lt.{before_date}"
    resp = requests.get(
        f"{url}/rest/v1/fire_danger_state",
        params=params,
        headers=_headers(key, "return=representation"), timeout=15)
    resp.raise_for_status()
    data = resp.json()
    if not data:
        return None
    r = data[0]
    return (r["ffmc"], r["dmc"], r["dc"])


def upsert_state(rows: list[dict]) -> None:
    url, key = _base()
    if not url or not key or not rows:
        return
    resp = requests.post(
        f"{url}/rest/v1/fire_danger_state?on_conflict=zone_id,date",
        headers={**_headers(key, "resolution=merge-duplicates,return=minimal")},
        json=rows, timeout=20)
    resp.raise_for_status()


def insert_forecast(rows: list[dict]) -> None:
    url, key = _base()
    if not url or not key or not rows:
        return
    # on_conflict must name the UNIQUE columns: fire_danger's PK is the identity
    # `id`, so without this PostgREST upserts on the PK and the secondary UNIQUE
    # (zone_id,computed_at,target_date) raises 409 instead of merging.
    resp = requests.post(
        f"{url}/rest/v1/fire_danger?on_conflict=zone_id,computed_at,target_date",
        headers={**_headers(key, "resolution=merge-duplicates,return=minimal")},
        json=rows, timeout=30)
    resp.raise_for_status()


def seed_zones(zones: list) -> None:
    """Upsert zone definitions into danger_zones (id is the PK)."""
    url, key = _base()
    if not url or not key:
        return
    payload = [{
        "id": z.id, "province": z.province, "name": z.name,
        "lat": z.lat, "lng": z.lng,
        "bbox": list(z.bbox),
    } for z in zones]
    resp = requests.post(
        f"{url}/rest/v1/danger_zones?on_conflict=id",
        headers={**_headers(key, "resolution=merge-duplicates,return=minimal")},
        json=payload, timeout=20)
    resp.raise_for_status()
