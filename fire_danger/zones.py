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
    # --- Phase 2: Centro / Cuyo / Sierras / southern NOA. Zones by fire biome,
    #     curated from a fire-occurrence review (INTA/CONICET/SNMF). Boxes hug the
    #     fire-prone biome (sierra flanks, Monte, caldenal) and avoid non-burnable
    #     land (irrigated oasis, barren Puna/high cordillera, salares). Approximate,
    #     pending user validation. NOTE: the sierra zones (Córdoba, San Luis, San
    #     Juan, La Rioja, Catamarca) peak in WINTER/spring (Aug–Oct), opposite to the
    #     Patagonia/TDF summer season — percentile calibration handles this per-zone. ---
    Zone(
        id="la-pampa-caldenal",
        province="la-pampa",
        name="Caldenal / espinal (Victorica, Santa Rosa)",
        lat=-36.2160,
        lng=-65.4370,
        hemisphere="south",
        bbox=(-38.0, -35.2, -65.8, -63.5),
    ),
    Zone(
        id="la-pampa-monte-oeste",
        province="la-pampa",
        name="Monte occidental (Santa Isabel, Puelches)",
        lat=-36.2320,
        lng=-66.9400,
        hemisphere="south",
        bbox=(-38.5, -35.5, -68.2, -65.8),
    ),
    Zone(
        id="mendoza-monte-este",
        province="mendoza",
        name="Monte / travesía del este (Santa Rosa, La Paz)",
        lat=-33.3000,
        lng=-67.5300,
        hemisphere="south",
        bbox=(-34.3, -32.2, -68.4, -66.9),
    ),
    Zone(
        id="mendoza-piedemonte-sur",
        province="mendoza",
        name="Piedemonte y sur (San Rafael, Malargüe)",
        lat=-34.6150,
        lng=-68.3320,
        hemisphere="south",
        bbox=(-36.0, -32.7, -69.5, -67.8),
    ),
    Zone(
        id="san-luis-comechingones",
        province="san-luis",
        name="Sierra de los Comechingones (Merlo)",
        lat=-32.3430,
        lng=-65.0140,
        hemisphere="south",
        bbox=(-32.9, -32.1, -65.3, -64.9),
    ),
    Zone(
        id="san-luis-sierras-centro",
        province="san-luis",
        name="Sierras centrales / El Morro (El Trapiche, La Carolina)",
        lat=-33.1700,
        lng=-66.4000,
        hemisphere="south",
        bbox=(-33.4, -32.2, -66.5, -65.6),
    ),
    Zone(
        id="cordoba-sierras",
        province="cordoba",
        name="Sierras (Punilla, Calamuchita, Sierras Chicas)",
        lat=-30.8600,
        lng=-64.5300,
        hemisphere="south",
        bbox=(-32.4, -29.8, -65.4, -64.1),
    ),
    Zone(
        id="san-juan-valle-fertil",
        province="san-juan",
        name="Chaco árido / Valle Fértil (San Agustín)",
        lat=-30.6300,
        lng=-67.4700,
        hemisphere="south",
        bbox=(-31.3, -30.0, -67.7, -66.8),
    ),
    Zone(
        id="la-rioja-velasco",
        province="la-rioja",
        name="Sierra de Velasco (La Rioja, Aimogasta)",
        lat=-29.3200,
        lng=-67.0600,
        hemisphere="south",
        bbox=(-29.85, -28.55, -67.25, -66.7),
    ),
    Zone(
        id="la-rioja-llanos",
        province="la-rioja",
        name="Llanos / Chaco árido (Chamical, Chepes)",
        lat=-30.3600,
        lng=-66.3000,
        hemisphere="south",
        bbox=(-31.7, -30.0, -66.9, -65.6),
    ),
    Zone(
        id="catamarca-ancasti",
        province="catamarca",
        name="Sierra de Ancasti (El Alto)",
        lat=-28.7800,
        lng=-65.5000,
        hemisphere="south",
        bbox=(-29.1, -28.0, -65.65, -65.1),
    ),
    Zone(
        id="catamarca-aconquija",
        province="catamarca",
        name="Aconquija / oeste (Andalgalá, Belén)",
        lat=-27.5800,
        lng=-66.3200,
        hemisphere="south",
        bbox=(-28.1, -27.1, -67.25, -65.9),
    ),
]
