# Prueba de áreas quemadas: dNBR vs. Prithvi BurnScars

Pregunta: **¿podemos darle a un municipio "cuántas hectáreas se quemaron y dónde"
con números confiables?** Se comparan dos métodos sobre cuatro incendios reales
de Argentina, contra la cifra oficial de cada uno.

- **dNBR**: método clásico, sin inteligencia artificial. Compara una imagen de
  antes y una de después; donde la vegetación "se apagó", se quemó. Gratis y
  liviano.
- **[Prithvi-EO-2.0-300M-BurnScars](https://huggingface.co/ibm-nasa-geospatial/Prithvi-EO-2.0-300M-BurnScars)**
  (IBM + NASA, Apache-2.0): un modelo de IA que pinta el área quemada en una
  imagen. Precisión publicada: IoU 87,5 % — pero **entrenado con ~800 recortes
  de Estados Unidos**. Acá se mide si funciona en Argentina.

Las dos usan imágenes **HLS** (Landsat + Sentinel-2 a 30 m) de la NASA: una
pasada útil cada 2–3 días, publicada ~1,7 días después. Sirven para el reporte
**posterior** al incendio, no para avisar.

## Los cuatro incendios

| Caso | Fechas | Ambiente | Cifra oficial |
|---|---|---|---|
| Capilla del Monte – Los Cocos (Córdoba) | desde 19/9/2024 | Sierras | **42.046 ha** — IDECOR, cartografía oficial |
| Villarino, Argerich – Ombucta (Bs. As.) | 31/12/2025 – 2/1/2026 | Campo, pastizal, monte | **~20.000 ha** — preliminar del municipio |
| Los Manzanos, PN Nahuel Huapi (Río Negro) | 25/12/2024 – mar/2025 | Bosque andino-patagónico | **11.475 ha** — PN Nahuel Huapi, mapa al 25/2/2025 (lado argentino) |
| Puerto Patriada – El Hoyo (Chubut) | desde 5/1/2026 | Bosque nativo, plantaciones | **22.293 ha** al 27/1 (SPMF); "más de 30.000" al extinguirse |

Fuentes: [IDECOR 2024](https://obs-idecor-mapas-docs.obs.sa-argentina-1.myhuaweicloud.com/m505/informe_anual_de_areas_afectadas_por_incendios_forestales_2024.pdf) ·
[Villarino (La Nueva)](https://www.lanueva.com/nota/2026-1-2-20-32-0-incendio-rural-en-villarino-mas-de-20-mil-hectareas-afectadas-y-no-hubo-victimas) ·
[Nahuel Huapi (Red43)](https://www.red43.com.ar/nota/2025-2-26-9-15-53-ya-consumieron-cerca-de-25-mil-hectareas-los-incendios-en-parque-nacional-nahuel-huapi) ·
[Puerto Patriada (Red43)](https://www.red43.com.ar/nota/2026-1-27-9-45-16-incendio-de-puerto-patriada-mas-de-22-mil-hectareas-afectadas-y-un-sector-que-sigue-activo-en-todo-su-perimetro) ·
[extinción (Diario Crónica)](https://www.diariocronica.com.ar/noticias/2026/03/28/136121-el-incendio-en-puerto-patriada-fue-declarado-extinguido)

> ⚠️ El área de análisis **no** sale de las coordenadas de `casos.json` (son
> aproximadas): sale de las detecciones VIIRS del propio incendio. El script
> informa cuántos focos usó y su centro: si el número es chico o el centro no
> cae donde debería, la semilla está mal.

## Cómo correrlo (desde tu compu: NASA bloquea los servidores en la nube)

```bash
cd scripts/area-quemada-prueba
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Earthdata: urs.earthdata.nasa.gov → Profile → Generate Token
export EARTHDATA_TOKEN='...'
# La misma clave de FIRMS que usa el sitio
export FIRMS_MAP_KEY='...'

python prueba.py --sin-prithvi   # primero sólo dNBR: rápido, y valida todo lo demás
python prueba.py                 # después, con Prithvi
```

Si `earthaccess` no acepta el token, usar usuario y contraseña de Earthdata:
`export EARTHDATA_USERNAME=... EARTHDATA_PASSWORD=...`.

**Prithvi** baja el modelo (~1,2 GB) de Hugging Face la primera vez y corre en
CPU; en una GPU va mucho más rápido. Se llama a la inferencia oficial del
repositorio del modelo (`inference.py`). Si falla, el script guarda el error y
la ayuda de ese programa en `prithvi_error`, sin frenar el dNBR: mandámelo y lo
ajusto.

Para Córdoba se puede medir el **contorno**, no sólo el total, si se descarga el
polígono oficial de IDECOR en GeoJSON:

```bash
python prueba.py --caso cordoba-capilla-del-monte-2024 \
  --referencia cordoba-capilla-del-monte-2024=idecor_2024.geojson
```

## Qué devuelve

`resultados/resumen.md` (la tabla comparativa) y, por incendio, en
`resultados/<caso>/`: `resumen.json`, `vista.png` (imagen de después con los dos
contornos), `quemado.tif` (1 = dNBR > 0,10 · 2 = dNBR > 0,27 · 3 = sólo Prithvi),
`dnbr.tif` y `area_analisis.geojson`. **Mandame la carpeta `resultados/`** (sin
`cache/`, que pesa varios GB).

## Cómo se lee

- **dNBR > 0,10**: "algo se quemó", incluye severidad baja. **> 0,27**:
  severidad moderada o más. La cifra oficial suele caer entre las dos.
- **Prithvi (nuevo)**: lo que el modelo ve quemado DESPUÉS y no ANTES (descuenta
  cicatrices viejas).
- **No observable**: fracción del área tapada por nubes, sombra o sin dato en
  alguna de las dos imágenes. Si pasa del ~20 %, el total sale bajo.
- Las cifras oficiales no son la verdad absoluta (Villarino es preliminar;
  Patriada tiene dos cifras oficiales que no coinciden). La que mejor sirve de
  vara es la de IDECOR.

## Tests

`python -m pytest test_prueba.py` — piezas que no necesitan red: máscara de
nubes, dNBR, agrupado de focos, área de análisis (con focos simulados), recorte
a la Argentina y mosaico de imágenes.
