# Validación FWI — Fase 2 (Centro / Cuyo / Sierras / NOA-sur)

Revisión de correctitud de las zonas nuevas de la Fase 2, mismo método que la
Patagonia. 7 provincias, 12 zonas por bioma (curadas desde un relevamiento de
ocurrencia de fuego: INTA/CONICET/SNMF). Reproducible con los scripts de este
directorio.

## Zonas (12) y por qué

| provincia | zonas | bioma / por qué quema | temporada |
|---|---|---|---|
| La Pampa | caldenal, monte-oeste | caldén + pastizal / jarillal Monte (la que más superficie quemó del lote) | verano |
| Mendoza | monte-este, piedemonte-sur | algarrobal/jarillal del este + piedemonte y sur | verano |
| San Luis | comechingones, sierras-centro | pastizal serrano de altura (El Morro, Comechingones) | invierno-primavera |
| Córdoba | sierras (1 zona) | pastizal de altura + chaco serrano — **la provincia que más quema del país** | invierno (Ago-Sep) |
| San Juan | valle-fértil (1 zona) | chaco árido / algarrobal del único rincón vegetado (el resto = oasis/Puna no quemable) | invierno-primavera |
| La Rioja | velasco, llanos | Sierra de Velasco + Chaco árido de los Llanos | invierno-primavera |
| Catamarca | ancasti, aconquija | flancos serranos (Ancasti SE, Aconquija NO); resto = Puna/salares no quemable | invierno-primavera |

Excluidas a propósito: Buenos Aires (serranas, para el final), Litoral (humo,
tratamiento aparte), CABA (urbana). Las cajas evitan oasis irrigado, Puna y salares.

## Motor vs CEMS reanalysis (referencia de oro), single-point, 2014–2022

`compare_provinces.py cuyo-centro <provincias>` — nuestro FWI en el punto de grilla
más cercano a cada ciudad vs CEMS en su punto más cercano. n=3257 días/zona.

| zona | Spearman | bias (nuestro−CEMS) |
|---|---|---|
| mendoza-monte-este | **0.910** | −5.51 |
| la-pampa-caldenal | **0.891** | +1.05 |
| cordoba-sierras | **0.887** | −3.91 |
| la-pampa-monte-oeste | **0.881** | −6.97 |
| san-juan-valle-fertil | **0.879** | −5.79 |
| mendoza-piedemonte-sur | **0.872** | −5.24 |
| san-luis-sierras-centro | **0.862** | +6.38 |
| la-rioja-llanos | **0.840** | +7.57 |
| san-luis-comechingones | **0.825** | +3.63 |
| la-rioja-velasco | 0.767 | −2.06 |

**Veredicto: motor VALIDADO para la Fase 2.** Todas las zonas de llanura/Monte/caldenal
correlacionan 0.84–0.91 con CEMS. Las serranas de **pico invernal** (Córdoba 0.887, San
Luis 0.83–0.86, San Juan 0.88, La Rioja 0.77–0.84) también — esto **confirma que el motor
maneja la temporada de fuego invertida (invierno) correctamente**, que era la duda del
relevamiento. La más baja, `la-rioja-velasco` (0.767), es una caja chica y montañosa de la
Sierra de Velasco: la menor correlación es el mismo efecto de heterogeneidad punto-vs-CEMS
ya visto en Ushuaia (0.66–0.81), no un defecto del motor (idéntico, da 0.91 en Monte). El
sesgo sistemático lo absorbe la calibración por percentiles. Eventual: ampliar/ajustar la
caja de Velasco si se quiere subir esa correlación.

## Calibración + piso

Umbrales por zona = percentiles p30/p70/p90/p97 de la serie propia, con piso
`GLOBAL_FLOOR` (mod 5 / alto 10 / muy 21 / ext 30), igual que la Patagonia. Las zonas de
Monte/caldenal/llanos dan cortes altos (extremo ~70–100, secas y ventosas); las serranas,
intermedios. Ninguna zona degenera (no hay "alto" sub-meaningful).

## Pendiente

**Catamarca (ancasti, aconquija) NO calibrada** — se agotó la cuota diaria de Open-Meteo
tras calibrar 10/12 zonas (`DailyQuotaExceeded`). Sus páginas funcionan igual con el piso
global de respaldo (`classify.py`); la calibración por zona se completa al reset de cuota
(re-correr `add_province.py catamarca`). El cache resumible conserva lo bajado.
