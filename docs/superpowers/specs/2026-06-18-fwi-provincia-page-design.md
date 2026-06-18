# Capa de prevención — Página de peligro por provincia (Milestone 2)

**Fecha:** 2026-06-18
**Estado:** Diseño aprobado (brainstorming) — pendiente plan de implementación
**Disparador:** El Milestone 1 (motor FWI) ya corre en producción y llena las tablas `danger_zones` / `fire_danger` / `fire_danger_state` para Tierra del Fuego. Falta la **primera superficie visible**: una página pública que muestre ese peligro. Es el entregable demostrable para Leonardo (manejo del fuego, TDF).
**Spec padre:** `docs/superpowers/specs/2026-06-17-prevencion-fwi-design.md` (§6.1). Este documento concreta ese milestone.

---

## 1. Problema y oportunidad

El motor calcula el FWI por zona pero hoy es **invisible** (solo datos en Supabase). El M2 expone esos datos en una página pública mapa-céntrica: una **herramienta operativa** para ver, de un vistazo, el peligro de incendio de cada zona de una provincia y su pronóstico a 16 días. Objetivo explícito del usuario: **algo visual y revisable en un preview cuanto antes** (MVP visual primero, refinamientos después).

## 2. Objetivos / No-objetivos

**Objetivos (MVP):**
- Página pública `/[provincia]` (primera: `/tierra-del-fuego`), mapa-céntrica, con las zonas pintadas por clase de peligro.
- Panel lateral operativo: peligro general, peligro por zona con drivers (temp / HR / viento / FWI), slider de pronóstico (hoy → 16 días), y tendencia.
- Capa de detección (focos GOES/FIRMS) superpuesta y conmutable.
- SEO completo (metadata + JSON-LD + OG).
- Generalizable: sumar una provincia = tener zonas suyas en `danger_zones`, sin tocar la página.

**No-objetivos (MVP):**
- Endpoint público `/api/fire-danger` (se difiere; la página lee Supabase directo en el server component).
- Polígonos curados de las zonas (se usan los **bbox** como área provisional; los sectores oficiales llegan de Leonardo, ver §11).
- Capa de equipo / login / controles para el cliente provincial (Milestone posterior).
- Integración del bot Telegram (es el Milestone 3).
- Calibración de umbrales / más provincias calibradas (Milestone 4).

## 3. Decisiones del brainstorming

- **Forma = mapa-céntrico** (como `/mapa`): mapa grande protagonista + panel lateral, **sin footer**. Tono herramienta operativa, no página de marketing. (Descartado: dashboard scrolleable tipo `/ciudad`.)
- **Zonas = áreas (bbox sombreado) por clase + punto al centro.** El bbox se pinta translúcido del color de la clase; un marcador en el punto representativo lleva el valor. Cuando lleguen los polígonos oficiales, **reemplazan el bbox sin cambiar el resto**. (Descartado: solo faros/markers; halos difusos.)
- **MVP incluye:** core (mapa + zonas + panel + slider) **+ SEO + capa de detección + tendencia**. Todo en el primer preview.
- **Datos = server component** que lee Supabase directo; el slider opera **client-side** sobre los datos ya cargados.
- **Reúso máximo** de la estética y componentes actuales (mapa Leaflet, panel `.clp-*`, `Pill`, tokens, patrón SEO de ciudad). Sin lenguaje visual nuevo.

## 4. Arquitectura

### 4.1 Ruta y layout
- `app/[provincia]/page.tsx` + `app/[provincia]/layout.tsx` (layout propio **sin footer**, espejo de `app/mapa/layout.tsx`: Nav + EmberParticles + children, full-height).
- **SSG** vía `generateStaticParams()` que devuelve **solo las provincias con zonas** en `danger_zones` (consulta a Supabase en build/ISR). Hoy: `tierra-del-fuego`. `dynamicParams = false` → cualquier otro slug da 404.
- **ISR**: `export const revalidate = 3600` (los datos cambian 1×/día con el cron; 1h es holgado y barato).
- **Routing — nota para el plan:** un segmento dinámico `[provincia]` a nivel raíz convive con las rutas estáticas existentes (`/mapa`, `/dashboard`, `/login`) y con el route group `(main)` (que no agrega path). Las rutas estáticas tienen precedencia sobre el dinámico, y `dynamicParams = false` evita capturar slugs ajenos. El plan **debe verificar en build** que no haya conflicto "two parallel pages". **Fallback documentado** si Next.js rechaza la convivencia: prefijar a `/peligro/[provincia]` (segmento estático único, mismo diseño, URL menos limpia).

### 4.2 Flujo de datos
1. El server component resuelve `provincia` → busca sus zonas en `danger_zones` (id, name, lat, lng, bbox).
2. Lee de `fire_danger` las filas de esas zonas para el **último `computed_at`** (los 16 `target_date` del pronóstico vigente), ordenadas por zona y fecha.
3. Arma una estructura por zona: `{ id, name, lat, lng, bbox, forecast: [{ target_date, fwi, danger_class, temp, rh, wind, precip }] }` y la pasa como prop al componente cliente del mapa+panel.
4. El cliente renderiza el día seleccionado (default: el primero = hoy) y repinta al mover el slider — **sin red**.

Acceso: `getSupabase()` (server-only, service role) como las páginas de ciudad. La capa de focos sí usa el fetch client a `/api/fires` existente (igual que `/mapa`).

## 5. El mapa

Reúsa el patrón de `/mapa` (Leaflet, dynamic import `ssr:false`, tiles CartoDB Light), centrado/zoom al **bbox de la provincia** (unión de los bbox de sus zonas, con padding).

**Capa Prevención (default ON):**
- Por cada zona, un `L.rectangle` (o `L.geoJSON` del bbox) con `fillColor` = color de la clase del día seleccionado, `fillOpacity ≈ 0.22`, borde tenue.
- Un `L.circleMarker` en el punto representativo con el color de la clase y un tooltip (zona + FWI + clase + drivers).
- Helper nuevo `paintDangerZones(group, zones, selectedDate)` que limpia y repinta el grupo cuando cambia el día. Cuando una zona tenga `geometry` (jsonb) no-nula, pinta el polígono en vez del bbox — sin más cambios.

**Capa Detección (toggle, default OFF):**
- Reúsa la capa de focos GOES/FIRMS de `/mapa` (`/api/fires`), filtrada al bbox de la provincia. Mismo styling existente (forestal vs no-forestal).

**Leyenda:** escala de color `bajo → moderado → alto → muy alto → extremo` (overlay en una esquina del mapa).

## 6. El panel lateral

Reúsa las clases `.clp-*` (`.clp-panel`, `.clp-block`, `.clp-title`, `.clp-label`, `.clp-chip`, `.clp-pill`) y el componente `Pill`.

- **Encabezado:** nombre de la provincia + "Peligro de incendio · {fecha del día seleccionado}".
- **Peligro general:** `Pill` con la clase **máxima** entre las zonas del día seleccionado (la peor manda).
- **Slider de pronóstico:** control de los 16 `target_date` disponibles (etiquetas legibles: Hoy / Mañana / día+N o la fecha). Mover → actualiza panel + mapa. Implementación: `<input type=range>` o chips; el plan elige, pero debe ser usable en mobile.
- **Lista de zonas:** por zona, una fila con nombre, dot/`Pill` de clase, FWI del día, y los drivers (temp, HR, viento). Click en una zona → centra/resalta en el mapa.
- **Tendencia:** mini-gráfico (Recharts, ya en el stack) del FWI a 16 días, por zona o agregado — una línea con bandas de color por clase. Componente nuevo `<DangerTrend>`.
- **Footer del panel:** toggle "Mostrar focos activos (detección)" + nota de fuentes (Open-Meteo + FWI canadiense / SNMF).

**Responsive:** en mobile el panel pasa a drawer deslizable (mismo patrón que el rediseño de `/mapa`).

## 7. SEO

- `generateMetadata({ params })`: title "Peligro de incendios en {Provincia} — AlertaForestal", description con el estado actual, canonical, OG + Twitter.
- JSON-LD `Place` + `GeoCoordinates` de la provincia (patrón de las páginas de ciudad).
- `sitemap.ts`: agregar las URLs de provincia (las que tienen zonas).
- OG: reúsa el `ImageResponse` dinámico existente, parametrizado por provincia.

## 8. Componentes — reúso vs nuevo

**Reúsa (existe):**
- Mapa Leaflet + loader (`src/components/map/argentina-map.tsx`, `map-loader.tsx`) — se extiende para aceptar las zonas de peligro como prop y la capa de prevención. (Si extender `argentina-map` lo vuelve demasiado grande, el plan puede derivar un `<ProvinceMap>` que comparta helpers.)
- Panel `.clp-*` (`globals.css`), `Pill` (`clara-ui.tsx`), tokens de color, patrón SSG/SEO de `ciudad`.
- Capa de focos + `/api/fires`.

**Nuevo (no existe):**
- `app/[provincia]/page.tsx` + `layout.tsx` (server component + layout sin footer).
- `paintDangerZones()` — pinta bbox/polígono por clase, repintable por día.
- `<DangerPanel>` — el panel lateral (encabezado, slider, lista de zonas, toggle).
- `<DangerTrend>` — mini-chart de tendencia (Recharts).
- `generateMetadata` + JSON-LD por provincia; entradas de sitemap.
- Mapa color↔clase compartido (`DANGER_CLASS_COLORS`) en un módulo client-safe (reusa los tokens), para mapa y panel.

## 9. Colores (clase → token)

| Clase | Token | Hex |
|---|---|---|
| bajo | `--good` | #4d8f54 |
| moderado | `--warn` | #bd8512 |
| alto | `--bad` | #d2541d |
| muy alto | `--danger` | #c23a3a |
| extremo | `--danger` (intensificado) | #c23a3a |

(`Pill` ya tiene tones `good/warn/bad/danger`; "muy alto" y "extremo" comparten `danger`, con el peor distinguible por etiqueta.)

## 10. Riesgos y mitigaciones
- **Mapa "vacío" con 2 zonas** → áreas sombreadas (no solo puntos) dan cuerpo; leyenda + panel completan la vista.
- **Áreas bbox toscas** → opacidad baja + bordes tenues; y son provisionales hasta los polígonos oficiales (drop-in replace).
- **Colisión de routing `[provincia]` raíz** → `dynamicParams=false` + verificación en build; fallback `/peligro/[provincia]` (§4.1).
- **`argentina-map.tsx` ya es grande** → preferir un `<ProvinceMap>` derivado que reuse helpers antes que inflar el componente existente.
- **Datos ausentes** (provincia sin pronóstico del día) → estado vacío claro ("sin datos de pronóstico"), no romper la página.

## 11. Preguntas abiertas (para Leonardo / futuro)
- Geometrías de los **sectores oficiales** de manejo del fuego de TDF (reemplazan los bbox).
- ¿Etiquetas/nombres oficiales de las zonas que prefiera el cliente?

## 12. Secuencia de entrega (dentro del M2)
1. **Ruta + datos:** `app/[provincia]/` (layout sin footer) + server component que lee Supabase + estructura por zona. Render mínimo (lista de zonas en texto) para validar datos. ← primer preview navegable.
2. **Mapa prevención:** `<ProvinceMap>` + `paintDangerZones` (áreas por clase + punto). ← preview visual.
3. **Panel + slider:** `<DangerPanel>` con peligro general, lista de zonas con drivers, slider de pronóstico (repinta mapa).
4. **Tendencia:** `<DangerTrend>` (Recharts).
5. **Detección:** capa de focos conmutable.
6. **SEO:** metadata + JSON-LD + sitemap + OG.
