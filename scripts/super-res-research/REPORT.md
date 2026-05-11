# WHI-549 research — Super-resolución sobre GOES FDC para CLARA

**Date:** 2026-05-11
**Tipo:** Spike de investigación (no implementación). El ticket pidió evaluar si vale la pena aplicar un modelo de super-resolución open source sobre las imágenes GOES (2km) para llevarlas a 500m-1km y mejorar la detección de focos chicos.

## TL;DR — **No vale la pena en v1**. Defer indefinidamente.

Los modelos open source de super-resolución (SRCNN, ESRGAN, Real-ESRGAN, etc.) están entrenados sobre imágenes naturales (fotos), no sobre datos térmicos satelitales. Aplicarlos sobre GOES FDC produce alucinaciones plausibles pero no genera información térmica real. Para mejorar genuinamente la detección de focos chicos necesitaríamos un modelo entrenado con dataset propio — exactamente lo que hace Satellites On Fire — y eso queda explícitamente fuera del scope de CLARA.

## Por qué no funciona "out of the box"

### 1. El producto FDC ya está pre-procesado por NOAA

La GOES FDC `Mask` no es una imagen — es una **clasificación discreta** por pixel (códigos 10/11/13/30/31/33 = fuego con distintas confianzas, 40 = no-fuego, 100 = bowtie, etc.). Super-resolución sobre una matriz de etiquetas categóricas es matemáticamente sin sentido (no hay continuidad para interpolar).

Si quisiéramos super-resolución, tendríamos que ir un nivel atrás:
- **ABI L1b RadF** (canales crudos de brillo térmico) → super-resolver eso → re-correr el algoritmo de detección custom (que es lo que hace SoF)

Eso ya no es spike, es un proyecto completo.

### 2. Modelos open source están entrenados sobre fotos

| Modelo | Entrenamiento | Aplicable a térmico? |
|---|---|---|
| SRCNN | ImageNet (fotos RGB) | No — el espacio de color no coincide |
| ESRGAN | DIV2K (fotos HD) | No — alucina texturas naturales |
| Real-ESRGAN | Web images + degradation model | No — peor, optimiza para "look good", no precisión |
| SwinIR | DIV2K + Flickr2K | No por la misma razón |

Aplicarlos sobre la banda 7 (3.9 μm, MWIR) o 14 (11 μm, LWIR) genera artefactos que parecen detalle pero no son.

### 3. Modelos térmicos open source son raros

Existen algunos papers académicos (eg. "Thermal Image Super-Resolution" Zhu et al. 2020) con código en GitHub, pero:
- Datasets muy chicos (~1000 imágenes)
- No generalizan a sensores espaciales como GOES ABI
- Resolución de entrada típica 64×64, no 5424×5424

### 4. La latencia de un modelo grande mata el caso de uso

Real-ESRGAN x4 sobre una imagen 5424×5424 toma ~15s en GPU consumer (RTX 3090), y mucho más en CPU. Vercel functions no tienen GPU; sin GPU es prohibitivo. Modal Labs o Replicate.com cobran ~$0.01-0.05 por inference, no apto para 144 scans/día.

## Estimación de costo si se quisiera hacer "bien"

(O sea: replicar parte de lo que hace SoF.)

| Componente | Tiempo | Costo |
|---|---|---|
| Curar dataset (focos validados + crudo ABI radiances) | 3-6 meses | $0 + tiempo |
| Entrenar modelo custom (U-Net o transformer sobre par L1b → focos validados) | 2-4 meses | ~$500-2000 GPU |
| Validar + Pasquill threshold tuning | 1-2 meses | Tiempo |
| Deployar | 1 mes | $50-200/mes inference compute |

Total: **6-12 meses de trabajo dedicado**.

## Lo que CLARA puede hacer en su lugar (alternativas pragmáticas)

### A. Mejorar filtros (más leverage por hora de trabajo)
- **WHI-583 v3** — polígono GADM real + cross-check clima + zonas agrícolas. Probable que mueva la precisión +20-30% sin tocar resolución espacial.
- Filtrar por persistencia (WHI-546 v2 ya implementado) — un foco real persiste, ruido no.

### B. Agregar fuentes complementarias
- **NASA FIRMS** ya nos da 375m de resolución cuando confirma. La UX de doble confirmación (WHI-547) saca provecho de eso.
- **Sentinel-2 / Landsat** tienen mejor resolución (10-30m) pero pasada cada 5-10 días — útil para validación retrospectiva, no para tiempo real.

### C. Reconocer lo que SoF hace mejor y co-existir
- El proyecto explicitamente se posiciona como complemento, no competencia.
- Si un usuario necesita detección de focos chicos en zona específica, recomendarle SoF (ya está en `/about`).

## Recomendación final

**No implementar super-resolución.** Cerrar este ticket como "investigado, no procede en v1".

Re-evaluación condicional:
- Si en 2-3 años aparece un modelo open source pre-entrenado específicamente para detección de fuego desde GOES/Sentinel — barato de correr, bien validado — re-abrir.
- Mientras tanto, todo el effort va a filtros, fuentes y UX.

## Bibliografía consultada (referencias para futuras revisiones)

- NOAA GOES-R Product User Guide rev 6, sección FDC
- Zhu et al. 2020 "Thermal Image Super-Resolution Challenge"
- Wang et al. 2021 "Real-ESRGAN: Training Real-World Blind Super-Resolution"
- Satellites On Fire — papers/blog del equipo Rodríguez Viau
- NOAA ABI L1b RadF documentation (entrada potencial si algún día se hace pipeline propio)

---

*Decision logged: 2026-05-11 — CLARA continúa con resolución nativa GOES 2km + filtros progresivos.*
