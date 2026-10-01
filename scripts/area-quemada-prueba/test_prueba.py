"""Piezas puras de prueba.py (sin red). Correr: python -m pytest test_prueba.py"""
import numpy as np

from prueba import agrupar, dnbr, elegir_grupo, fmask_valido, hectareas, iou


def test_fmask_descarta_nube_sombra_nieve_agua_y_fill():
    f = np.array([0, 1 << 1, 1 << 2, 1 << 3, 1 << 4, 1 << 5, 255, 1 << 6 | 1 << 7, 1])
    assert fmask_valido(f).tolist() == [True, False, False, False, False, False, False, True, True]


def test_dnbr_vegetacion_que_se_quemo_da_positivo_alto():
    # Antes: NIR alto, SWIR2 bajo (vegetación). Después: al revés (carbón).
    d = dnbr(np.array([0.40]), np.array([0.10]), np.array([0.15]), np.array([0.30]))
    assert d[0] > 0.27
    # Sin cambio: dNBR ≈ 0
    assert abs(dnbr(np.array([0.3]), np.array([0.1]), np.array([0.3]), np.array([0.1]))[0]) < 1e-9


def test_dnbr_division_por_cero_da_nan_no_infinito():
    d = dnbr(np.array([0.0]), np.array([0.0]), np.array([0.2]), np.array([0.1]))
    assert np.isnan(d[0])


def test_agrupar_y_elegir_el_incendio_cerca_de_la_semilla():
    incendio = [(-38.77 + i * 0.005, -62.60) for i in range(10)]  # cadena de ~5 km
    otro = [(-38.40, -62.10), (-38.401, -62.10)]  # otra quema, ~55 km
    puntos = incendio + otro
    grupos = agrupar(puntos, 1.5)
    assert sorted(len(g) for g in grupos) == [2, 10]
    g = elegir_grupo(puntos, grupos, (-38.77, -62.60), 40)
    assert len(g) == 10
    assert elegir_grupo(puntos, grupos, (-30.0, -64.0), 40) is None


def test_hectareas_e_iou():
    a = np.zeros((10, 10), bool); a[:5] = True
    b = np.zeros((10, 10), bool); b[:, :5] = True
    assert hectareas(a) == 50 * 0.09
    assert abs(iou(a, b) - 25 / 75) < 1e-9


def test_area_de_analisis_y_grilla_con_focos_simulados(monkeypatch, tmp_path):
    """Focos simulados de un incendio de ~6×4 km cerca de Argerich, más una quema
    lejana que NO tiene que entrar. Verifica el área, la grilla y el recorte."""
    import prueba

    focos = [(-38.77 + i * 0.01, -62.60 + j * 0.01) for i in range(6) for j in range(4)]
    focos += [(-38.20, -62.00)]
    monkeypatch.setattr(prueba, "focos_firms", lambda caso, clave: focos)
    caso = {"semilla": [-38.77, -62.60], "radio_semilla_km": 40}
    aoi, epsg, info = prueba.area_de_analisis(caso, "x")
    assert info["focos_del_incendio"] == 24 and epsg == 32720
    # ~5,5 × 3,3 km de focos + buffers: entre 2.000 y 6.000 ha
    assert 2000 < info["area_analisis_ha"] < 6000, info
    assert not aoi.contains(__import__("shapely.geometry", fromlist=["Point"]).Point(-62.00, -38.20))
    tf, ancho, alto = prueba.grilla(aoi, epsg)
    m = prueba.mascara_aoi(aoi, epsg, tf, ancho, alto)
    assert abs(prueba.hectareas(m) - info["area_analisis_ha"]) / info["area_analisis_ha"] < 0.03


def test_area_recortada_al_pais(monkeypatch):
    """Un incendio sobre la frontera con Chile: lo de Chile queda afuera."""
    import prueba
    from shapely.geometry import Point

    caso = {"semilla": [-41.45, -71.85], "radio_semilla_km": 40}
    focos = [(-41.45, -71.95 + j * 0.01) for j in range(25)]  # cruza el límite
    monkeypatch.setattr(prueba, "focos_firms", lambda c, k: focos)
    aoi, epsg, info = prueba.area_de_analisis(caso, "x")
    assert not aoi.contains(Point(-71.95, -41.45))  # Chile
    assert aoi.contains(Point(-71.75, -41.45))  # Argentina


def test_leer_en_grilla_junta_dos_tiles_y_respeta_nodata(tmp_path):
    import rasterio
    from rasterio.transform import from_origin
    import prueba

    def tile(nombre, x0, valor):
        p = tmp_path / nombre
        with rasterio.open(p, "w", driver="GTiff", height=100, width=100, count=1, dtype="int16",
                           crs="EPSG:32720", transform=from_origin(x0, 5_700_000, 30, 30), nodata=-9999) as d:
            a = np.full((100, 100), valor, np.int16); a[:, -10:] = -9999
            d.write(a, 1)
        return p
    a, b = tile("a.tif", 600_000, 1000), tile("b.tif", 602_700, 2000)
    tf = from_origin(600_000, 5_700_000, 30, 30)
    out = prueba.leer_en_grilla([a, b], 32720, tf, 200, 100, False)
    assert out[50, 10] == 1000           # sólo tile a
    assert out[50, 95] == 2000           # hueco de a (nodata) lo llena b
    assert out[50, 195] == -9999         # sin dato en ninguno
