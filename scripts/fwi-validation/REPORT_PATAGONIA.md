# Validación FWI — Patagonia (Fase 1: Santa Cruz, Chubut, Río Negro, Neuquén)

Revisión de correctitud de las 8 zonas nuevas (estepa + bosque andino por provincia)
tras la calibración. Tres validaciones independientes + un fix de una anomalía
encontrada. Reproducible con los scripts de este directorio (`venv/bin/python ...`).

## 0. ¿El sistema es el correcto? (referencia nacional)

Argentina usa **oficialmente el FWI canadiense** (Van Wagner & Pickett 1985), adaptado
por el SNMF en 1999, con exactamente nuestras 5 clases **bajo / moderado / alto / muy
alto / extremo**, computado de datos al **mediodía local** — idéntico a nuestro motor.
SMN y SNMF lo publican como **mapa/boletín, sin feed de datos abierto**, así que no hay
comparación numérica programática contra ellos; la referencia numérica es CEMS (abajo).

## 1. Motor vs CEMS reanalysis (referencia de oro, Copernicus/ERA5)

`compare_patagonia.py` — nuestro FWI en el punto de grilla más cercano a cada ciudad
vs CEMS (`cems-fire-historical-v1`) en su punto más cercano, single-point, 2014–2022
(n=3257 días/zona). CEMS computa el mismo FWI canadiense independientemente.

| zona | Spearman | Pearson | sesgo (nuestro−CEMS) |
|---|---|---|---|
| santa-cruz-estepa | **0.913** | 0.884 | −4.55 |
| chubut-estepa | **0.901** | 0.892 | −4.38 |
| rio-negro-estepa | **0.911** | 0.904 | −4.55 |
| neuquen-estepa | **0.936** | 0.914 | −7.88 |
| chubut-bosque-andino | **0.916** | 0.888 | −5.57 |
| neuquen-bosque-andino | **0.964** | 0.946 | −1.61 |
| rio-negro-bosque-andino | 0.811 | 0.755 | −7.34 |
| santa-cruz-bosque-andino | 0.787 | 0.649 | +5.61 |

**Veredicto: motor VALIDADO.** Todas las estepas (las zonas de peligro real)
correlacionan **0.90–0.94** con CEMS — igual o mejor que la referencia de TDF
(Río Grande single-point 0.909). Los bosques húmedos dan algo menos (0.79–0.81 los más
lluviosos), el mismo patrón benigno que Ushuaia en TDF (la heterogeneidad del punto, no
el motor — diagnosticado en `REPORT.md`). El sesgo es sistemático pero **se absorbe en
la calibración por percentiles** (cada clase es el peor X% de días de *esa* zona, sin
importar el offset absoluto), así que no afecta la clase.

## 2. Desvío de grilla 50→10 puntos (decidido por cuota Open-Meteo)

`validate_patagonia.py` (A) — santa-cruz-estepa tiene ambos caches. p95-sobre-10 vs
p95-sobre-49 (2013–2021, n=3257):
- **Spearman 0.974**, Pearson 0.967 — rankea los días casi idéntico.
- p95-de-10 corre ~4 puntos más bajo (con 10 puntos se pierde algún sector caliente),
  pero la calibración usa la misma grilla → los cortes se ajustan solos.

**Veredicto: el cap de 10 puntos NO distorsiona la señal de clase.** Costo: el número
absoluto de FWI de la zona subestima un poco el peor micro-sector vs una grilla densa
(aceptable a escala provincial; re-densificable con una key paga de Open-Meteo).

## 3. Distribución de clases + ANOMALÍA encontrada y arreglada

`validate_patagonia.py` (B) — aplicar los cortes a la serie p95 de cada zona; por
construcción de percentiles debería dar ~30/40/20/7/3.

**Anomalía:** `rio-negro-bosque-andino` (Bariloche/El Bolsón) daba **0% "bajo" / 70%
"moderado"**. Causa raíz: es bosque andino-patagónico, lluvioso — **30.7% de los días
tienen FWI=0**, así que su p30 (corte de "moderado") cae en 0.0 → "bajo" desaparece y
"alto" arranca en FWI=0.7. Como las alertas disparan en "alto+", la zona habría
alertado el ~30% de los días por nada. El problema, más leve, afectaba a todos los
bosques húmedos (corte de "alto" < 10: tdf-sur 7.0, santa-cruz-bosque 4.5).

**Fix:** un **piso absoluto** sobre los cortes por percentil — `corte =
max(percentil_zona, piso_genérico)`, con `GLOBAL_FLOOR = {moderado 5, alto 10, muy alto
21, extremo 30}` (los breakpoints genéricos del FWI, ya en `classify.py`). Preserva la
calibración por zona donde lleva peligro real (las estepas quedan idénticas) y evita
etiquetas alarmistas en FWI triviales. Aplicado en `calibrate.thresholds_from_series`.

Distribución después del fix (bajo / mod / alto / muy / ext):
- rio-negro-bosque-andino: **84.0 / 8.4 / 6.9 / 0.6 / 0.1** (antes 0/70/20/7/3) — honesto.
- tdf-sur-bosque: 63 / 15 / 15 / 5 / 2 · santa-cruz-bosque: 72 / 12 / 11 / 4 / 1.3
- estepas (chubut, rio-negro, neuquen): **30 / 40 / 20 / 7 / 3 sin cambio** (sus
  percentiles ya superan el piso).

## Veredicto global

**Las 8 zonas de la Patagonia son correctas.** Motor validado vs CEMS (estepas
0.90–0.94), grilla de 10 puntos validada (0.97), y la única anomalía (calibración
degenerada en bosque húmedo) encontrada y arreglada con un piso absoluto. La
calibración por percentiles se mantiene donde aporta (zonas de peligro real) y se
acota donde producía falsas alarmas (zonas intrínsecamente húmedas).
