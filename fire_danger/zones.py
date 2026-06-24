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
    # --- Phase 1: Patagonia (approximate boxes, pending user validation) ---
    Zone(
        id="santa-cruz-estepa",
        province="santa-cruz",
        name="Estepa (Río Gallegos, Caleta Olivia)",
        lat=-51.6230,
        lng=-69.2168,
        hemisphere="south",
        bbox=(-52.4, -46.0, -72.0, -65.7),
    ),
    Zone(
        id="santa-cruz-bosque-andino",
        province="santa-cruz",
        name="Bosque andino SO (El Calafate, El Chaltén)",
        lat=-50.3379,
        lng=-72.2648,
        hemisphere="south",
        bbox=(-51.0, -46.5, -73.6, -72.0),
    ),
    Zone(
        id="chubut-estepa",
        province="chubut",
        name="Estepa (Comodoro Rivadavia, Trelew)",
        lat=-43.2489,
        lng=-65.3051,
        hemisphere="south",
        bbox=(-46.0, -42.0, -70.5, -63.6),
    ),
    Zone(
        id="chubut-bosque-andino",
        province="chubut",
        name="Bosque andino (Esquel, Trevelin)",
        lat=-42.9109,
        lng=-71.3199,
        hemisphere="south",
        bbox=(-44.0, -42.0, -71.6, -70.5),
    ),
    Zone(
        id="rio-negro-estepa",
        province="rio-negro",
        name="Estepa / Alto Valle (Gral Roca, Viedma)",
        lat=-39.0333,
        lng=-67.5800,
        hemisphere="south",
        bbox=(-42.0, -37.5, -70.5, -62.8),
    ),
    Zone(
        id="rio-negro-bosque-andino",
        province="rio-negro",
        name="Bosque andino (Bariloche, El Bolsón)",
        lat=-41.1335,
        lng=-71.3103,
        hemisphere="south",
        bbox=(-42.0, -40.3, -71.9, -70.5),
    ),
    Zone(
        id="neuquen-estepa",
        province="neuquen",
        name="Estepa / monte (Neuquén, Zapala)",
        lat=-38.9000,
        lng=-70.0600,
        hemisphere="south",
        bbox=(-41.0, -36.0, -70.7, -68.0),
    ),
    Zone(
        id="neuquen-bosque-andino",
        province="neuquen",
        name="Bosque andino (San Martín de los Andes, Aluminé)",
        lat=-40.1579,
        lng=-71.3534,
        hemisphere="south",
        bbox=(-41.0, -38.7, -71.7, -70.7),
    ),
]
