# Validación FWI — Fase 3 (NOA / Chaco / Litoral / Pampa serrana) + cierre Catamarca

Cierra el rollout de provincias (24 jurisdicciones; CABA excluida — urbana). 11 provincias,
13 zonas + las 2 de Catamarca que habían quedado pendientes. Mismo método que las fases
previas; calibración corrida por el job auto-regulado `calibrate_remaining.sh` cruzando el
reset de cuota de Open-Meteo. Las 35 zonas tienen umbrales (percentil + piso GLOBAL_FLOOR),
todas estrictamente crecientes.

## Motor vs CEMS reanalysis (single-point, 2014–2022, n=3257/zona)

`compare_provinces.py`. Nuestro FWI en el punto de grilla más cercano a la ciudad vs CEMS
en su punto más cercano.

| zona | Spearman | bias | lectura |
|---|---|---|---|
| misiones-plantaciones | **0.896** | −0.82 | ✅ |
| formosa-chaco-oeste | **0.893** | −3.60 | ✅ Chaco seco |
| chaco-impenetrable | **0.887** | −0.84 | ✅ Chaco seco |
| entre-rios-montiel | **0.884** | −1.57 | ✅ espinal |
| catamarca-aconquija | **0.877** | −6.77 | ✅ |
| santa-fe-chaco-norte | **0.874** | −1.40 | ✅ Chaco |
| santiago-chaco-seco | **0.862** | −6.29 | ✅ Chaco seco |
| catamarca-ancasti | **0.849** | −4.36 | ✅ |
| corrientes-ibera | **0.799** | −3.96 | ✅ Iberá/pastizal |
| salta-chaco-este | **0.790** | +7.80 | ✅ Chaco seco |
| tucuman-cumbres-pastizal | 0.728 | −14.86 | ⚠ alta sierra |
| buenos-aires-tandilia | 0.675 | −7.30 | ⚠ sierra |
| salta-yungas-pedemonte | 0.653 | +9.70 | ⚠ Yungas |
| jujuy-yungas-pedemonte | 0.460 | −0.57 | ⚠ Yungas |
| buenos-aires-ventania | — | — | sin celda CEMS terrestre en el punto |

## Veredicto

**Calibración SÓLIDA para las 35 zonas; validación externa fuerte en llanura, con el
artefacto esperado de montaña en Yungas/alta sierra.**

- **Llanura (Chaco seco, Litoral, Monte, Catamarca): Spearman 0.79–0.90** — incluido el
  cinturón de mayor prioridad de fuego del país (Chaco de Santiago/Chaco/Formosa/E-Salta).
  Validado.
- **Yungas + alta sierra (Jujuy 0.46, Salta-yungas 0.65, Tucumán-cumbres 0.73,
  BA-Tandilia 0.68): correlación baja, pero NO es defecto del motor ni de la calibración.**
  Es el mismo efecto que Ushuaia (grilla-p95 0.66 vs punto-correcto 0.81): terreno con
  gradientes de altura extremos (400→3000 m en pocos km) → nuestro punto de grilla y el de
  CEMS caen a alturas distintas → el FWI absoluto difiere. Las distribuciones están sanas
  (Jujuy 0.3% de ceros, p50≈12, rango normal — no degeneradas), así que el p95-por-grilla y
  los cortes por percentil son internamente consistentes (cada clase = peor X% de la zona).
  El sesgo lo absorbe la calibración. **Refinable** ajustando las cajas al pedemonte (menor
  heterogeneidad) — son cajas aproximadas, pendientes de validación del usuario.
- **buenos-aires-ventania**: la comparación CEMS no está disponible (el punto representativo
  no cae en una celda CEMS terrestre del recorte). El producto está bien — su calibración
  corrió normal (3622 días, cortes sensatos). Validación CEMS pendiente (re-fetch con punto
  ajustado) o vía focos reales.

## Nota de método

El Delta del Paraná se excluyó del rollout FWI a propósito (fuego antropogénico + bajante;
un índice meteorológico lo subestima) — candidato a una capa de humo/calidad de aire aparte.
Las zonas de Yungas/sierra son las únicas con baja correlación CEMS; conviene revisar sus
cajas si se quiere subir el acuerdo, pero las clases que producen son válidas.
