"""
Prueba de áreas quemadas: dNBR contra Prithvi-EO-2.0-300M-BurnScars (2026-10-01).

Para cada incendio de casos.json:

  1. Arma el ÁREA DE ANÁLISIS con las detecciones VIIRS del incendio (NASA
     FIRMS, archivo definitivo): el grupo de focos más grande cerca de la
     semilla, con un margen. Así no hace falta conocer el perímetro de antemano
     y no se cuelan otras quemas de la zona. Se recorta al territorio argentino.
  2. Busca imágenes HLS (Landsat + Sentinel-2 a 30 m) de ANTES y DESPUÉS, y
     elige la más cercana al incendio que tenga al menos MIN_DESPEJADO del área
     sin nubes, sombra, nieve ni agua (máscara Fmask de la propia NASA).
  3. Calcula el área quemada de dos formas:
       - dNBR (método clásico, sin IA): cuánto cayó el índice NBR entre antes y
         después. Se informan dos umbrales: > 0,10 (quemado, incluso leve) y
         > 0,27 (severidad moderada o más).
       - Prithvi BurnScars (IA de IBM + NASA) sobre la imagen de DESPUÉS, y
         también sobre la de ANTES, para descontar cicatrices viejas.
  4. Escribe por incendio: hectáreas, mapas (GeoTIFF) y una vista PNG; y un
     resumen comparativo contra la cifra oficial (resultados/resumen.md).

Uso (desde scripts/area-quemada-prueba/):

    python -m venv .venv && source .venv/bin/activate
    pip install -r requirements.txt
    export EARTHDATA_TOKEN=...   # urs.earthdata.nasa.gov → Generate Token
    export FIRMS_MAP_KEY=...     # la misma clave de FIRMS que usa el sitio
    python prueba.py                         # los cuatro casos
    python prueba.py --caso villarino-2026   # uno solo
    python prueba.py --sin-prithvi           # sólo dNBR (rápido, sin modelo)
    python prueba.py --referencia cordoba-capilla-del-monte-2024=idecor.geojson

⚠️ NASA bloquea servidores de datacenter para FIRMS: correrlo desde una conexión
común. Prithvi corre en CPU (lento pero alcanza para cuatro incendios) o en GPU
si hay una. Los tokens se leen del entorno y nunca se escriben en disco.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import math
import os
import subprocess
import sys
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from pathlib import Path

import numpy as np
import requests

AQUI = Path(__file__).resolve().parent
REPO = AQUI.parents[1]
sys.path.insert(0, str(REPO))  # para argentina_geo (límite oficial del sitio)

MIN_DESPEJADO = 0.80  # fracción mínima del área sin nubes/sombra/agua/nieve
DNBR_QUEMADO = 0.10
DNBR_MODERADO = 0.27
PIXEL_HA = 0.09  # 30 m × 30 m
FIRMS_FUENTES = ["VIIRS_NOAA20_SP", "VIIRS_SNPP_SP"]
PRITHVI_REPO = "ibm-nasa-geospatial/Prithvi-EO-2.0-300M-BurnScars"

# Bandas en el orden que espera Prithvi: Blue, Green, Red, NIR angosto, SWIR1, SWIR2.
BANDAS = {
    "HLSL30": ["B02", "B03", "B04", "B05", "B06", "B07"],
    "HLSS30": ["B02", "B03", "B04", "B8A", "B11", "B12"],
}
FILL = -9999
ESCALA = 0.0001


# ---------------------------------------------------------------------------
# Piezas puras (sin red): se prueban con test_prueba.py
# ---------------------------------------------------------------------------

def fmask_valido(fmask: np.ndarray) -> np.ndarray:
    """True donde el píxel sirve: sin nube (bit 1), adyacente a nube (2),
    sombra (3), nieve/hielo (4) ni agua (5). Fill (255) tampoco sirve."""
    f = fmask.astype(np.uint16)
    malos = (1 << 1) | (1 << 2) | (1 << 3) | (1 << 4) | (1 << 5)
    return ((f & malos) == 0) & (f != 255)


def nbr(nir: np.ndarray, swir2: np.ndarray) -> np.ndarray:
    with np.errstate(divide="ignore", invalid="ignore"):
        r = (nir - swir2) / (nir + swir2)
    return np.where(np.isfinite(r), r, np.nan)


def dnbr(pre_nir, pre_swir2, post_nir, post_swir2) -> np.ndarray:
    """dNBR = NBR antes − NBR después. Positivo y alto = vegetación que se quemó."""
    return nbr(pre_nir, pre_swir2) - nbr(post_nir, post_swir2)


def km_entre(lat1, lng1, lat2, lng2) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def agrupar(puntos: list[tuple[float, float]], max_km: float = 1.5) -> list[list[int]]:
    """Enlace simple: dos focos a ≤ max_km son el mismo incendio (como el sitio)."""
    padre = list(range(len(puntos)))

    def raiz(i):
        while padre[i] != i:
            padre[i] = padre[padre[i]]
            i = padre[i]
        return i

    celda = max_km / 111.0
    grilla: dict[tuple[int, int], list[int]] = {}
    for i, (la, lo) in enumerate(puntos):
        grilla.setdefault((int(la // celda), int(lo // celda)), []).append(i)
    for i, (la, lo) in enumerate(puntos):
        a, b = int(la // celda), int(lo // celda)
        for da in (-1, 0, 1):
            for db in (-1, 0, 1):
                for j in grilla.get((a + da, b + db), []):
                    if j > i and km_entre(la, lo, *puntos[j]) <= max_km:
                        padre[raiz(i)] = raiz(j)
    grupos: dict[int, list[int]] = {}
    for i in range(len(puntos)):
        grupos.setdefault(raiz(i), []).append(i)
    return list(grupos.values())


def elegir_grupo(puntos, grupos, semilla, radio_km):
    """El grupo más grande con al menos un foco a ≤ radio_km de la semilla."""
    cerca = [g for g in grupos if any(km_entre(*semilla, *puntos[i]) <= radio_km for i in g)]
    return max(cerca, key=len) if cerca else None


def hectareas(mascara: np.ndarray) -> float:
    return float(np.count_nonzero(mascara)) * PIXEL_HA


def iou(a: np.ndarray, b: np.ndarray) -> float:
    union = np.count_nonzero(a | b)
    return float(np.count_nonzero(a & b)) / union if union else float("nan")


# ---------------------------------------------------------------------------
# FIRMS: el área de análisis sale de las detecciones del incendio
# ---------------------------------------------------------------------------

def focos_firms(caso: dict, clave: str) -> list[tuple[float, float]]:
    lat, lng = caso["semilla"]
    d = caso["radio_semilla_km"] / 111.0 + 0.3
    bbox = f"{lng - d * 1.4:.3f},{lat - d:.3f},{lng + d * 1.4:.3f},{lat + d:.3f}"
    ini = date.fromisoformat(caso["fuego"][0])
    fin = date.fromisoformat(caso["fuego"][1])
    puntos = []
    for fuente in FIRMS_FUENTES:
        dia = ini
        while dia <= fin:
            url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{clave}/{fuente}/{bbox}/5/{dia.isoformat()}"
            r = requests.get(url, timeout=120)
            if r.status_code != 200 or not r.text.startswith("latitude"):
                raise RuntimeError(f"FIRMS {fuente} {dia}: HTTP {r.status_code} {r.text[:120]!r}")
            for fila in csv.DictReader(io.StringIO(r.text)):
                if fila.get("confidence") in ("l", "low") or fila.get("type", "0") not in ("0", ""):
                    continue
                puntos.append((float(fila["latitude"]), float(fila["longitude"])))
            dia += timedelta(days=5)
    return puntos


def area_de_analisis(caso: dict, clave: str):
    """Polígono (lat/lng) del incendio: focos del grupo con buffer, cerrado y
    con 1 km de margen, recortado a la Argentina."""
    from pyproj import Transformer
    from shapely.geometry import Point, MultiPolygon, Polygon
    from shapely.ops import transform, unary_union

    puntos = focos_firms(caso, clave)
    if not puntos:
        raise RuntimeError("FIRMS no devolvió focos para ese lugar y fechas")
    grupo = elegir_grupo(puntos, agrupar(puntos), caso["semilla"], caso["radio_semilla_km"])
    if not grupo:
        raise RuntimeError("ningún grupo de focos cerca de la semilla: revisar la semilla o las fechas")
    sel = [puntos[i] for i in grupo]
    lat0 = sum(p[0] for p in sel) / len(sel)
    lng0 = sum(p[1] for p in sel) / len(sel)
    zona = int((lng0 + 180) // 6) + 1
    epsg = 32700 + zona  # UTM sur
    a_utm = Transformer.from_crs(4326, epsg, always_xy=True).transform
    a_geo = Transformer.from_crs(epsg, 4326, always_xy=True).transform

    # Píxel VIIRS de 375 m: buffer de 750 m alrededor de cada foco, después se
    # "cierra" (une huecos de hasta 2 km entre pasadas) y se deja 1 km de margen.
    zona_focos = unary_union([Point(a_utm(lo, la)).buffer(750) for la, lo in sel])
    aoi_utm = zona_focos.buffer(2000).buffer(-2000).buffer(1000)

    from argentina_geo.polygon import POLYGONS
    arg = unary_union([Polygon(p[0], p[1:]) for p in POLYGONS]).buffer(0)
    aoi_geo = transform(a_geo, aoi_utm).intersection(arg)
    if isinstance(aoi_geo, (Polygon, MultiPolygon)) and aoi_geo.is_empty:
        raise RuntimeError("el área de análisis cae fuera de la Argentina")
    info = {
        "focos_viirs_total": len(puntos),
        "focos_del_incendio": len(sel),
        "centro": [round(lat0, 4), round(lng0, 4)],
        "epsg": epsg,
        "area_analisis_ha": round(transform(a_utm, aoi_geo).area / 10000),
    }
    return aoi_geo, epsg, info


# ---------------------------------------------------------------------------
# HLS: búsqueda, elección por nubes y armado de la grilla común
# ---------------------------------------------------------------------------

@dataclass
class Escena:
    producto: str  # HLSL30 | HLSS30
    fecha: date
    granulos: list = field(default_factory=list)  # granules de earthaccess de ese día


def buscar_escenas(aoi_geo, desde: str, hasta: str) -> list[Escena]:
    import earthaccess

    bb = aoi_geo.bounds  # (minx, miny, maxx, maxy) = lng/lat
    escenas: dict[tuple[str, date], Escena] = {}
    for producto in ("HLSL30", "HLSS30"):
        gs = earthaccess.search_data(short_name=producto, version="2.0", bounding_box=bb, temporal=(desde, hasta))
        for g in gs:
            t = g["umm"]["TemporalExtent"]["RangeDateTime"]["BeginningDateTime"][:10]
            k = (producto, date.fromisoformat(t))
            escenas.setdefault(k, Escena(producto, k[1])).granulos.append(g)
    return sorted(escenas.values(), key=lambda e: e.fecha)


def links(granulo, banda: str) -> str:
    for u in granulo.data_links(access="external"):
        if u.endswith(f".{banda}.tif"):
            return u
    raise KeyError(f"el gránulo no tiene la banda {banda}")


def grilla(aoi_geo, epsg: int):
    """Grilla de 30 m que cubre el área, en la UTM del incendio."""
    from pyproj import Transformer
    from rasterio.transform import from_origin
    from shapely.ops import transform as stransform

    a_utm = Transformer.from_crs(4326, epsg, always_xy=True).transform
    minx, miny, maxx, maxy = stransform(a_utm, aoi_geo).bounds
    minx, miny = math.floor(minx / 30) * 30, math.floor(miny / 30) * 30
    maxx, maxy = math.ceil(maxx / 30) * 30, math.ceil(maxy / 30) * 30
    ancho, alto = int((maxx - minx) / 30), int((maxy - miny) / 30)
    return from_origin(minx, maxy, 30, 30), ancho, alto


def leer_en_grilla(rutas: list[Path], epsg: int, transform, ancho, alto, categorica: bool) -> np.ndarray:
    """Reproyecta y junta (mosaico) los tiles de un mismo día a la grilla común."""
    import rasterio
    from rasterio.warp import Resampling, reproject

    destino = np.full((alto, ancho), FILL if not categorica else 255, dtype=np.float32)
    for ruta in rutas:
        with rasterio.open(ruta) as src:
            tmp = np.full((alto, ancho), np.nan, dtype=np.float32)
            reproject(
                source=rasterio.band(src, 1), destination=tmp,
                src_nodata=src.nodata, dst_nodata=np.nan,
                dst_transform=transform, dst_crs=f"EPSG:{epsg}",
                resampling=Resampling.nearest if categorica else Resampling.bilinear,
            )
            vacio = (destino == (255 if categorica else FILL))
            destino = np.where(vacio & ~np.isnan(tmp), tmp, destino)
    return destino


def mascara_aoi(aoi_geo, epsg, transform, ancho, alto) -> np.ndarray:
    from pyproj import Transformer
    from rasterio.features import geometry_mask
    from shapely.ops import transform as stransform

    a_utm = Transformer.from_crs(4326, epsg, always_xy=True).transform
    return geometry_mask([stransform(a_utm, aoi_geo)], (alto, ancho), transform, invert=True)


def bajar(urls: list[str], carpeta: Path) -> list[Path]:
    import earthaccess

    carpeta.mkdir(parents=True, exist_ok=True)
    faltan = [u for u in urls if not (carpeta / u.split("/")[-1]).exists()]
    if faltan:
        earthaccess.download(faltan, str(carpeta))
    return [carpeta / u.split("/")[-1] for u in urls]


def elegir_escena(escenas, aoi, epsg, tf, ancho, alto, cache: Path, la_mas_cercana_al: str):
    """Recorre las escenas desde la más cercana al incendio y devuelve la primera
    con ≥ MIN_DESPEJADO del área utilizable. Sólo baja la máscara Fmask (liviana)
    para decidir."""
    orden = escenas[::-1] if la_mas_cercana_al == "final" else escenas
    evaluadas = []
    for e in orden:
        fm = leer_en_grilla(bajar([links(g, "Fmask") for g in e.granulos], cache), epsg, tf, ancho, alto, True)
        despejado = float(fmask_valido(fm)[aoi].mean())
        evaluadas.append((e.fecha.isoformat(), e.producto, round(despejado, 3)))
        if despejado >= MIN_DESPEJADO:
            return e, fm, evaluadas
    return None, None, evaluadas


def cargar_bandas(e: Escena, epsg, tf, ancho, alto, cache: Path) -> np.ndarray:
    """(6, alto, ancho) en reflectancia (0–1); NaN donde no hay dato."""
    capas = []
    for b in BANDAS[e.producto]:
        crudo = leer_en_grilla(bajar([links(g, b) for g in e.granulos], cache), epsg, tf, ancho, alto, False)
        capas.append(np.where(crudo == FILL, np.nan, crudo * ESCALA))
    return np.stack(capas)


# ---------------------------------------------------------------------------
# Prithvi BurnScars
# ---------------------------------------------------------------------------

def prithvi(img: np.ndarray, epsg, tf, carpeta: Path) -> np.ndarray:
    """Máscara de quemado de Prithvi para una imagen (6, alto, ancho) en reflectancia.

    Corre la inferencia oficial del repositorio del modelo (inference.py). Las
    unidades de entrada se deciden leyendo las medias de normalización de su
    config: si están en miles, el modelo espera valores HLS crudos (×10.000)."""
    import rasterio
    import yaml
    from huggingface_hub import snapshot_download

    repo = Path(snapshot_download(PRITHVI_REPO))
    configs = sorted(repo.glob("*.yaml"))
    ckpts = sorted(list(repo.glob("*.pt")) + list(repo.glob("*.ckpt")))
    script = repo / "inference.py"
    if not (configs and ckpts and script.exists()):
        raise RuntimeError(f"no encontré config/checkpoint/inference.py en {repo}: {sorted(p.name for p in repo.iterdir())}")
    cfg = yaml.safe_load(configs[0].read_text())
    medias = _buscar_clave(cfg, "means")
    crudo = bool(medias) and float(medias[0]) > 10
    datos = np.nan_to_num(img * (10000 if crudo else 1), nan=(FILL if crudo else 0))

    carpeta.mkdir(parents=True, exist_ok=True)
    entrada = carpeta / "entrada_prithvi.tif"
    with rasterio.open(entrada, "w", driver="GTiff", height=datos.shape[1], width=datos.shape[2], count=6,
                       dtype="float32", crs=f"EPSG:{epsg}", transform=tf) as dst:
        dst.write(datos.astype(np.float32))
    salida = carpeta / "salida_prithvi"
    cmd = [sys.executable, str(script), "--data_file", str(entrada), "--config", str(configs[0]),
           "--checkpoint", str(ckpts[0]), "--output_dir", str(salida)]
    r = subprocess.run(cmd, cwd=repo, capture_output=True, text=True)
    if r.returncode != 0:
        ayuda = subprocess.run([sys.executable, str(script), "--help"], cwd=repo, capture_output=True, text=True)
        raise RuntimeError(f"inference.py falló:\n{r.stderr[-2000:]}\n--- su --help ---\n{ayuda.stdout[-2000:]}")
    tifs = sorted(salida.glob("*.tif"))
    if not tifs:
        raise RuntimeError(f"inference.py no dejó un .tif en {salida}: {r.stdout[-1000:]}")
    with rasterio.open(tifs[0]) as src:
        pred = src.read(1)
    return pred > 0


def _buscar_clave(obj, clave):
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == clave:
                return v
            r = _buscar_clave(v, clave)
            if r is not None:
                return r
    elif isinstance(obj, list):
        for v in obj:
            r = _buscar_clave(v, clave)
            if r is not None:
                return r
    return None


# ---------------------------------------------------------------------------
# Un caso de punta a punta
# ---------------------------------------------------------------------------

def correr_caso(caso: dict, args) -> dict:
    import rasterio

    sal = AQUI / "resultados" / caso["id"]
    cache = AQUI / "cache" / caso["id"]
    sal.mkdir(parents=True, exist_ok=True)
    res: dict = {"id": caso["id"], "nombre": caso["nombre"], "oficial_ha": caso["oficial_ha"],
                 "oficial_fuente": caso["oficial_fuente"]}

    aoi, epsg, info = area_de_analisis(caso, os.environ["FIRMS_MAP_KEY"])
    res.update(info)
    (sal / "area_analisis.geojson").write_text(json.dumps({"type": "Feature", "properties": {}, "geometry": aoi.__geo_interface__}))
    tf, ancho, alto = grilla(aoi, epsg)
    en_aoi = mascara_aoi(aoi, epsg, tf, ancho, alto)

    pre, fm_pre, ev_pre = elegir_escena(buscar_escenas(aoi, *caso["antes"]), en_aoi, epsg, tf, ancho, alto, cache, "final")
    post, fm_post, ev_post = elegir_escena(buscar_escenas(aoi, *caso["despues"]), en_aoi, epsg, tf, ancho, alto, cache, "inicio")
    res["escenas_evaluadas"] = {"antes": ev_pre, "despues": ev_post}
    if not pre or not post:
        res["error"] = f"no hay imagen con ≥{MIN_DESPEJADO:.0%} despejado (ver escenas_evaluadas); ampliar las ventanas"
        return res
    res["imagen_antes"] = f"{pre.producto} {pre.fecha}"
    res["imagen_despues"] = f"{post.producto} {post.fecha}"

    img_pre = cargar_bandas(pre, epsg, tf, ancho, alto, cache)
    img_post = cargar_bandas(post, epsg, tf, ancho, alto, cache)
    valido = en_aoi & fmask_valido(fm_pre) & fmask_valido(fm_post) & np.all(np.isfinite(img_pre), 0) & np.all(np.isfinite(img_post), 0)
    res["area_observable_ha"] = round(hectareas(valido))
    res["fraccion_no_observable"] = round(1 - valido.sum() / max(en_aoi.sum(), 1), 3)

    d = dnbr(img_pre[3], img_pre[5], img_post[3], img_post[5])
    q_dnbr = valido & (d > DNBR_QUEMADO)
    q_dnbr_mod = valido & (d > DNBR_MODERADO)
    res["dnbr_ha_mayor_010"] = round(hectareas(q_dnbr))
    res["dnbr_ha_mayor_027"] = round(hectareas(q_dnbr_mod))

    perfil = dict(driver="GTiff", height=alto, width=ancho, count=1, crs=f"EPSG:{epsg}", transform=tf, compress="deflate")
    with rasterio.open(sal / "dnbr.tif", "w", dtype="float32", nodata=np.nan, **perfil) as dst:
        dst.write(np.where(valido, d, np.nan).astype(np.float32), 1)

    q_pri = None
    if not args.sin_prithvi:
        try:
            p_post = prithvi(img_post, epsg, tf, cache / "prithvi_despues")
            p_pre = prithvi(img_pre, epsg, tf, cache / "prithvi_antes")
            q_pri = valido & p_post & ~p_pre
            res["prithvi_ha_despues"] = round(hectareas(valido & p_post))
            res["prithvi_ha_nuevo"] = round(hectareas(q_pri))
            res["acuerdo_iou_prithvi_vs_dnbr010"] = round(iou(q_pri, q_dnbr), 3)
        except Exception as e:  # noqa: BLE001 — el error se informa, el dNBR sigue valiendo
            res["prithvi_error"] = str(e)[:3000]

    with rasterio.open(sal / "quemado.tif", "w", dtype="uint8", nodata=0, **perfil) as dst:
        capa = np.zeros((alto, ancho), np.uint8)
        capa[q_dnbr] = 1
        capa[q_dnbr_mod] = 2
        if q_pri is not None:
            capa[q_pri & ~q_dnbr] = 3
        dst.write(capa, 1)  # 1 dNBR>0,10 · 2 dNBR>0,27 · 3 sólo Prithvi

    ref = args.referencias.get(caso["id"])
    if ref:
        r = _mascara_referencia(Path(ref), epsg, tf, ancho, alto)
        res["referencia_ha"] = round(hectareas(r & en_aoi))
        res["iou_dnbr010_vs_referencia"] = round(iou(q_dnbr, r & valido), 3)
        if q_pri is not None:
            res["iou_prithvi_vs_referencia"] = round(iou(q_pri, r & valido), 3)

    _vista(img_post, q_dnbr, q_pri, en_aoi, sal / "vista.png", caso, res)
    (sal / "resumen.json").write_text(json.dumps(res, ensure_ascii=False, indent=2))
    return res


def _mascara_referencia(ruta: Path, epsg, tf, ancho, alto) -> np.ndarray:
    from pyproj import Transformer
    from rasterio.features import geometry_mask
    from shapely.geometry import shape
    from shapely.ops import transform as stransform

    gj = json.loads(ruta.read_text())
    feats = gj["features"] if gj.get("type") == "FeatureCollection" else [gj]
    a_utm = Transformer.from_crs(4326, epsg, always_xy=True).transform
    geoms = [stransform(a_utm, shape(f["geometry"])) for f in feats]
    return geometry_mask(geoms, (alto, ancho), tf, invert=True)


def _vista(img_post, q_dnbr, q_pri, en_aoi, ruta, caso, res):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    rgb = np.nan_to_num(np.stack([img_post[2], img_post[1], img_post[0]], -1) / 0.25).clip(0, 1)
    fig, ejes = plt.subplots(1, 2, figsize=(14, 7))
    for ax, titulo, m, color in ((ejes[0], f"dNBR > {DNBR_QUEMADO}: {res['dnbr_ha_mayor_010']:,} ha", q_dnbr, "red"),
                                  (ejes[1], f"Prithvi (nuevo): {res.get('prithvi_ha_nuevo', '—')} ha", q_pri, "orange")):
        ax.imshow(rgb)
        if m is not None:
            ax.contour(m.astype(float), levels=[0.5], colors=color, linewidths=0.6)
        ax.contour(en_aoi.astype(float), levels=[0.5], colors="white", linewidths=0.4, linestyles="dashed")
        ax.set_title(titulo)
        ax.axis("off")
    fig.suptitle(f"{caso['nombre']} — oficial {caso['oficial_ha']:,} ha · después: {res['imagen_despues']}")
    fig.tight_layout()
    fig.savefig(ruta, dpi=110)
    plt.close(fig)


# ---------------------------------------------------------------------------

def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--caso", action="append", help="id de casos.json (repetible); por defecto, todos")
    ap.add_argument("--sin-prithvi", action="store_true", help="sólo dNBR")
    ap.add_argument("--referencia", action="append", default=[], help="id=archivo.geojson con el perímetro oficial")
    args = ap.parse_args()
    args.referencias = dict(r.split("=", 1) for r in args.referencia)

    if not os.environ.get("FIRMS_MAP_KEY"):
        sys.exit("Falta la variable de entorno FIRMS_MAP_KEY (ver el README).")
    if not (os.environ.get("EARTHDATA_TOKEN") or os.environ.get("EARTHDATA_USERNAME")):
        sys.exit("Falta EARTHDATA_TOKEN (o EARTHDATA_USERNAME y EARTHDATA_PASSWORD); ver el README.")
    import earthaccess

    # "environment" lee EARTHDATA_TOKEN o, si no está, usuario y contraseña.
    if not earthaccess.login(strategy="environment"):
        sys.exit("Earthdata rechazó el login: revisar el token (vence a los 60 días) o usar usuario y contraseña.")

    casos = json.loads((AQUI / "casos.json").read_text())["casos"]
    if args.caso:
        casos = [c for c in casos if c["id"] in args.caso]
    resultados = []
    for c in casos:
        print(f"\n=== {c['nombre']} ===", flush=True)
        try:
            r = correr_caso(c, args)
        except Exception as e:  # noqa: BLE001 — un caso roto no frena a los otros
            r = {"id": c["id"], "nombre": c["nombre"], "oficial_ha": c["oficial_ha"], "error": str(e)[:3000]}
        print(json.dumps(r, ensure_ascii=False, indent=2), flush=True)
        resultados.append(r)

    filas = ["| Incendio | Oficial (ha) | dNBR > 0,10 | dNBR > 0,27 | Prithvi (nuevo) | No observable | Antes / después |",
             "|---|---|---|---|---|---|---|"]
    for r in resultados:
        filas.append(
            f"| {r['nombre']} | {r['oficial_ha']:,} | {r.get('dnbr_ha_mayor_010', '—')} | {r.get('dnbr_ha_mayor_027', '—')} | "
            f"{r.get('prithvi_ha_nuevo', r.get('prithvi_error', '—')[:40] if 'prithvi_error' in r else '—')} | "
            f"{r.get('fraccion_no_observable', '—')} | {r.get('imagen_antes', '—')} / {r.get('imagen_despues', r.get('error', '—')[:60])} |")
    (AQUI / "resultados").mkdir(exist_ok=True)
    (AQUI / "resultados" / "resumen.md").write_text(
        f"# Prueba de áreas quemadas — {datetime.now():%Y-%m-%d %H:%M}\n\n" + "\n".join(filas) + "\n")
    (AQUI / "resultados" / "resumen.json").write_text(json.dumps(resultados, ensure_ascii=False, indent=2))
    print("\n" + "\n".join(filas))
    print(f"\nListo: {AQUI / 'resultados'}")


if __name__ == "__main__":
    main()
