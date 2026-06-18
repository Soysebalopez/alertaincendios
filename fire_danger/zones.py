"""Fire-danger zones, curated by fire behaviour (not departments/grid). v1 covers
Tierra del Fuego: northern steppe vs southern forest. The FWI is computed at the
representative point; polygons for map painting are a Milestone-2 concern, so no
geometry is stored here. IDs are stable — they key rows in `danger_zones`."""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Zone:
    id: str
    province: str
    name: str
    lat: float
    lng: float
    hemisphere: str
    bbox: tuple[float, float, float, float]  # (south, north, west, east)


ZONES: list[Zone] = [
    Zone(
        id="tdf-norte-estepa",
        province="tierra-del-fuego",
        name="Norte / Estepa (Río Grande)",
        lat=-53.7878,
        lng=-67.7091,
        hemisphere="south",
        bbox=(-54.2, -52.6, -68.6, -66.4),
    ),
    Zone(
        id="tdf-sur-bosque",
        province="tierra-del-fuego",
        name="Sur / Bosque (Ushuaia–Tolhuin)",
        lat=-54.8019,
        lng=-68.3029,
        hemisphere="south",
        bbox=(-55.1, -54.2, -68.7, -66.9),
    ),
]
