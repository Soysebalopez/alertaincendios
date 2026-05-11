"""
WHI-546 — quality filters for GOES FDC detections.

Each filter is a pure function: takes a list of detection dicts (as produced
by spike.py / read from the per-scan CSV) and returns a filtered list.

Filter order matters: cheap mask-code filter first, expensive polygon test last
on the much smaller surviving set.
"""
import math
from typing import Dict, List

from shapely.geometry import Point, Polygon


# 1. Mask-code filter
# Per GOES FDC Product User Guide rev 6, table 5.1.7-1, these codes indicate
# pixels the algorithm itself considers high-confidence fires. The "tf_" variants
# are temporally filtered (the same pixel was seen in earlier frames).
HIGH_CONFIDENCE_CODES = {
    10,  # fire_good_quality
    11,  # fire_saturated
    13,  # fire_high_probability
    30,  # tf_fire_good_quality
    31,  # tf_fire_saturated
    33,  # tf_fire_high_probability
}


def filter_high_confidence(records: List[Dict]) -> List[Dict]:
    return [r for r in records if int(r["mask"]) in HIGH_CONFIDENCE_CODES]


# 2. Argentina polygon filter
# Simplified country boundary, ~25 vertices, good enough to exclude Chile,
# Uruguay, Brazil, Paraguay, Bolivia, and the Atlantic. Vertex order is
# clockwise starting from the NW corner (Jujuy west).
#
# Production note: swap for Natural Earth or GADM ADM0 for ARG when we have time
# to add the GeoJSON loader. Current polygon is intentionally simple for the spike.
_ARG_VERTICES = [
    # Northern border (W → E)
    (-67.0, -22.0), (-65.5, -22.0), (-62.0, -22.0), (-58.0, -22.0),
    # NE corner along Argentina-Paraguay / Brazil borders
    (-55.0, -25.0), (-53.5, -27.0),
    # Eastern border / Rio Uruguay
    (-55.5, -28.0), (-58.0, -32.5), (-58.4, -34.0),
    # Atlantic coast (N → S)
    (-56.5, -38.0), (-62.5, -42.0), (-65.0, -45.0), (-68.0, -50.0),
    (-68.5, -53.0),
    # Tierra del Fuego
    (-69.5, -55.0), (-71.0, -55.0),
    # Andes / Chile border (S → N)
    (-71.5, -52.0), (-72.0, -48.0), (-71.5, -45.0), (-71.5, -40.0),
    (-70.5, -36.0), (-70.0, -33.0), (-69.5, -30.0), (-69.0, -27.0),
    (-68.0, -25.0),
    # close
    (-67.0, -22.0),
]
ARGENTINA_POLYGON = Polygon(_ARG_VERTICES)


def filter_inside_argentina(records: List[Dict]) -> List[Dict]:
    return [r for r in records if ARGENTINA_POLYGON.contains(Point(r["lng"], r["lat"]))]


# 3. Urban exclusion
# Bounding boxes for major Argentine metros where industrial heat sources
# (steel mills, refineries, large factories) can register as fire pixels.
# Conservative boxes — better to drop a real fire than alert on a factory.
URBAN_ZONES = [
    {"name": "AMBA",          "min_lat": -35.10, "max_lat": -34.30, "min_lng": -58.95, "max_lng": -57.85},
    {"name": "Gran Cordoba",  "min_lat": -31.60, "max_lat": -31.20, "min_lng": -64.40, "max_lng": -64.00},
    {"name": "Gran Rosario",  "min_lat": -33.05, "max_lat": -32.80, "min_lng": -60.85, "max_lng": -60.55},
    {"name": "Gran Mendoza",  "min_lat": -33.10, "max_lat": -32.80, "min_lng": -68.95, "max_lng": -68.65},
    {"name": "Gran La Plata", "min_lat": -35.00, "max_lat": -34.80, "min_lng": -58.05, "max_lng": -57.80},
    {"name": "S.M. Tucuman",  "min_lat": -26.95, "max_lat": -26.70, "min_lng": -65.30, "max_lng": -65.10},
    {"name": "Mar del Plata", "min_lat": -38.10, "max_lat": -37.90, "min_lng": -57.65, "max_lng": -57.45},
]
# TODO: port the Vaca Muerta flaring exclusion from src/lib (FIRMS path)


def filter_exclude_urban(records: List[Dict]) -> List[Dict]:
    def in_any_urban(r):
        for z in URBAN_ZONES:
            if (z["min_lat"] <= r["lat"] <= z["max_lat"]
                    and z["min_lng"] <= r["lng"] <= z["max_lng"]):
                return True
        return False
    return [r for r in records if not in_any_urban(r)]


# 4. Spatial dedup
EARTH_RADIUS_KM = 6371.0


def _haversine_km(a: Dict, b: Dict) -> float:
    lat1, lng1 = math.radians(a["lat"]), math.radians(a["lng"])
    lat2, lng2 = math.radians(b["lat"]), math.radians(b["lng"])
    dlat, dlng = lat2 - lat1, lng2 - lng1
    h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(h))


def filter_dedup(records: List[Dict], radius_km: float = 4.0) -> List[Dict]:
    """Greedy clustering by haversine distance. Higher-confidence kept as reps."""
    # Process high-confidence first so they win as cluster representatives.
    order = sorted(records, key=lambda r: 0 if r.get("high_confidence") else 1)
    kept: List[Dict] = []
    for r in order:
        if any(_haversine_km(r, k) <= radius_km for k in kept):
            continue
        kept.append(r)
    return kept


# Pipeline
def apply_all(records: List[Dict]) -> Dict:
    """Apply all filters in order. Returns funnel counts + final survivors."""
    funnel = [("input", records)]
    step1 = filter_high_confidence(records)
    funnel.append(("mask_high_confidence", step1))
    step2 = filter_inside_argentina(step1)
    funnel.append(("inside_argentina", step2))
    step3 = filter_exclude_urban(step2)
    funnel.append(("exclude_urban", step3))
    step4 = filter_dedup(step3)
    funnel.append(("spatial_dedup_4km", step4))
    return {
        "funnel": [(name, len(rs)) for name, rs in funnel],
        "survivors": step4,
    }
