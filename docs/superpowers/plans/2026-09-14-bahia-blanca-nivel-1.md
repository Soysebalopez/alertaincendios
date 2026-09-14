# Bahía Blanca · Nivel 1 (WHI-907 + WHI-908) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** que AlertaForestal detecte y avise mejor en Bahía Blanca sin costo de datos (rayos reales, viento local, hora de llegada del frente, cono en el mapa, página propia), corrija la dirección del viento invertida en las alertas y retire la función de bomberos — todo en una sola rama.

**Architecture:**
- **Lógica pura y testeable:** en `src/lib/*` (TypeScript, Vitest) y en módulos Python chicos (pytest).
- **Ingestas:** funciones Python de Vercel disparadas por pg_cron, siguiendo el patrón de `api/goes-sync.py`.
- **Presentación:** rutas de Next 16 y Leaflet directo.
- **Degradación limpia:** cada fuente nueva funciona "apagada" si falta su credencial o su tabla, sin romper lo que ya anda.

**Tech Stack:** Next.js 16 · TypeScript · Vitest · Leaflet 1.9.4 · Supabase (pg_cron + pg_net) · Python 3.12 en Vercel (xarray, netCDF4, boto3) · pytest.

**Spec:** Linear [WHI-907](https://linear.app/white-bay/issue/WHI-907) (partes 1–11 + addons) y [WHI-908](https://linear.app/white-bay/issue/WHI-908) (viento invertido). Plan **preaprobado por Seba el 14/9/2026**, que también levantó el code freeze de AlertaForestal.

## Global Constraints

- **Rama y commits:**
  - Una sola rama: `feat/whi-907-bahia-blanca-nivel-1`. Nunca commitear a `main`.
  - Un commit por tarea, con prefijo convencional y mensaje en inglés. La UI y los textos al usuario, en español.
- **Qué no commitear:**
  - Paquetes con **npm**: el lockfile versionado es `package-lock.json`.
  - Nunca agregar `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `src/components/support/`, `TURN-IO-OUTREACH-DRAFT.md`, `ZONAS-MONITOREO-DISCUSION.md` ni `scripts/fwi-validation/*.csv`: son archivos ajenos sin trackear.
  - **`git add` por ruta, nunca `-A` ni `.`**
- **Antes de cada push:**
  - `npm test` y `npm run build` en verde (el CI usa Node 20, `npm ci`, vitest y `next build`).
  - `.venv/bin/python -m pytest -q` si se tocó Python.
- **Next.js 16 no es el que conocés** (AGENTS.md): antes de escribir rutas, páginas, redirects o `searchParams`, leer la guía en `node_modules/next/dist/docs/01-app/`.
- **Tests:**
  - TS en `src/__tests__/**/*.test.ts` (entorno node, alias `@` → `src`).
  - Python en `tests/python/` (`pytest.ini`: `pythonpath = .`).
  - Entorno Python local: `.venv` con Python 3.14.5 (ignorado por git). Vercel puede correr otra versión: no usar sintaxis nueva sin verificarla.
- **Guardianes:** todo test que vigile una regla **se rompe a propósito** antes de darlo por bueno, y el sabotaje tiene que ponerlo rojo.
- **Convención de viento:** la dirección es **desde dónde sopla** (0 = norte), igual que Open-Meteo y el METAR. Toda comparación pasa por `smokeHeadsTowardUser` / `bearingDegrees` de `src/lib/geo.ts`.
- **Migraciones:**
  - Archivo versionado en `scripts/sql/whi-907-*.sql`, con RLS activo en toda tabla nueva.
  - **No se aplican** hasta que Seba vea el SQL completo y dé OK (checkpoint C2).
  - La base es compartida con SatAI: no tocar sus tablas.
- **Nada destructivo en la base** (tablas de bomberos) sin OK aparte y copia previa verificada (C4).
- **Variables de entorno:** siempre `.trim()`.
- **Nada hacia terceros sin OK:** no crear cuentas (Xweather, EUMETSAT), no mandar el formulario de NOAA ni el mail a CONAE (C3).
- **Previews y producción:**
  - Los previews de Vercel están protegidos (302): la revisión visual la hace Seba.
  - **Merge y producción, sólo con OK** (C5). Los crons nuevos de pg_cron apuntan a `https://alertaincendios.vercel.app` y se programan después del merge.

## Checkpoints con Seba (bloqueantes; se juntan para no interrumpir)

| | Qué | Cuándo |
|---|---|---|
| **C1** | Textos nuevos de la alerta (viento corregido + "podría llegar en ~X h") | En el PR, antes de mergear |
| **C2** | SQL de las migraciones nuevas (observaciones de viento, pronóstico SMN, rayos GLM) | Al terminar la Fase 6, en un solo lote |
| **C3** | Cuentas y contactos externos: Xweather, EUMETSAT, formulario de NOAA, mail a CONAE | Cuando haga falta; el código funciona sin ellos |
| **C4** | Borrar las tablas y la función de bomberos en la base | Después de desplegar la limpieza de código |
| **C5** | Merge a `main`, deploy a producción y programación de crons | Al final |

## Decisiones tomadas por defecto (revisables en el PR)

- La página nueva vive en **`/bahia-blanca`**, y `/ciudad/buenos-aires/bahia-blanca` redirige ahí: no quedan dos páginas.
- **`/cuarteles` redirige a `/`.**
- **No se menciona Alerta Bahía** hasta la reunión con el municipio (WHI-902).
- `src/lib/dispersion.ts` y `/api/simulate` **se dejan como están** (fuera de alcance); sólo se comparte la convención de viento.
- **Parte 7 (Sentinel-3): diferida.** Sin cuenta de EUMETSAT no hay forma de bajar un archivo real ni de probarla (C3).
- **Parte 8 (CONAE): no es código.** Se deja un borrador de mail para C3.

## Mapa de archivos

| Fase | Crea | Modifica | Borra |
|---|---|---|---|
| 1 WHI-908 | `src/__tests__/geo-smoke-direction.test.ts` | `src/lib/geo.ts`, `src/app/api/alerts/route.ts`, `src/components/city/city-forest-fires.tsx` | — |
| 2 Bomberos | `src/__tests__/no-fireman-feature.test.ts` | `src/app/api/bot/telegram/route.ts`, `src/app/api/bot/sync-commands/route.ts`, `src/app/api/alerts/route.ts`, `src/app/api/goes-alerts/route.ts`, `src/lib/alert-pairs.ts`, `src/app/(main)/page.tsx`, `src/app/sitemap.ts`, `src/app/dashboard/**`, `src/lib/logger.ts`, `src/lib/telegram.ts`, tests existentes, `next.config.*`, `CLAUDE.md`, `README.md` | `src/app/(main)/cuarteles/`, `src/components/cuarteles/`, `src/app/api/cuarteles/`, `FIREMAN-ONBOARDING-PLAN.md` |
| 3 Open-Meteo | `src/lib/open-meteo.ts`, `src/__tests__/open-meteo-url.test.ts`, `src/__tests__/open-meteo-guard.test.ts`, `tests/python/test_openmeteo_url.py` | las 7 llamadas + `fire_danger/openmeteo.py` | — |
| 4 Frente CSIRO | `src/lib/fire-spread.ts`, `src/__tests__/fire-spread.test.ts` | `src/lib/wind.ts`, `src/app/api/alerts/route.ts` | — |
| 5 Viento local | `src/lib/metar.ts`, `src/app/api/metar-sync/route.ts`, `smn_wrf/extract.py`, `api/smn-wrf-sync.py`, tests, `scripts/sql/whi-907-wind.sql` | `src/lib/wind.ts`, `vercel.json` | — |
| 6 Rayos GLM | `glm/extract.py`, `api/glm-sync.py`, `tests/python/test_glm_extract.py`, `src/lib/lightning-near.ts`, test, `scripts/sql/whi-907-lightning.sql` | `src/app/api/lightning-alerts/route.ts`, `vercel.json` | — |
| 7 Xweather | `src/lib/xweather.ts`, `src/__tests__/xweather.test.ts` | `src/app/api/lightning-alerts/route.ts` | — |
| 8 Cono | `src/lib/fire-projection.ts`, test, `src/app/api/fire-projection/route.ts` | `src/components/city/city-map.tsx` | — |
| 9 Página | `src/app/(main)/bahia-blanca/page.tsx` | `next.config.*`, `src/app/sitemap.ts`, bot (payload `ciudad-`), alertas (link) | — |
| 10 Mesoescala | `tests/python/test_mesoscale_coverage.py` | `api/goes-sync.py` | — |
| 11 Cierre | — | `CLAUDE.md`, `ANALISIS_SATELITES_ALERTAFORESTAL.md` | — |

---

## Fase 0 — Preparación ✅ (14/9)

- [x] Git firma como `Soysebalopez <soysebalopez@gmail.com>` (global en esta Mac, pedido de Seba).
- [x] Rama `feat/whi-907-bahia-blanca-nivel-1` creada desde `main` = `origin/main` (`b9517a1`).
- [x] Línea base: `npm test` → 19 archivos, **147 tests en verde**.
- [x] `.venv` (ya existía, Python 3.14.5) con `requirements.txt` instalado vía `uv` + pytest: **42 tests en verde**.

---

## Fase 1 — WHI-908: la dirección del viento

### Task 1.1: `smokeHeadsTowardUser` compartido, con test, usado por las alertas

**Files:**
- Modify: `src/lib/geo.ts` (reemplaza `isUpwind`; suma `bearingDegrees`, `angleDiffDeg` y `SMOKE_TOWARD_HALF_ANGLE_DEG`)
- Modify: `src/app/api/alerts/route.ts:6` (import), `:113-116` (uso), `:256-265` (`classifyAlert`), `:279-294` (borra el `bearingDegrees` privado)
- Modify: `src/components/city/city-forest-fires.tsx:180` (usa el `bearingDegrees` compartido **sólo si** el privado es idéntico; si difiere, no se toca)
- Test: `src/__tests__/geo-smoke-direction.test.ts`

**Interfaces:**
- Produces:
  - `bearingDegrees(fromLat: number, fromLng: number, toLat: number, toLng: number): number` — rumbo inicial de gran círculo, en [0, 360), 0 = N.
  - `angleDiffDeg(a: number, b: number): number` — en [0, 180].
  - `SMOKE_TOWARD_HALF_ANGLE_DEG = 60`.
  - `smokeHeadsTowardUser(userLat, userLng, fireLat, fireLng, windFromDeg): { headsToward: boolean; angleDiff: number }`.
  - `smokeEtaMinutes(distanceKm, windSpeedKmh, headsToward: boolean): number` (misma lógica; cambia el nombre del parámetro).

- [ ] **Step 1: Write the failing test** — `src/__tests__/geo-smoke-direction.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  angleDiffDeg,
  bearingDegrees,
  smokeEtaMinutes,
  smokeHeadsTowardUser,
} from "@/lib/geo";

/**
 * WHI-908 — smoke direction.
 *
 * Wind direction follows the meteorological convention used by Open-Meteo and
 * METAR: the compass bearing the wind blows FROM (0 = north, 90 = east).
 * Smoke reaches the user when the fire sits on that side of the user.
 */

const USER = { lat: -38.72, lng: -62.27 }; // Bahía Blanca
const NORTH_20KM = { lat: USER.lat + 0.18, lng: USER.lng };
const NORTHWEST_20KM = { lat: USER.lat + 0.127, lng: USER.lng - 0.163 };

function heads(fire: { lat: number; lng: number }, windFromDeg: number) {
  return smokeHeadsTowardUser(USER.lat, USER.lng, fire.lat, fire.lng, windFromDeg)
    .headsToward;
}

describe("smokeHeadsTowardUser — wind FROM convention", () => {
  it("fire to the north + wind from the north → smoke comes to the user", () => {
    expect(heads(NORTH_20KM, 0)).toBe(true);
  });

  it("fire to the north + wind from the south → smoke moves away", () => {
    expect(heads(NORTH_20KM, 180)).toBe(false);
  });

  it("fire to the northwest + wind from the northwest (typical in Bahía Blanca) → smoke comes", () => {
    expect(heads(NORTHWEST_20KM, 315)).toBe(true);
  });

  it("fire to the northwest + wind from the southeast → smoke moves away", () => {
    expect(heads(NORTHWEST_20KM, 135)).toBe(false);
  });

  it("crosswind (fire to the north, wind from the east) is not toward the user", () => {
    expect(heads(NORTH_20KM, 90)).toBe(false);
  });
});

describe("bearingDegrees", () => {
  it("due north is 0 and due west is 270", () => {
    expect(bearingDegrees(USER.lat, USER.lng, NORTH_20KM.lat, NORTH_20KM.lng)).toBeCloseTo(0, 5);
    expect(bearingDegrees(USER.lat, USER.lng, USER.lat, USER.lng - 0.2)).toBeCloseTo(270, 0);
  });

  it("corrects longitude by latitude: equal km north and east is ~45°, not ~52°", () => {
    const dLat = 0.1;
    const dLng = dLat / Math.cos((USER.lat * Math.PI) / 180);
    expect(bearingDegrees(USER.lat, USER.lng, USER.lat + dLat, USER.lng + dLng)).toBeCloseTo(45, 0);
  });
});

describe("angleDiffDeg", () => {
  it("wraps around north", () => {
    expect(angleDiffDeg(350, 10)).toBe(20);
    expect(angleDiffDeg(10, 350)).toBe(20);
  });

  it("never exceeds 180", () => {
    expect(angleDiffDeg(0, 180)).toBe(180);
    expect(angleDiffDeg(90, 271)).toBe(179);
  });
});

describe("smokeEtaMinutes", () => {
  it("20 km at 30 km/h toward the user → 40 min", () => {
    expect(smokeEtaMinutes(20, 30, true)).toBe(40);
  });

  it("not toward the user → -1", () => {
    expect(smokeEtaMinutes(20, 30, false)).toBe(-1);
  });

  it("calm wind → -1", () => {
    expect(smokeEtaMinutes(20, 0, true)).toBe(-1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/geo-smoke-direction.test.ts`
Expected: FAIL — `smokeHeadsTowardUser`, `bearingDegrees` and `angleDiffDeg` are not exported from `@/lib/geo`.

- [ ] **Step 3: Write minimal implementation** — en `src/lib/geo.ts`, reemplazar `isUpwind` (líneas 21–38) por:

```ts
/**
 * Initial great-circle bearing from one point to another, in degrees
 * (0 = north, 90 = east, range [0, 360)).
 */
export function bearingDegrees(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): number {
  const φ1 = (fromLat * Math.PI) / 180;
  const φ2 = (toLat * Math.PI) / 180;
  const Δλ = ((toLng - fromLng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/** Smallest absolute difference between two compass angles, in [0, 180]. */
export function angleDiffDeg(a: number, b: number): number {
  const d = (((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

/** Half-width of the sector around the wind axis counted as "smoke toward the user". */
export const SMOKE_TOWARD_HALF_ANGLE_DEG = 60;

/**
 * Whether the wind carries a fire's smoke toward the user.
 *
 * `windFromDeg` uses the meteorological convention (Open-Meteo, METAR): the
 * compass bearing the wind blows FROM. Smoke reaches the user when the fire
 * sits on that side, i.e. when the bearing user→fire is close to windFromDeg.
 * (WHI-908: the previous `isUpwind` compared against windFromDeg + 180 and
 * reported the opposite.)
 */
export function smokeHeadsTowardUser(
  userLat: number,
  userLng: number,
  fireLat: number,
  fireLng: number,
  windFromDeg: number
): { headsToward: boolean; angleDiff: number } {
  const angleDiff = angleDiffDeg(
    bearingDegrees(userLat, userLng, fireLat, fireLng),
    windFromDeg
  );
  return { headsToward: angleDiff < SMOKE_TOWARD_HALF_ANGLE_DEG, angleDiff };
}
```

En `smokeEtaMinutes`, renombrar el parámetro `upwind` a `headsToward` y actualizar su comentario ("Returns -1 if the smoke is not heading toward the user or the wind is calm").

En `src/app/api/alerts/route.ts`:
- `:6` → `import { bearingDegrees, haversineKm, smokeEtaMinutes, smokeHeadsTowardUser } from "@/lib/geo";`
- `:113-116` →

```ts
      const smoke = smokeHeadsTowardUser(sub.lat, sub.lng, fire.latitude, fire.longitude, wind.windDirection);
      const eta = smokeEtaMinutes(distKm, wind.windSpeed, smoke.headsToward);

      const level = classifyAlert(distKm, smoke.headsToward);
```

- En `classifyAlert`, renombrar el parámetro `upwind` a `smokeTowardUser` (misma lógica).
- Borrar el `bearingDegrees` privado (`:279-294`); el de `@/lib/geo` tiene la misma firma y fórmula.

En `src/components/city/city-forest-fires.tsx:180`: comparar el `bearingDegrees` privado con el compartido. Si es la misma fórmula, borrarlo e importar el compartido.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/geo-smoke-direction.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 5: Sabotage the guard**

En `smokeHeadsTowardUser`, reemplazar temporalmente `windFromDeg` por `(windFromDeg + 180) % 360` y correr el mismo comando.
Expected: FAIL en los 4 primeros casos (el de viento cruzado sigue en verde en los dos sentidos).
Revertir el sabotaje y confirmar PASS.

- [ ] **Step 6: Full suite + build**

Run: `npm test && npm run build`
Expected: 159 tests en verde (147 + 12) y build OK. Si `next build` se atasca más de 5 min sin salida, correr `npx next build --webpack` para ver el error.

- [ ] **Step 7: Commit**

```bash
git add src/lib/geo.ts src/app/api/alerts/route.ts src/components/city/city-forest-fires.tsx src/__tests__/geo-smoke-direction.test.ts
git commit -m "fix(alerts): smoke direction was inverted — compare user→fire bearing against wind FROM (WHI-908)"
```

---

## Fase 2 — Parte 10: retirar la función de bomberos (código)

### Task 2.1: guardián que prohíbe la función retirada

**Files:**
- Test: `src/__tests__/no-fireman-feature.test.ts`

**Interfaces:**
- Produces: la regla "ningún archivo de `src/` menciona `soybombero`, `dejarcuartel`, `fireman` ni `cuartel`". Los consejos al vecino de **llamar a los bomberos** siguen permitidos: el patrón no incluye "bombero" suelto.

- [ ] **Step 1: Write the failing test**

```ts
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * WHI-907 part 10 — the fireman/cuartel feature was retired on 2026-09-14
 * (1 code ever created, 0 uses). Advice to residents to call the firefighters
 * ("bomberos") is NOT part of that feature and stays allowed.
 */
const SRC = path.resolve(__dirname, "..");
const FORBIDDEN = /soybombero|dejarcuartel|fireman|cuartel/i;
const SELF = path.join("__tests__", "no-fireman-feature.test.ts");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe("retired fireman feature", () => {
  it("no source file references it", () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => path.relative(SRC, file) !== SELF)
      .filter((file) => FORBIDDEN.test(readFileSync(file, "utf8")))
      .map((file) => path.relative(SRC, file));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**, naming the offenders

Run: `npx vitest run src/__tests__/no-fireman-feature.test.ts`
Expected: FAIL. La lista tiene que incluir `app/api/bot/telegram/route.ts`, `app/(main)/cuarteles/page.tsx` y `lib/alert-pairs.ts`. **Si la lista viene vacía, el guardián no está mirando: arreglarlo antes de seguir.**

- [ ] **Step 3: Commit the red guard together with Task 2.2** (no se commitea un test rojo solo).

### Task 2.2: bot, alertas, web, panel y docs

**Files:** los de la fila "2 Bomberos" del mapa.

- [ ] **Step 1: Bot** — `src/app/api/bot/telegram/route.ts`:
  - Borrar las ramas `/dejarcuartel` y `/soybombero`, las funciones que llaman (incluida la llamada a la RPC `consume_fireman_code`) y sus líneas de ayuda (`🚒 /soybombero…`, `🚪 /dejarcuartel…`).
  - En el parser del deep link (`/^(cuartel|src)-([a-z0-9-]{1,48})$/`), **conservar sólo `src-`**: `/^src-([a-z0-9-]{1,48})$/` → `"campaign:" + m[1]`.
  - `src/app/api/bot/sync-commands/route.ts`: quitar las entradas `soybombero` y `dejarcuartel`, y el comentario que las nombra.
- [ ] **Step 2: Alertas**:
  - `src/app/api/alerts/route.ts` y `src/app/api/goes-alerts/route.ts`: quitar `role`/`cuartel_name` del `select`, la rama `isFireman`, `formatFiremanAlert` y `formatFiremanPreliminary`. Todo suscriptor recibe el formato vecinal.
  - `src/lib/alert-pairs.ts`: borrar la función que devuelve `role === "fireman"` y dejar la regla vecinal (sólo focos en zona forestal) como única.
  - Actualizar `src/__tests__/alert-pairs.test.ts` y `src/__tests__/bot-copy-gender-neutral.test.ts`: quitar los casos de bombero y conservar los de vecino.
- [ ] **Step 3: Web**:
  - Borrar `src/app/(main)/cuarteles/`, `src/components/cuarteles/` y `src/app/api/cuarteles/`.
  - Quitar `/cuarteles` de `src/app/sitemap.ts`.
  - En `src/app/(main)/page.tsx`, borrar la sección "El canal operativo de tu cuartel" / "Sumá a tu cuartel" (~líneas 590–710; ubicar el bloque completo con su `<section>`).
  - **No tocar** la frase de fuentes "la misma que usan los bomberos…" (~línea 800) ni `src/app/(main)/como-funciona/page.tsx`.
  - Redirect permanente `/cuarteles` → `/` en la config de Next (leer primero `node_modules/next/dist/docs/01-app/` sobre `redirects`).
- [ ] **Step 4: Panel superadmin**: quitar la métrica `fireman`, la torta por rol y "Top cuarteles" de `dashboard/superadmin/page.tsx`, `_lib/superadmin-metrics.ts`, `_lib/superadmin-config.ts` y `_components/superadmin-charts.tsx`.
- [ ] **Step 5: Comentarios**: en `src/lib/logger.ts` y `src/lib/telegram.ts`, cambiar los ejemplos que nombran `fireman`/`cuartel` por otros (`"alert_sent"`, `"city names from geocoding"`).
- [ ] **Step 6: Docs**:
  - Borrar `FIREMAN-ONBOARDING-PLAN.md`.
  - En `CLAUDE.md` (del repo) y `README.md`, quitar la página `/cuarteles`, `/api/cuarteles/request`, `fireman_codes` y el rol.
  - Los specs viejos en `docs/superpowers/` quedan como historia.
- [ ] **Step 7: Verify**
  - Run: `npx vitest run src/__tests__/no-fireman-feature.test.ts` → PASS.
  - Run: `npm test && npm run build` → verde.
  - Run: `git grep -niE "soybombero|dejarcuartel|fireman|cuartel" -- src` → vacío.
- [ ] **Step 8: Sabotage** — agregar `// fireman` en cualquier archivo de `src/lib`, confirmar FAIL nombrando ese archivo, y revertir.
- [ ] **Step 9: Commit**

```bash
git add -u src CLAUDE.md README.md FIREMAN-ONBOARDING-PLAN.md next.config.*
git add src/__tests__/no-fireman-feature.test.ts
git commit -m "refactor: retire the fireman/cuartel feature from bot, alerts, web and admin (WHI-907)"
```

> **La base NO se toca en esta fase** (`fireman_codes`, `fireman_code_usage`, `subscribers.cuartel_name`, `consume_fireman_code`): va a C4.

---

## Fase 3 — Parte 1: Open-Meteo con un solo interruptor

### Task 3.1: constructor de URL en TypeScript

**Files:**
- Create: `src/lib/open-meteo.ts`
- Test: `src/__tests__/open-meteo-url.test.ts`

**Interfaces:**
- Produces:
  - `type OpenMeteoApi = "forecast" | "air-quality" | "archive" | "geocoding"`.
  - `openMeteoUrl(api: OpenMeteoApi, params: Record<string, string | number | boolean>, apiKey?: string | null): string`.
  - `apiKey === undefined` → lee `process.env.OPEN_METEO_API_KEY`; `null` → sin clave.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { openMeteoUrl } from "@/lib/open-meteo";

describe("openMeteoUrl", () => {
  it("uses the free host without a key", () => {
    const u = new URL(openMeteoUrl("forecast", { latitude: -38.72, current: "wind_speed_10m" }, null));
    expect(u.host).toBe("api.open-meteo.com");
    expect(u.pathname).toBe("/v1/forecast");
    expect(u.searchParams.get("apikey")).toBeNull();
    expect(u.searchParams.get("latitude")).toBe("-38.72");
  });

  it("switches to the customer host and appends apikey when a key is set", () => {
    const u = new URL(openMeteoUrl("forecast", { latitude: 1 }, "abc"));
    expect(u.host).toBe("customer-api.open-meteo.com");
    expect(u.searchParams.get("apikey")).toBe("abc");
  });

  it("trims the key (Vercel appends whitespace) and treats blank as no key", () => {
    expect(new URL(openMeteoUrl("forecast", {}, "  abc \n")).searchParams.get("apikey")).toBe("abc");
    expect(new URL(openMeteoUrl("forecast", {}, "   ")).host).toBe("api.open-meteo.com");
  });

  it.each([
    ["air-quality", "air-quality-api.open-meteo.com", "customer-air-quality-api.open-meteo.com", "/v1/air-quality"],
    ["archive", "archive-api.open-meteo.com", "customer-archive-api.open-meteo.com", "/v1/archive"],
    ["geocoding", "geocoding-api.open-meteo.com", "customer-geocoding-api.open-meteo.com", "/v1/search"],
  ] as const)("maps %s to its free and customer hosts", (api, free, customer, pathname) => {
    expect(new URL(openMeteoUrl(api, {}, null)).host).toBe(free);
    const paid = new URL(openMeteoUrl(api, {}, "k"));
    expect(paid.host).toBe(customer);
    expect(paid.pathname).toBe(pathname);
  });

  it("keeps comma-separated variable lists intact", () => {
    const u = new URL(openMeteoUrl("forecast", { current: "wind_speed_10m,wind_direction_10m" }, null));
    expect(u.searchParams.get("current")).toBe("wind_speed_10m,wind_direction_10m");
  });
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/__tests__/open-meteo-url.test.ts` → FAIL (el módulo no existe).
- [ ] **Step 3: Implement** — `src/lib/open-meteo.ts`:

```ts
/**
 * Single place that builds Open-Meteo URLs (WHI-907 part 1).
 *
 * The free plan forbids commercial use. Setting OPEN_METEO_API_KEY switches
 * every call to the customer hosts with `apikey=` — no code change needed.
 */
export type OpenMeteoApi = "forecast" | "air-quality" | "archive" | "geocoding";

const ENDPOINTS: Record<OpenMeteoApi, { host: string; path: string }> = {
  forecast: { host: "api.open-meteo.com", path: "/v1/forecast" },
  "air-quality": { host: "air-quality-api.open-meteo.com", path: "/v1/air-quality" },
  archive: { host: "archive-api.open-meteo.com", path: "/v1/archive" },
  geocoding: { host: "geocoding-api.open-meteo.com", path: "/v1/search" },
};

export function openMeteoUrl(
  api: OpenMeteoApi,
  params: Record<string, string | number | boolean>,
  apiKey?: string | null
): string {
  const raw = apiKey === undefined ? process.env.OPEN_METEO_API_KEY : apiKey;
  const key = raw?.trim() || null;
  const { host, path } = ENDPOINTS[api];
  const url = new URL(`https://${key ? `customer-${host}` : host}${path}`);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, String(value));
  }
  if (key) url.searchParams.set("apikey", key);
  return url.toString();
}
```

- [ ] **Step 4: Run to verify it passes** — mismo comando → PASS.
- [ ] **Step 5: Verify comma encoding against the real API**

Run: `curl -s "$(node -e 'const u=new URL("https://api.open-meteo.com/v1/forecast");u.searchParams.set("latitude","-38.72");u.searchParams.set("longitude","-62.27");u.searchParams.set("current","wind_speed_10m,wind_direction_10m");console.log(u.toString())')" | grep -o '"current":{[^}]*}'`
Expected: trae `wind_speed_10m` **y** `wind_direction_10m`.

- [ ] **Step 6: Commit** — `git add src/lib/open-meteo.ts src/__tests__/open-meteo-url.test.ts && git commit -m "feat(open-meteo): single URL builder that switches to the paid plan via OPEN_METEO_API_KEY (WHI-907)"`

### Task 3.2: migrar las llamadas TS y el guardián

**Files:**
- Modify: `src/lib/wind.ts:39`, `src/lib/lightning.ts:98`, `src/lib/geocode.ts:47`, `src/app/api/wind/route.ts:16,58`, `src/app/api/air-quality/route.ts:23`, `src/app/api/history/route.ts:12`
- Test: `src/__tests__/open-meteo-guard.test.ts`

- [ ] **Step 1: Write the failing guard**

```ts
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** WHI-907 part 1 — every Open-Meteo call must go through the single switch. */
const REPO = path.resolve(__dirname, "../..");
const SCAN_DIRS = ["src", "fire_danger", "api"];
const ALLOWED = new Set([
  "src/lib/open-meteo.ts",
  "fire_danger/openmeteo.py",
  "src/components/footer.tsx", // attribution link to https://open-meteo.com/
  "src/__tests__/open-meteo-url.test.ts",
  "src/__tests__/open-meteo-guard.test.ts",
]);
const API_HOST = /[a-z-]*api\.open-meteo\.com/;

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__pycache__" ? [] : files(full);
    return /\.(ts|tsx|py)$/.test(e.name) ? [full] : [];
  });
}

describe("Open-Meteo single switch", () => {
  it("no file outside the builder hardcodes an Open-Meteo API host", () => {
    const offenders = SCAN_DIRS.flatMap((d) => files(path.join(REPO, d)))
      .map((f) => path.relative(REPO, f))
      .filter((rel) => !ALLOWED.has(rel))
      .filter((rel) => API_HOST.test(readFileSync(path.join(REPO, rel), "utf8")));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run → FAIL** listando las 6 llamadas TS. Si la lista está vacía, el guardián no mira: arreglar.
- [ ] **Step 3: Migrate each call**, preservando exactamente los mismos parámetros. Por ejemplo, `src/lib/wind.ts`:

```ts
import { openMeteoUrl } from "@/lib/open-meteo";
// …
  const url = openMeteoUrl("forecast", {
    latitude: lat,
    longitude: lng,
    current: "wind_speed_10m,wind_direction_10m,temperature_2m",
  });
```

Mismo patrón en `lightning.ts` (`current`, `hourly`, `past_hours`, `forecast_hours`), `geocode.ts` (`name`, `count`, `language`, `country_code`: `URLSearchParams` ya codifica el nombre, así que se quita el `encodeURIComponent` manual), `wind/route.ts` (el `OPEN_METEO_BASE` + `params` se reemplaza por `openMeteoUrl("forecast", Object.fromEntries(params))`) y los dos de `air-quality`.

- [ ] **Step 4: Run guard → still FAIL** (sólo `fire_danger/openmeteo.py`, que resuelve la Task 3.3). Anotar que el resto salió de la lista.
- [ ] **Step 5: `npm test && npm run build`** → verde, salvo el guardián pendiente de la 3.3.
- [ ] **Step 6: Commit** después de la Task 3.3 (guardián + migración juntos).

### Task 3.3: el motor Python del índice de peligro

**Files:**
- Modify: `fire_danger/openmeteo.py:11-12` y sus usos de `FORECAST_URL` / `ARCHIVE_URL`
- Test: `tests/python/test_openmeteo_url.py`

**Interfaces:**
- Produces: `endpoint(api: str) -> str` (`"forecast"` | `"archive"`) y `with_key(params: dict) -> dict`. Leen `OPEN_METEO_API_KEY` **en cada llamada**, no al importar.

- [ ] **Step 1: Write the failing test**

```python
from fire_danger import openmeteo


def test_free_host_without_key(monkeypatch):
    monkeypatch.delenv("OPEN_METEO_API_KEY", raising=False)
    assert openmeteo.endpoint("forecast") == "https://api.open-meteo.com/v1/forecast"
    assert openmeteo.endpoint("archive") == "https://archive-api.open-meteo.com/v1/archive"
    assert "apikey" not in openmeteo.with_key({"latitude": 1})


def test_customer_host_and_trimmed_key(monkeypatch):
    monkeypatch.setenv("OPEN_METEO_API_KEY", " abc \n")
    assert openmeteo.endpoint("forecast") == "https://customer-api.open-meteo.com/v1/forecast"
    assert openmeteo.endpoint("archive") == "https://customer-archive-api.open-meteo.com/v1/archive"
    assert openmeteo.with_key({"latitude": 1}) == {"latitude": 1, "apikey": "abc"}


def test_blank_key_is_no_key(monkeypatch):
    monkeypatch.setenv("OPEN_METEO_API_KEY", "   ")
    assert openmeteo.endpoint("forecast").startswith("https://api.open-meteo.com")
```

- [ ] **Step 2: Run → FAIL** — `.venv/bin/python -m pytest tests/python/test_openmeteo_url.py -q`
- [ ] **Step 3: Implement** — reemplazar las constantes por:

```python
import os

_HOSTS = {
    "forecast": ("api.open-meteo.com", "/v1/forecast"),
    "archive": ("archive-api.open-meteo.com", "/v1/archive"),
}


def _api_key() -> str | None:
    return (os.environ.get("OPEN_METEO_API_KEY") or "").strip() or None


def endpoint(api: str) -> str:
    """Base URL for an Open-Meteo API; customer host when OPEN_METEO_API_KEY is set."""
    host, path = _HOSTS[api]
    return f"https://{'customer-' + host if _api_key() else host}{path}"


def with_key(params: dict) -> dict:
    """Query params plus `apikey` when the paid plan is configured."""
    key = _api_key()
    return {**params, "apikey": key} if key else dict(params)
```

En cada llamada, `requests.get(FORECAST_URL, params=p, …)` pasa a `requests.get(endpoint("forecast"), params=with_key(p), …)` (y lo mismo con `archive`).

- [ ] **Step 4: Run → PASS**, correr la suite Python completa (`.venv/bin/python -m pytest -q`) y el guardián TS: `npx vitest run src/__tests__/open-meteo-guard.test.ts` → PASS.
- [ ] **Step 5: Sabotage** — pegar la URL `https://api.open-meteo.com/v1/forecast` en un comentario de `src/lib/geocode.ts`, confirmar FAIL nombrando ese archivo, y revertir.
- [ ] **Step 6: Commit**

```bash
git add src/lib/wind.ts src/lib/lightning.ts src/lib/geocode.ts src/app/api/wind/route.ts src/app/api/air-quality/route.ts src/app/api/history/route.ts src/__tests__/open-meteo-guard.test.ts fire_danger/openmeteo.py tests/python/test_openmeteo_url.py
git commit -m "refactor(open-meteo): route every call through the single switch, with a guard (WHI-907)"
```

---

## Fase 4 — Parte 5: "¿a qué hora llega el fuego?" (regla del 20% de CSIRO)

### Task 4.1: módulo puro `fire-spread`

**Files:**
- Create: `src/lib/fire-spread.ts`
- Test: `src/__tests__/fire-spread.test.ts`

**Interfaces:**
- Produces:
  - `deadFuelMoisturePct(tempC: number, rhPct: number): number`
  - `csiroConditionsMet(w: { windKmh: number; tempC: number; rhPct: number | null }): boolean`
  - `grassFireFrontEtaMinutes(i: { distKm: number; windKmh: number; tempC: number; rhPct: number | null }): number | null`
  - `formatFrontEta(minutes: number | null): string | null`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  csiroConditionsMet,
  deadFuelMoisturePct,
  formatFrontEta,
  grassFireFrontEtaMinutes,
} from "@/lib/fire-spread";

/**
 * CSIRO PyroPage 33 (2022): grassfire forward spread ≈ 20% of the 10-m wind,
 * valid with wind > 30 km/h and dead fuel moisture < 6%. Dead fuel moisture
 * from Cheney et al. (1998): MC = 9.58 − 0.205·T + 0.138·RH.
 */
describe("deadFuelMoisturePct", () => {
  it("reproduces the 6% line of the PyroPage chart", () => {
    expect(deadFuelMoisturePct(30, 18)).toBeCloseTo(5.91, 2);
    expect(deadFuelMoisturePct(45, 41)).toBeCloseTo(6.01, 2);
  });
});

describe("grassFireFrontEtaMinutes", () => {
  it("40 km/h, 35 °C, 15% RH, 16 km away → 120 min", () => {
    expect(grassFireFrontEtaMinutes({ distKm: 16, windKmh: 40, tempC: 35, rhPct: 15 })).toBe(120);
  });

  it("returns null when the wind is 30 km/h or less", () => {
    expect(grassFireFrontEtaMinutes({ distKm: 16, windKmh: 30, tempC: 35, rhPct: 15 })).toBeNull();
  });

  it("returns null when the fuel is too moist (25 °C, 50% RH)", () => {
    expect(grassFireFrontEtaMinutes({ distKm: 16, windKmh: 40, tempC: 25, rhPct: 50 })).toBeNull();
  });

  it("returns null when humidity is unknown — never invents a number", () => {
    expect(csiroConditionsMet({ windKmh: 40, tempC: 35, rhPct: null })).toBe(false);
  });
});

describe("formatFrontEta", () => {
  it.each([
    [45, "~45 min"],
    [120, "~2 h"],
    [150, "~2 h 30 min"],
  ])("%i min → %s", (minutes, text) => {
    expect(formatFrontEta(minutes)).toBe(text);
  });

  it("null stays null", () => {
    expect(formatFrontEta(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run → FAIL** — `npx vitest run src/__tests__/fire-spread.test.ts`
- [ ] **Step 3: Implement** — `src/lib/fire-spread.ts`:

```ts
/**
 * Grassfire forward-spread estimate (WHI-907 part 5).
 *
 * CSIRO PyroPage 33 (Sep 2022): in cured grass under dry, windy conditions the
 * head fire advances at ~20% of the average 10-m open wind speed. Applicable
 * only with wind > 30 km/h, curing > 90% (assumed during the Nov–Apr season)
 * and dead fuel moisture < 6%. It is a near-worst case: gust surges can be
 * several times faster for short periods. Outside those conditions we return
 * null instead of inventing a number.
 */
export const CSIRO_MIN_WIND_KMH = 30;
export const CSIRO_MAX_DEAD_FUEL_MOISTURE_PCT = 6;
export const CSIRO_SPREAD_FRACTION_OF_WIND = 0.2;

/** Dead fine fuel moisture (%) — Cheney, Gould & Catchpole (1998). */
export function deadFuelMoisturePct(tempC: number, rhPct: number): number {
  return 9.58 - 0.205 * tempC + 0.138 * rhPct;
}

export function csiroConditionsMet(w: {
  windKmh: number;
  tempC: number;
  rhPct: number | null;
}): boolean {
  if (w.rhPct === null) return false;
  return (
    w.windKmh > CSIRO_MIN_WIND_KMH &&
    deadFuelMoisturePct(w.tempC, w.rhPct) < CSIRO_MAX_DEAD_FUEL_MOISTURE_PCT
  );
}

export function grassFireFrontEtaMinutes(i: {
  distKm: number;
  windKmh: number;
  tempC: number;
  rhPct: number | null;
}): number | null {
  if (!csiroConditionsMet(i)) return null;
  const spreadKmh = CSIRO_SPREAD_FRACTION_OF_WIND * i.windKmh;
  return Math.round((i.distKm / spreadKmh) * 60);
}

export function formatFrontEta(minutes: number | null): string | null {
  if (minutes === null) return null;
  if (minutes < 60) return `~${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round((minutes % 60) / 10) * 10;
  return m === 0 ? `~${h} h` : `~${h} h ${m} min`;
}
```

- [ ] **Step 4: Run → PASS**
- [ ] **Step 5: Commit** — `git add src/lib/fire-spread.ts src/__tests__/fire-spread.test.ts && git commit -m "feat(fire-spread): CSIRO 20% grassfire front ETA, null outside its conditions (WHI-907)"`

### Task 4.2: humedad en el viento y línea nueva en la alerta

**Files:**
- Modify: `src/lib/wind.ts` (`WindData.relativeHumidity: number | null`; pedir `relative_humidity_2m`; `null` en el fallback)
- Modify: `src/app/api/alerts/route.ts` (`formatAlert` y `formatConfirmedFromPreliminary`)

- [ ] **Step 1:** `WindData` suma `relativeHumidity: number | null`. `fetchWind` pide `current: "wind_speed_10m,wind_direction_10m,temperature_2m,relative_humidity_2m"` y mapea `current?.relative_humidity_2m ?? null`. `windFallback()` devuelve `relativeHumidity: null`.
- [ ] **Step 2:** en el loop de alertas, sólo si `smoke.headsToward`:

```ts
const frontEta = smoke.headsToward
  ? grassFireFrontEtaMinutes({ distKm, windKmh: wind.windSpeed, tempC: wind.temperature, rhPct: wind.relativeHumidity })
  : null;
```

Pasar `frontEta` a `formatAlert` y `formatConfirmedFromPreliminary`. Después de la línea de viento, agregar:

```ts
const frontText = formatFrontEta(frontEta);
if (frontText) msg += `🔥 Si el viento se mantiene, el fuego podría llegar en <b>${frontText}</b> (estimación de peor caso)\n`;
```

- [ ] **Step 3:** `npm test && npm run build` → verde. **El texto es C1**: queda anotado en el PR para Seba.
- [ ] **Step 4: Commit** — `git add src/lib/wind.ts src/app/api/alerts/route.ts && git commit -m "feat(alerts): add worst-case fire front ETA line when CSIRO conditions hold (WHI-907)"`

---

## Fase 5 — Parte 4: viento local (METAR del aeropuerto + SMN WRF 4 km)

### Task 5.1: parser del METAR de SAZB

**Files:**
- Create: `src/lib/metar.ts`, `src/__tests__/fixtures/metar-sazb.json`
- Test: `src/__tests__/metar.test.ts`

**Interfaces:**
- Produces: `parseMetarRecord(r: unknown): WindObservation | null`, con `WindObservation = { station: string; observedAt: string; windFromDeg: number | null; windKmh: number; gustKmh: number | null; variable: boolean }`.

- [ ] **Step 1: Capture a real fixture** — `curl -s "https://aviationweather.gov/api/data/metar?ids=SAZB&format=json&hours=3" > src/__tests__/fixtures/metar-sazb.json`. Revisar a mano qué campos trae (`icaoId`, `reportTime`, `wdir`, `wspd`, `wgst`) y si `wdir` puede ser `"VRB"`.
- [ ] **Step 2: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import records from "./fixtures/metar-sazb.json";
import { parseMetarRecord } from "@/lib/metar";

describe("parseMetarRecord", () => {
  it("parses a real SAZB record: knots → km/h, direction FROM", () => {
    const obs = parseMetarRecord((records as unknown[])[0]);
    expect(obs?.station).toBe("SAZB");
    expect(obs?.windFromDeg).toBeGreaterThanOrEqual(0);
    expect(obs?.windFromDeg).toBeLessThan(360);
    const knots = (records as Array<{ wspd: number }>)[0].wspd;
    expect(obs?.windKmh).toBeCloseTo(knots * 1.852, 5);
  });

  it("variable wind has no direction", () => {
    const obs = parseMetarRecord({ icaoId: "SAZB", reportTime: "2026-09-14T12:00:00.000Z", wdir: "VRB", wspd: 3 });
    expect(obs).toMatchObject({ windFromDeg: null, variable: true });
  });

  it("gusts are converted when present and null otherwise", () => {
    expect(parseMetarRecord({ icaoId: "SAZB", reportTime: "2026-09-14T12:00:00.000Z", wdir: 330, wspd: 20, wgst: 30 })?.gustKmh).toBeCloseTo(55.56, 2);
    expect(parseMetarRecord({ icaoId: "SAZB", reportTime: "2026-09-14T12:00:00.000Z", wdir: 330, wspd: 20 })?.gustKmh).toBeNull();
  });

  it("rejects records without time or speed", () => {
    expect(parseMetarRecord({ icaoId: "SAZB", wdir: 330 })).toBeNull();
  });
});
```

- [ ] **Step 3: Run → FAIL**
- [ ] **Step 4: Implement** `src/lib/metar.ts`:

```ts
/** Observed wind from aviationweather.gov METAR JSON (WHI-907 part 4). */
export interface WindObservation {
  station: string;
  observedAt: string;
  windFromDeg: number | null;
  windKmh: number;
  gustKmh: number | null;
  variable: boolean;
}

const KT_TO_KMH = 1.852;

export function parseMetarRecord(r: unknown): WindObservation | null {
  if (!r || typeof r !== "object") return null;
  const rec = r as Record<string, unknown>;
  const station = typeof rec.icaoId === "string" ? rec.icaoId : null;
  const observedAt = typeof rec.reportTime === "string" ? rec.reportTime : null;
  const speedKt = typeof rec.wspd === "number" ? rec.wspd : null;
  if (!station || !observedAt || speedKt === null) return null;
  const variable = rec.wdir === "VRB";
  const windFromDeg = typeof rec.wdir === "number" ? rec.wdir % 360 : null;
  return {
    station,
    observedAt,
    windFromDeg: variable ? null : windFromDeg,
    windKmh: speedKt * KT_TO_KMH,
    gustKmh: typeof rec.wgst === "number" ? rec.wgst * KT_TO_KMH : null,
    variable,
  };
}
```

- [ ] **Step 5: Run → PASS.** Commit: `feat(metar): parse observed wind from SAZB METAR (WHI-907)`

### Task 5.2: migración de viento (archivo, sin aplicar) y cron del METAR

**Files:**
- Create: `scripts/sql/whi-907-wind.sql`, `src/app/api/metar-sync/route.ts`

- [ ] **Step 1: Write the migration file** (NO se aplica: va a C2)

```sql
-- WHI-907 part 4 — observed (METAR) and forecast (SMN WRF 4 km) wind for Bahía Blanca.
-- Apply only after Seba reviews this SQL (checkpoint C2).

create table if not exists public.wind_observations (
  station       text        not null,
  observed_at   timestamptz not null,
  wind_from_deg double precision,
  wind_kmh      double precision not null,
  gust_kmh      double precision,
  variable      boolean     not null default false,
  inserted_at   timestamptz not null default now(),
  primary key (station, observed_at)
);
alter table public.wind_observations enable row level security;
create policy wind_observations_public_read on public.wind_observations
  for select to anon, authenticated using (true);

create table if not exists public.wind_forecast (
  source        text        not null,            -- 'smn-wrf'
  run_at        timestamptz not null,            -- model initialization (00/12 UTC)
  valid_at      timestamptz not null,
  lat           double precision not null,
  lng           double precision not null,
  wind_from_deg double precision not null,
  wind_kmh      double precision not null,
  temp_c        double precision,
  rh_pct        double precision,
  inserted_at   timestamptz not null default now(),
  primary key (source, run_at, valid_at, lat, lng)
);
create index if not exists wind_forecast_valid_idx on public.wind_forecast (valid_at);
alter table public.wind_forecast enable row level security;
create policy wind_forecast_public_read on public.wind_forecast
  for select to anon, authenticated using (true);
-- Writes only with the service role (bypasses RLS); no insert/update policy on purpose.
```

- [ ] **Step 2: Route** `src/app/api/metar-sync/route.ts`:
  - Mismo patrón que las demás rutas de cron: `isCronAuthorized` y `getSupabase`.
  - Pide `https://aviationweather.gov/api/data/metar?ids=SAZB&format=json&hours=2`, parsea con `parseMetarRecord` y hace upsert en `wind_observations` con `onConflict: "station,observed_at"`.
  - Devuelve `{ inserted }`. Si la tabla no existe (error de PostgREST), devuelve 200 con `{ skipped: "table_missing" }` y lo loguea.
- [ ] **Step 3:** `npm test && npm run build` → verde.
- [ ] **Step 4: Commit** — `feat(wind): METAR sync route + wind tables migration file (not applied) (WHI-907)`

### Task 5.3: extracción del SMN WRF

**Files:**
- Create: `smn_wrf/__init__.py`, `smn_wrf/extract.py`, `api/smn-wrf-sync.py`, `tests/python/test_smn_wrf_extract.py`
- Modify: `vercel.json` (función nueva con `maxDuration: 300`, `memory: 1024`, mismos `excludeFiles` que `goes-sync`)

**Interfaces:**
- Produces:
  - `smn_wrf.extract.points_near(ds, lat: float, lng: float, radius_km: float) -> list[dict]`.
  - Cada dict: `{"lat", "lng", "wind_from_deg", "wind_kmh", "temp_c", "rh_pct"}`.

- [ ] **Step 1: Inspect a real file** (el nombre de las variables y de las coordenadas sale de acá, no de la memoria):

```bash
mkdir -p /tmp/smn && curl -s -o /tmp/smn/f.nc "https://smn-ar-wrf.s3.amazonaws.com/DATA/WRF/DET/2026/09/14/00/WRFDETAR_01H_20260914_00_003.nc"
.venv/bin/python -c "import xarray as xr; ds=xr.open_dataset('/tmp/smn/f.nc'); print(ds)"
```

Anotar en este paso, editando el plan:
- los nombres exactos de latitud y longitud (2D en Lambert);
- los de magnitud y dirección del viento a 10 m, temperatura y humedad;
- las unidades (m/s o km/h; convención de la dirección).

> **Anotado el 14/9** (archivo real `WRFDETAR_01H_20260914_00_003.nc`, 34 MB):
> - Grilla `time=1, y=1249, x=999` con coordenadas 2D `lat` / `lon` (Lambert).
> - Variables: `magViento10` (**meter / second**), `dirViento10` (degree), `T2` (°C, calibrada), `HR2` (percent) y `PP` (mm acumulados).
> - Punto más cercano a Bahía Blanca: índice (520, 558) → -38.710, -62.285.
> - Corrida y hora válida: salen del nombre del archivo (`..._AAAAMMDD_HH_FFF.nc` = corrida HH, plazo FFF horas).
> - **Convención de la dirección: verificada "desde dónde viene"** contra el METAR de SAZB el 14/9:
>   - 12Z: SMN 329° / 26,1 km/h contra METAR 330° / 25,9 km/h (diferencia 1°);
>   - 13Z: 326° / 28,9 km/h contra 320° / 33,3 km/h (diferencia 6°).
> - `time` = "hours since AAAA-MM-DD" (el plazo coincide con el FFF del nombre).

- [ ] **Step 2: Write the failing test** con un `xarray.Dataset` sintético que use **esos mismos nombres**. Casos:
  - devuelve sólo los puntos a menos de `radius_km` de Bahía Blanca;
  - convierte la velocidad a km/h si viene en m/s;
  - devuelve la dirección en [0, 360).
- [ ] **Step 3: Implement** `points_near`: distancia haversine sobre las grillas 2D y conversión de unidades según lo anotado en el Step 1.
- [ ] **Step 4: Implement** `api/smn-wrf-sync.py`:
  - Detectar la última corrida disponible (00 o 12 UTC) listando el prefijo S3 del día.
  - Bajar las horas 0–12 **de a una**: abrir, extraer con `points_near(radius_km=60)`, cerrar, borrar el archivo.
  - Upsert en `wind_forecast` con `source='smn-wrf'`.
  - Si la tabla no existe, terminar con 200 y `skipped`.
- [ ] **Step 5:** `.venv/bin/python -m pytest -q` → verde. Correr localmente el extractor sobre `/tmp/smn/f.nc` e imprimir cuántos puntos devuelve (esperado: decenas, no miles).
- [ ] **Step 6: Commit** — `feat(wind): SMN WRF 4 km extraction for Bahía Blanca (WHI-907)`

### Task 5.4: `fetchWind` prefiere el SMN

**Files:**
- Create: `src/lib/wind-forecast.ts` (puro), `src/__tests__/wind-forecast.test.ts`
- Modify: `src/lib/wind.ts`

**Interfaces:**
- Produces: `pickForecastRow(rows: ForecastRow[], lat: number, lng: number, at: Date, maxKm = 10, maxMinutes = 60): ForecastRow | null`.

- [ ] **Step 1: Failing test**:
  - elige la fila más cercana en distancia dentro de la hora válida más próxima;
  - `null` si la más cercana está a más de `maxKm` o fuera de ±`maxMinutes`.
- [ ] **Step 2: Implement** con `haversineKm` de `@/lib/geo`.
- [ ] **Step 3:** `fetchWind(lat, lng)` consulta `wind_forecast` (±1 h, bbox ±0,2°) y usa `pickForecastRow`.
  - Si hay fila: velocidad, dirección, temperatura y humedad salen del SMN.
  - Si no hay fila o hay error: Open-Meteo como hoy.
  - Suma `source: "smn-wrf" | "open-meteo" | "fallback"` a `WindData`.
- [ ] **Step 4:** `npm test && npm run build` → verde. Commit: `feat(wind): prefer SMN WRF forecast near Bahía Blanca, fall back to Open-Meteo (WHI-907)`

---

## Fase 6 — Parte 2: rayos reales (GLM del GOES-19)

### Task 6.1: extracción de flashes GLM

**Files:**
- Create: `glm/__init__.py`, `glm/extract.py`, `tests/python/test_glm_extract.py`

**Interfaces:**
- Produces: `glm.extract.flashes_in_bbox(ds, bbox: tuple[float, float, float, float]) -> list[dict]` con `bbox = (min_lat, min_lng, max_lat, max_lng)`. Cada dict: `{"flash_at": iso8601, "lat", "lng", "energy_j", "area_m2"}`.

- [ ] **Step 1: Inspect a real file**

```bash
key=$(curl -s "https://noaa-goes19.s3.amazonaws.com/?list-type=2&prefix=GLM-L2-LCFA/2026/257/18/&max-keys=1" | grep -oE "<Key>[^<]+</Key>" | sed -E 's/<\/?Key>//g')
curl -s -o /tmp/glm.nc "https://noaa-goes19.s3.amazonaws.com/$key"
.venv/bin/python -c "import xarray as xr; ds=xr.open_dataset('/tmp/glm.nc', decode_times=False); print(ds)"
```

Anotar en el plan:
- los nombres exactos de latitud y longitud del flash, del tiempo relativo al primer evento, de la energía y del área;
- el atributo con la hora de inicio del archivo (`time_coverage_start`) y las unidades.

> **Anotado el 14/9** (archivo real `OR_GLM-L2-LCFA_G19_s20262571400000_...nc`, 113 flashes en 20 s, todo el disco):
> - Por flash: `flash_lat` / `flash_lon` (grados), `flash_energy` (J), `flash_area` (m²), `flash_quality_flag` (0 = buena calidad) y `flash_id`.
> - Tiempo: `flash_time_offset_of_first_event`, en segundos, con `units = "seconds since 2026-09-14 14:00:00.000"`. **La base sale de `units`**; `time_coverage_start` es el inicio del archivo.
> - Se abre con `decode_times=False`.

- [ ] **Step 2: Failing test** con un Dataset sintético que use esos nombres. Casos:
  - filtra por bbox;
  - convierte el offset de tiempo en un instante ISO;
  - devuelve una lista vacía si no hay flashes.
- [ ] **Step 3: Implement.** **Step 4:** pytest verde; correrlo sobre `/tmp/glm.nc` con el bbox de toda Argentina e imprimir el conteo.
- [ ] **Step 5: Commit** — `feat(lightning): extract GLM flashes by bbox (WHI-907)`

### Task 6.2: sync GLM, migración y consulta cercana

**Files:**
- Create: `api/glm-sync.py`, `scripts/sql/whi-907-lightning.sql`, `src/lib/lightning-near.ts`, `src/__tests__/lightning-near.test.ts`
- Modify: `vercel.json`, `src/app/api/lightning-alerts/route.ts`

- [ ] **Step 1: Migration file** (NO se aplica: C2)

```sql
-- WHI-907 part 2 — real lightning flashes from GOES-19 GLM (Argentina bbox).
-- Apply only after Seba reviews this SQL (checkpoint C2).

create table if not exists public.lightning_flashes (
  flash_at    timestamptz not null,
  lat         double precision not null,
  lng         double precision not null,
  energy_j    double precision,
  area_m2     double precision,
  source      text not null default 'glm-g19',
  inserted_at timestamptz not null default now(),
  primary key (flash_at, lat, lng)
);
create index if not exists lightning_flashes_at_idx on public.lightning_flashes (flash_at desc);
alter table public.lightning_flashes enable row level security;
create policy lightning_flashes_public_read on public.lightning_flashes
  for select to anon, authenticated using (true);
-- Writes only with the service role. Retention: keep 7 days.
create or replace function public.purge_old_lightning_flashes() returns void
  language sql security definer set search_path = public as
  $$ delete from public.lightning_flashes where flash_at < now() - interval '7 days' $$;
revoke all on function public.purge_old_lightning_flashes() from public, anon, authenticated;
```

- [ ] **Step 2:** `api/glm-sync.py`:
  - Listar las claves de los últimos 6 minutos (la carpeta de la hora actual y la anterior si hace falta).
  - Bajar cada archivo (~300 KB), extraer con `flashes_in_bbox` usando el bbox de Argentina de `goes-sync.py` y hacer upsert por lotes.
  - Si la tabla no existe, terminar con 200 y `skipped`.
- [ ] **Step 3: Failing test** para `src/lib/lightning-near.ts`:
  - `flashesNear(flashes, lat, lng, radiusKm): Flash[]` y `isDryLightningRisk({ flashesNearby, humidity, recentRainMm }): boolean`.
  - Umbrales: humedad < 60% y lluvia < 0,5 mm, los mismos que ya usa `src/lib/lightning.ts`.
  - Radio por defecto: **30 km**, porque el GLM ubica en cuadros de 8–14 km.
- [ ] **Step 4: Implement** y pasar los tests.
- [ ] **Step 5: Wire it up** — `lightning-alerts` lee `lightning_flashes` de los últimos 30 min.
  - Si hay datos frescos (último `inserted_at` < 15 min) usa rayos reales.
  - Si no, usa el método actual por código de clima y loguea `lightning.fallback_weather_code`.
  - OpenWeather **se retira más adelante**, cuando GLM haya corrido estable en producción.
- [ ] **Step 6:** `npm test`, pytest y `npm run build` → verde. Commit: `feat(lightning): real GLM flashes drive dry-lightning alerts, weather code as fallback (WHI-907)`

> **➡️ Checkpoint C2:** mandarle a Seba `scripts/sql/whi-907-wind.sql` y `scripts/sql/whi-907-lightning.sql` completos, explicados en simple, y **esperar su OK** antes de aplicarlos.

---

## Fase 7 — Parte 3: Xweather (plan gratis) para precisar el rayo

### Task 7.1: cliente inerte sin credenciales, con tope de cupo

**Files:**
- Create: `src/lib/xweather.ts`, `src/__tests__/xweather.test.ts`, `src/__tests__/fixtures/xweather-lightning.json`
- Modify: `src/app/api/lightning-alerts/route.ts`

**Interfaces:**
- Produces:
  - `xweatherConfigured(env = process.env): boolean`
  - `parseLightningResponse(json: unknown): Strike[]`, con `Strike = { at: string; lat: number; lng: number; type: "CG" | "IC" | null; peakAmp: number | null }`
  - `withinMonthlyBudget(used: number, env = process.env): boolean`

- [ ] **Step 1: Fixture from the docs** — leer el ejemplo de respuesta en `https://www.xweather.com/docs/weather-api/endpoints/lightning` y copiar su forma exacta al fixture (sin inventar campos).
- [ ] **Step 2: Failing tests**:
  - sin `XWEATHER_CLIENT_ID` / `XWEATHER_CLIENT_SECRET` → `xweatherConfigured` da `false`;
  - el parser extrae hora, posición y tipo del fixture;
  - `withinMonthlyBudget`: tope = 90% de `XWEATHER_MONTHLY_ACCESSES` (default 15000) dividido `XWEATHER_ACCESSES_PER_LIGHTNING_QUERY` (default **10, hasta verificarlo en C3**).
- [ ] **Step 3: Implement.** En `lightning-alerts`, **sólo** si `xweatherConfigured()`, hay flashes GLM cerca de un suscriptor y hay cupo:
  - una consulta `closest` centrada en el flash;
  - contador del mes en `_clara_config` (`xweather_queries_YYYYMM`);
  - si hay un rayo nube-tierra, la alerta agrega "⚡ Rayo nube-tierra confirmado a X km", con la atribución "Rayos: Vaisala Xweather".
- [ ] **Step 4:** tests + build → verde. Commit: `feat(lightning): optional Xweather CG confirmation within free-tier budget (WHI-907)`

---

## Fase 8 — Parte 11: el cono en el mapa

### Task 8.1: geometría pura del cono

**Files:**
- Create: `src/lib/fire-projection.ts`, `src/__tests__/fire-projection.test.ts`

**Interfaces:**
- Produces:
  - `lengthToBreadth(windKmh: number): number`: FBP O-1, `1.1 × U^0.464`, y 1 si U < 1.
  - `destinationPoint(lat, lng, bearingDeg, distKm): [number, number]`, en [lat, lng].
  - `smokeSector(origin: {lat, lng}, windFromDeg, windKmh, minutes, halfAngleDeg): GeoJSON.Feature<Polygon>`, con `kind: "smoke"`.
  - `frontIsochrone(origin, windFromDeg, windKmh, minutes): GeoJSON.Feature<Polygon>`, con `kind: "front"` y `eta_minutes`.
  - `projectFire(input): GeoJSON.FeatureCollection`, que aplica las reglas de "cuándo no dibujar".

- [ ] **Step 1: Failing tests**

```ts
import { describe, expect, it } from "vitest";
import { bearingDegrees } from "@/lib/geo";
import { destinationPoint, lengthToBreadth, projectFire, smokeSector } from "@/lib/fire-projection";

const ORIGIN = { lat: -38.6, lng: -62.4 };

describe("lengthToBreadth (FBP O-1 grass)", () => {
  it.each([[5, 2.32], [30, 5.33], [50, 6.76]])("wind %i km/h → L:B ≈ %f", (u, lb) => {
    expect(lengthToBreadth(u)).toBeCloseTo(lb, 1);
  });

  it("calm wind is a circle", () => {
    expect(lengthToBreadth(0.5)).toBe(1);
  });
});

describe("smokeSector", () => {
  it("points downwind: wind from the northwest → sector toward the southeast", () => {
    const f = smokeSector(ORIGIN, 315, 40, 60, 15);
    const ring = f.geometry.coordinates[0];
    const far = ring[Math.floor(ring.length / 2)]; // [lng, lat]
    expect(bearingDegrees(ORIGIN.lat, ORIGIN.lng, far[1], far[0])).toBeGreaterThan(120);
    expect(bearingDegrees(ORIGIN.lat, ORIGIN.lng, far[1], far[0])).toBeLessThan(150);
  });
});

describe("destinationPoint", () => {
  it("10 km due south lowers latitude by ~0.09°", () => {
    const [lat, lng] = destinationPoint(ORIGIN.lat, ORIGIN.lng, 180, 10);
    expect(lat).toBeCloseTo(ORIGIN.lat - 0.0899, 3);
    expect(lng).toBeCloseTo(ORIGIN.lng, 6);
  });
});

describe("projectFire", () => {
  it("draws smoke but no front when CSIRO conditions do not hold", () => {
    const fc = projectFire({ origin: ORIGIN, windFromDeg: 315, windKmh: 20, tempC: 22, rhPct: 60, confirmed: true });
    expect(fc.features.some((f) => f.properties?.kind === "smoke")).toBe(true);
    expect(fc.features.some((f) => f.properties?.kind === "front")).toBe(false);
  });

  it("draws front isochrones at 30/60/120/180 min when conditions hold", () => {
    const fc = projectFire({ origin: ORIGIN, windFromDeg: 315, windKmh: 40, tempC: 35, rhPct: 15, confirmed: true });
    const etas = fc.features.filter((f) => f.properties?.kind === "front").map((f) => f.properties?.eta_minutes);
    expect(etas).toEqual([30, 60, 120, 180]);
  });

  it("unconfirmed GOES detection → smoke only, labelled as possible", () => {
    const fc = projectFire({ origin: ORIGIN, windFromDeg: 315, windKmh: 40, tempC: 35, rhPct: 15, confirmed: false });
    expect(fc.features.every((f) => f.properties?.kind === "smoke")).toBe(true);
    expect(fc.features[0].properties?.possible_fire).toBe(true);
  });

  it("calm or variable wind → a single 'variable' circle", () => {
    const fc = projectFire({ origin: ORIGIN, windFromDeg: 0, windKmh: 5, tempC: 35, rhPct: 15, confirmed: true });
    expect(fc.features.map((f) => f.properties?.kind)).toEqual(["variable"]);
  });
});
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement.** Detalle de la geometría:
  - `destinationPoint` usa la fórmula esférica estándar (R = 6371 km).
  - El sector de humo es un abanico de 13 puntos: origen + arco de `windFrom+180 ± halfAngle` a distancia `windKmh × minutes / 60`, con tope de 3 h.
  - La isócrona del frente es una elipse:
    - la cabeza a `H = 0.2 × windKmh × minutes / 60` km;
    - `a = H / (1 + sqrt(1 − 1/LB²))` y `b = a / LB`;
    - centro desplazado `a − (a − H)` hacia sotavento: el foco queda en el foco trasero de la elipse;
    - 36 vértices.
  - `half_angle_deg` por defecto: 15.
  - Constantes con nombre: `SMOKE_MAX_MINUTES = 180`, `CALM_WIND_KMH = 10`, `FRONT_ETAS_MIN = [30, 60, 120, 180]`.
  - Toda Feature lleva `issued_at`, `valid_to` (issued + 1 h) y `wind_source`.
- [ ] **Step 4: Run → PASS.** Commit: `feat(map): pure smoke sector and CSIRO front isochrones as GeoJSON (WHI-907)`

### Task 8.2: endpoint y capas en el mapa de ciudad

**Files:**
- Create: `src/app/api/fire-projection/route.ts`
- Modify: `src/components/city/city-map.tsx`

- [ ] **Step 1: Read first:**
  - `node_modules/next/dist/docs/01-app/` (route handlers, cache).
  - `src/components/city/city-map.tsx` completo: cómo recibe focos y cómo dibuja el viento.
- [ ] **Step 2: Endpoint** `GET /api/fire-projection?lat=&lng=&confirmed=1`: valida rangos, llama a `fetchWind`, devuelve `projectFire(...)` con `Cache-Control: public, s-maxage=600`.
- [ ] **Step 3: Map layers:**
  - Por cada foco dentro del radio del mapa, pedir la proyección y dibujar con `L.geoJSON`.
  - Humo: `color #475569`, `fillOpacity 0.12`, `dashArray "4 4"`.
  - Frente: de `#7c2d12` / 0.45 (30 min) a `#fdba74` / 0.12 (180 min), con tooltip permanente `+1 h (≈HH:MM)`.
  - "variable": círculo tenue.
  - Orden de capas: humo → frente → flechas → focos.
  - Leyenda fija con los textos de WHI-907 parte 11 y el pie "Es una estimación, no un límite…".
- [ ] **Step 4:** `npm run build` → OK. Revisión visual en el preview: la hace Seba (el preview está protegido).
- [ ] **Step 5: Commit** — `feat(map): draw smoke and fire front projection layers with legend (WHI-907)`

---

## Fase 9 — Parte 9: página de Bahía Blanca

### Task 9.1: `/bahia-blanca`, redirect, deep link y link de la alerta

**Files:**
- Create: `src/app/(main)/bahia-blanca/page.tsx`
- Modify: config de redirects de Next, `src/app/sitemap.ts`, `src/app/api/bot/telegram/route.ts`, `src/app/api/alerts/route.ts`

- [ ] **Step 1: Read first** — `src/app/(main)/ciudad/[province]/[city]/page.tsx` (cómo arma `CityDashboard`, metadata y JSON-LD) y la guía de Next 16 sobre `searchParams` en páginas.
- [ ] **Step 2: Page.** Reusa `CityDashboard`, `CityForestFires` y `CitySatelliteCoverage` con los datos de Bahía Blanca de `PROVINCES`, y suma cuatro secciones:
  - "Rayos en las últimas horas" (de `lightning_flashes`; oculta si la tabla no existe);
  - "Viento medido en el aeropuerto" (`wind_observations`);
  - "Historial": 3.905 detecciones en 2023–2025 y 29 eventos de alerta por año a menos de 50 km (texto estático con fuente WHI-903 / pricing);
  - CTA "Recibí las alertas de Bahía Blanca" → `https://t.me/alertaforestal_bot?start=ciudad-bahia-blanca`.
  - Acepta `?foco=<lat>,<lng>` para centrar el mapa.
- [ ] **Step 3: Bot:** payload `ciudad-<slug>` → suscribe con las coordenadas de esa ciudad de `PROVINCES` (el mismo camino que `/ciudad`) y registra `source = "campaign:ciudad-<slug>"`. Test de parser en `src/__tests__/`.
- [ ] **Step 4: Redirect** `/ciudad/buenos-aires/bahia-blanca` → `/bahia-blanca` (permanente). En el sitemap, cambiar la URL de Bahía.
- [ ] **Step 5: Alert link:** si el foco está a menos de 100 km del centro de Bahía Blanca, la alerta agrega `🗺️ <a href="https://alertaforestal.org/bahia-blanca?foco=LAT,LNG">Ver hacia dónde va</a>`, antes del link de Google Maps.
- [ ] **Step 6:** `npm test && npm run build` → verde. Commit: `feat(bahia-blanca): dedicated city page, city deep link and focused map link (WHI-907)`

---

## Fase 10 — Parte 6: imagen de fuego cada 1 minuto (mesoescala)

### Task 10.1: leer `ABI-L2-FDCM` sólo cuando el sector cubre Bahía

**Files:**
- Modify: `api/goes-sync.py`
- Test: `tests/python/test_mesoscale_coverage.py`

**Interfaces:**
- Produces: `mesoscale_covers(lat_min, lat_max, lng_min, lng_max, point=(-38.72, -62.27)) -> bool` y `latest_mesoscale_keys(client) -> list[str]`.

- [ ] **Step 1: Inspect a real FDCM file** (el producto existe: verificado el 14/9):

```bash
key=$(curl -s "https://noaa-goes19.s3.amazonaws.com/?list-type=2&prefix=ABI-L2-FDCM/2026/257/18/&max-keys=1" | grep -oE "<Key>[^<]+</Key>" | sed -E 's/<\/?Key>//g')
curl -s -o /tmp/fdcm.nc "https://noaa-goes19.s3.amazonaws.com/$key"
.venv/bin/python -c "import xarray as xr; ds=xr.open_dataset('/tmp/fdcm.nc'); print(ds.attrs.get('geospatial_lat_lon_extent')); print(list(ds.variables))"
```

Anotar dónde está la extensión geográfica del sector.

> **Anotado el 14/9** (archivo real `OR_ABI-L2-FDCM1-M6_G19_s20262571400291_...nc`, 500×500):
> - La extensión está en los atributos de la variable `geospatial_lat_lon_extent`: `geospatial_westbound_longitude`, `geospatial_eastbound_longitude`, `geospatial_southbound_latitude` y `geospatial_northbound_latitude`.
> - Ese día el sector M1 cubría **EE.UU.** (32.7–47.4°N, -110 a -89°): no cubre Bahía.
> - `scene_id = "Mesoscale"`. Mismas variables de fuego que el full disk: `Mask`, `Area`, `Temp`, `Power` y `DQF`.

- [ ] **Step 2: Failing pytest** — un sector sobre EE.UU. no cubre Bahía; uno centrado en (-38, -62) sí.
- [ ] **Step 3: Implement.** Después del full disk, `goes-sync` lista los `FDCM` de los últimos 10 min.
  - Por cada archivo, si `mesoscale_covers` da `True`, lo procesa con la misma `extract_filtered_detections`.
  - Si ningún sector cubre Bahía, no hace nada y lo registra en las stats.
- [ ] **Step 4:** pytest verde. Commit: `feat(goes): process 1-minute mesoscale fire product when a sector covers Bahía Blanca (WHI-907)`

---

## Fase 11 — Cierre

- [ ] **Docs:**
  - `CLAUDE.md` del repo: páginas (`/bahia-blanca`; sin `/cuarteles`), APIs nuevas, fuentes (GLM, SMN WRF, METAR, Xweather opcional), tablas nuevas (marcadas "pendiente de C2" si no se aplicaron) y variables de entorno (`OPEN_METEO_API_KEY`, `XWEATHER_*`).
  - Banner en `ANALISIS_SATELITES_ALERTAFORESTAL.md`: *"Desactualizado (14/9/2026): MTG no ve Bahía Blanca (77° del cenit) y los términos de Blitzortung prohíben sistemas de alerta. Ver WHI-907."*
- [ ] **Verificación completa:** `npm test`, `.venv/bin/python -m pytest -q`, `npm run build`, `git status` (sin archivos ajenos agregados).
- [ ] **Push y PR:**
  - `git push -u origin feat/whi-907-bahia-blanca-nivel-1`.
  - PR en borrador contra `main` con: resumen en simple, checkpoints C1–C5 pendientes, textos nuevos de alerta (C1) y cómo probar.
  - Linkear WHI-907 y WHI-908.
- [ ] **Esperar a Seba:** C1 (textos), C2 (SQL), C4 (borrado de bomberos) y C5 (merge, crons y verificación del deploy real con una respuesta que cambie entre versiones, tomando la línea base antes de mergear).
