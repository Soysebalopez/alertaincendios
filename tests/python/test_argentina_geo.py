"""El recorte de Argentina del pipeline GOES y su paridad con el lado TypeScript.

`vercel.json` excluye `src/**` del paquete de las funciones Python, así que el
límite está duplicado: `src/lib/argentina-polygon.json` y `argentina_geo/polygon.py`.
Dos copias sólo sirven si algo las obliga a no separarse — eso es lo que hacen
los tests de paridad de abajo.
"""

import json
import re
from pathlib import Path

import pytest

from argentina_geo import BORDER_BUFFER_KM, in_argentina
from argentina_geo.polygon import POLYGONS

ROOT = Path(__file__).resolve().parents[2]

DENTRO = [
    ("Clorinda, Formosa", -25.283, -57.717),
    ("Puerto Iguazú, Misiones", -25.695, -54.437),
    ("La Quiaca, Jujuy", -22.105, -65.597),
    ("Resistencia, Chaco", -27.451, -58.986),
    ("Ushuaia", -54.801, -68.303),
    ("Río Grande, Tierra del Fuego", -53.787, -67.71),
    ("El Calafate, Santa Cruz", -50.34, -72.27),
    ("Puerto Madryn, Chubut", -42.769, -65.038),
    ("Bahía Blanca", -38.7196, -62.2724),
]

FUERA = [
    ("foco del Chaco paraguayo del 17/9", -23.06996, -57.2646),
    ("Asunción, Paraguay", -25.28, -57.63),
    ("Chaco paraguayo profundo", -22.0, -59.5),
    ("Punta Arenas, Chile", -53.16, -70.91),
    ("Colonia, Uruguay", -34.47, -57.84),
    ("Porto Alegre, Brasil", -30.033, -51.23),
    ("Atlántico, 100 km mar adentro", -38.0, -55.0),
]


@pytest.mark.parametrize("nombre,lat,lng", DENTRO, ids=[c[0] for c in DENTRO])
def test_acepta(nombre, lat, lng):
    assert in_argentina(lat, lng) is True


@pytest.mark.parametrize("nombre,lat,lng", FUERA, ids=[c[0] for c in FUERA])
def test_rechaza(nombre, lat, lng):
    assert in_argentina(lat, lng) is False


def test_el_dato_es_identico_al_del_lado_typescript():
    ts = json.loads((ROOT / "src" / "lib" / "argentina-polygon.json").read_text(encoding="utf-8"))
    py = [[[list(pt) for pt in ring] for ring in poly] for poly in POLYGONS]
    assert py == ts


def test_el_margen_de_borde_es_el_mismo_en_los_dos_lados():
    fuente = (ROOT / "src" / "lib" / "argentina-polygon.ts").read_text(encoding="utf-8")
    encontrado = re.search(r"ARGENTINA_BORDER_BUFFER_KM\s*=\s*([0-9.]+)", fuente)
    assert encontrado, "no encontré ARGENTINA_BORDER_BUFFER_KM en el lado TypeScript"
    assert float(encontrado.group(1)) == BORDER_BUFFER_KM
