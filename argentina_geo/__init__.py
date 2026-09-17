"""Recorte del territorio argentino para el pipeline GOES.

Gemelo de `src/lib/argentina-polygon.ts`: mismo dato, mismo algoritmo y mismo
margen de borde. La duplicación existe porque `vercel.json` excluye `src/**`
del paquete de las funciones Python; `tests/python/test_argentina_geo.py`
compara las dos copias punto por punto para que no se separen.

Hasta el 2026-09-17 las dos copias eran una silueta de 21 puntos que se tragaba
el Chaco paraguayo (856 focos ajenos en un solo día) y dejaba afuera Puerto
Iguazú y El Calafate.
"""

from __future__ import annotations

import math

from .polygon import POLYGONS

# El dato es de escala mundial: la costa se recorta y Ushuaia queda 0,6 km mar
# adentro. Mismo criterio que las zonas forestales. Ningún foco de Paraguay cae
# tan cerca: el más próximo del 17/9 estaba a 50 km.
BORDER_BUFFER_KM = 3.0

_BBOX_BUFFER_DEG = 0.05


def _bbox(ring: list[tuple[float, float]]) -> tuple[float, float, float, float]:
    lngs = [p[0] for p in ring]
    lats = [p[1] for p in ring]
    return min(lngs), min(lats), max(lngs), max(lats)


_BBOXES = [_bbox(poly[0]) for poly in POLYGONS]


def _point_in_ring(lng: float, lat: float, ring: list[tuple[float, float]]) -> bool:
    """Ray casting. El +1e-12 evita dividir por cero en tramos horizontales."""
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if (yi > lat) != (yj > lat) and lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi:
            inside = not inside
        j = i
    return inside


def _distance_to_segment_km(
    lng: float, lat: float, a: tuple[float, float], b: tuple[float, float]
) -> float:
    """Distancia punto→segmento con proyección local plana (exacta a esta escala)."""
    kx = 111.32 * math.cos(math.radians(lat))
    ky = 110.57
    px, py = lng * kx, lat * ky
    ax, ay = a[0] * kx, a[1] * ky
    bx, by = b[0] * kx, b[1] * ky
    dx, dy = bx - ax, by - ay
    len2 = dx * dx + dy * dy
    t = 0.0 if len2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / len2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def _within_buffer_km(lng: float, lat: float, km: float) -> bool:
    for poly, (min_lng, min_lat, max_lng, max_lat) in zip(POLYGONS, _BBOXES):
        if (
            lng < min_lng - _BBOX_BUFFER_DEG
            or lng > max_lng + _BBOX_BUFFER_DEG
            or lat < min_lat - _BBOX_BUFFER_DEG
            or lat > max_lat + _BBOX_BUFFER_DEG
        ):
            continue
        for ring in poly:
            for i in range(len(ring) - 1):
                if _distance_to_segment_km(lng, lat, ring[i], ring[i + 1]) <= km:
                    return True
    return False


def in_argentina(lat: float, lng: float) -> bool:
    """True si (lat, lng) está en Argentina, o a menos de 3 km de su límite."""
    for poly, (min_lng, min_lat, max_lng, max_lat) in zip(POLYGONS, _BBOXES):
        if lng < min_lng or lng > max_lng or lat < min_lat or lat > max_lat:
            continue
        if not _point_in_ring(lng, lat, poly[0]):
            continue
        if any(_point_in_ring(lng, lat, hole) for hole in poly[1:]):
            continue
        return True
    return _within_buffer_km(lng, lat, BORDER_BUFFER_KM)
