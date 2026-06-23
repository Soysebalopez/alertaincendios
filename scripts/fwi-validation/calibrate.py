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

# validation point name -> production zone id (mirrors compute_ours_grid.ZONE_OF)
ZONE_OF = {"rio_grande": "tdf-norte-estepa", "ushuaia": "tdf-sur-bosque"}
OUT_PATH = pathlib.Path(__file__).resolve().parents[2] / "fire_danger" / "danger_thresholds.json"


def thresholds_from_series(series_by_zone: dict) -> dict:
    """series_by_zone: {zone_id: [fwi values]} -> {zone_id: {class: lower_bound}}.
    Raises ValueError if a zone's percentiles are not strictly increasing."""
    out = {}
    for zone_id, values in series_by_zone.items():
        p30, p70, p90, p97 = (percentile(list(values), q) for q in (30.0, 70.0, 90.0, 97.0))
        if not (p30 < p70 < p90 < p97):
            raise ValueError(f"non-monotonic percentiles for {zone_id}: {(p30, p70, p90, p97)}")
        out[zone_id] = {"moderado": round(p30, 2), "alto": round(p70, 2),
                        "muy alto": round(p90, 2), "extremo": round(p97, 2)}
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
