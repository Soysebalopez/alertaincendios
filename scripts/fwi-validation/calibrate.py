# scripts/fwi-validation/calibrate.py
"""Calibrate per-zone FWI danger-class cuts (p30/p70/p90/p97) from each zone's
own historical FWI series, and bake fire_danger/danger_thresholds.json. Offline,
run once (after the series CSV exists). Pure function thresholds_from_series is
unit-tested; the __main__ wiring reads the series and writes the JSON.

JSON schema (consumed by fire_danger/classify.py): each zone maps to the four
class lower-bounds, all four keys always present:
  {zone_id: {"moderado": p30, "alto": p70, "muy alto": p90, "extremo": p97}}"""
import json
import pathlib
import sys

import pandas as pd

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[2]))
from fire_danger.aggregate import percentile  # noqa: E402
from fire_danger.classify import GLOBAL_FLOOR  # noqa: E402

# validation point name -> production zone id (mirrors compute_ours_grid.ZONE_OF)
ZONE_OF = {"rio_grande": "tdf-norte-estepa", "ushuaia": "tdf-sur-bosque"}
OUT_PATH = pathlib.Path(__file__).resolve().parents[2] / "fire_danger" / "danger_thresholds.json"


def thresholds_from_series(series_by_zone: dict) -> dict:
    """series_by_zone: {zone_id: [fwi values]} -> {zone_id: {class: lower_bound}}.

    Each cut is the zone's own percentile (p30/p70/p90/p97) FLOORED at the generic
    FWI danger breakpoint for that class (GLOBAL_FLOOR): cut = max(percentile, floor).
    The floor keeps the per-zone calibration where it carries real danger (estepa and
    dry zones sit well above it) while preventing the percentiles from labelling
    trivially-low FWI as "alto"/"moderado" in intrinsically wet zones — e.g. Andean
    forest where >30% of days are FWI 0, so p30=0 would erase the "bajo" class.

    Raises ValueError if the floored cuts are still not strictly increasing (only
    possible for a pathological constant-high series, never for real FWI)."""
    out = {}
    for zone_id, values in series_by_zone.items():
        p30, p70, p90, p97 = (percentile(list(values), q) for q in (30.0, 70.0, 90.0, 97.0))
        cuts = {
            "moderado": max(round(p30, 2), GLOBAL_FLOOR["moderado"]),
            "alto": max(round(p70, 2), GLOBAL_FLOOR["alto"]),
            "muy alto": max(round(p90, 2), GLOBAL_FLOOR["muy alto"]),
            "extremo": max(round(p97, 2), GLOBAL_FLOOR["extremo"]),
        }
        if not (cuts["moderado"] < cuts["alto"] < cuts["muy alto"] < cuts["extremo"]):
            raise ValueError(f"non-monotonic cuts for {zone_id}: {cuts}")
        out[zone_id] = cuts
    return out


if __name__ == "__main__":
    df = pd.read_csv("ours_tdf.csv")   # columns: point, date, fwi_ours
    series = {ZONE_OF[p]: g["fwi_ours"].tolist()
              for p, g in df.groupby("point") if p in ZONE_OF}
    thresholds = thresholds_from_series(series)
    OUT_PATH.write_text(json.dumps(thresholds, indent=2, ensure_ascii=False))
    print(f"wrote {OUT_PATH}")
    for zid, cuts in thresholds.items():
        n = len(series[zid])
        print(f"  {zid}: n={n} days · {cuts}")
