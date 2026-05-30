#!/usr/bin/env bash
# P0-2 (2026-05-30) — Genera la zona forestal "tierra-del-fuego" desde MapBiomas
# Argentina Colección 2 (2024), clase 3 "Formación Forestal".
#
# Por qué: el polígono andino-patagonico estaba recortado en lng -68, dejando
# afuera el bosque fueguino → un foco forestal en TdF no tageaba forestZone y un
# civil no lo recibía. Se generó una zona DEDICADA (bbox ajustado + etiqueta
# "Bosque Fueguino") en vez de mezclarla en andino-patagonico.
#
# Mismo pipeline que las demás zonas (ver CLAUDE.md), pero leyendo el GeoTIFF
# nacional por rango (/vsicurl) — son 650 MB y soporta accept-ranges, así que solo
# se baja la ventana fueguina. Requiere gdal + mapshaper. NO corre en CI.
set -euo pipefail

URL="/vsicurl/https://storage.googleapis.com/mapbiomas-public/initiatives/argentina/collection-2/coverage/argentina_coverage_2024.tif"
export GDAL_DISABLE_READDIR_ON_OPEN=EMPTY_DIR CPL_VSIL_CURL_ALLOWED_EXTENSIONS=.tif GDAL_HTTP_MULTIRANGE=YES VSI_CACHE=TRUE
OUT="src/lib/forest-polygons/tierra-del-fuego.json"

# 1) Ventana fueguina argentina + downsample a ~500m (usa overviews del COG).
#    -te xmin ymin xmax ymax  (borde oeste -68.7 ≈ meridiano límite con Chile).
gdalwarp -q -overwrite -te -68.7 -55.3 -65.0 -52.5 -tr 0.005 0.005 -r near \
  -t_srs EPSG:4326 "$URL" /tmp/tdf_lc.tif

# 2) Máscara forest (clase 3) → binaria, 0 = nodata.
gdal_calc.py -A /tmp/tdf_lc.tif --A_band=1 --calc="(A==3)*1" \
  --outfile=/tmp/tdf_forest.tif --NoDataValue=0 --type=Byte --quiet --overwrite

# 3) Polygonize (solo forest; el mask usa nodata=0).
rm -f /tmp/tdf.geojson
gdal_polygonize.py /tmp/tdf_forest.tif -b 1 -mask /tmp/tdf_forest.tif -q \
  -f GeoJSON /tmp/tdf.geojson DN

# 4) Limpieza/simplificación: islas >20km², dissolve, simplify 2%, clean, 3 decimales.
mapshaper /tmp/tdf.geojson -filter 'DN === 1' -filter-islands min-area=20km2 \
  -dissolve -simplify dp 2% keep-shapes -clean \
  -o precision=0.001 format=geojson /tmp/tdf_simplified.geojson

# 5) GeoJSON → Polygon[][] (anillo exterior, formato del repo). Ver el convertidor
#    usado en la sesión; produce el array que consume forest-zones-geo.ts.
#    Resultado: ~250 polígonos, ~38 KB.
echo "Generá $OUT desde /tmp/tdf_simplified.geojson (MultiPolygon → Polygon[][])."
echo "Verificación: Ushuaia y Tolhuin deben caer dentro del buffer WUI de 5 km."
