# FWI Province Page (Milestone 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a public, map-centric page `/[provincia]` (starting with `/tierra-del-fuego`) that shows the FWI fire-danger of each zone of a province — painted on the map by danger class — with a forecast slider, drivers, a trend chart, a detection layer, and SEO, consuming the data the engine already writes to Supabase.

**Architecture:** A pure client-safe module (`fire-danger.ts`) holds the types, the class→color map, and the pure helpers (worst-class, province bbox, date labels) — unit-tested with Vitest. A server-only loader reads `danger_zones` + the latest `fire_danger` forecast per province. A server component (`app/[provincia]/page.tsx`, own layout without footer like `/mapa`) loads that data and hands it to a client `<ProvinceView>` that owns the selected-day + detection state and renders a Leaflet map (`<ProvinceMap>`) plus a side panel (`<DangerPanel>` with `<DangerTrend>`). The Leaflet/React surfaces are verified in a Vercel preview, not unit-tested.

**Tech Stack:** Next.js 16 App Router (server components, `generateStaticParams`/`generateMetadata`, ISR), TypeScript, Leaflet (dynamic import `ssr:false`), Recharts, Supabase (`getSupabase()` service role, server-only), Vitest (pure logic), existing design tokens + `.clp-*` panel CSS + `<Pill>`.

---

## Decisiones cerradas (del spec + ajustes de implementación)

From `docs/superpowers/specs/2026-06-18-fwi-provincia-page-design.md`, plus implementation refinements. Do not re-litigate.

1. **Map-centric, no footer** — own layout mirroring `app/mapa/layout.tsx`. Zones drawn as **bbox-shaded areas by class + center marker** (polygons drop in later when `geometry` is non-null).
2. **TDD only on pure logic** — `fire-danger.ts` (types, colors, helpers) is client-safe TS and gets Vitest tests. The server loader (DB) and the Leaflet/React components are verified by **building + a Vercel preview**, not unit tests (mocking Leaflet/Supabase would test the mock).
3. **No Supabase TS types exist** — define manual interfaces (the repo's pattern, e.g. `FirePoint`). Cast `getSupabase()` query results to them.
4. **`params` is a Promise** (Next 16) — always `await params`.
5. **Province list is hardcoded** — `PREVENTION_PROVINCE_IDS = ["tierra-del-fuego"]` in `fire-danger.ts`. `generateStaticParams` uses it (no DB call at build time, which has no env locally). Adding a province later = add its zones + add the id here + deploy. Same end result as the spec ("only provinces with zones"), without a build-time DB dependency.
6. **Data read at runtime/ISR** — `getProvinceDanger()` reads Supabase in the server component (Vercel build/preview has the env). It returns `null` on any failure so local `npm run dev`/`build` (no env) renders an empty state instead of crashing. Real data is verified in the preview.
7. **Route `/[provincia]` at root + own layout.** Task 3 runs a build to confirm Next 16 accepts a root dynamic segment alongside the `(main)` group and `/mapa`. **Fallback if the build errors with a routing conflict:** move to `app/provincia/[id]/` (static prefix, same files, URL `/provincia/tierra-del-fuego`). The sitemap/canonical use whichever path ships.

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/fire-danger.ts` | **client-safe.** Types (`DangerClass`, `ZoneForecastDay`, `DangerZone`, `ProvinceDanger`), `PREVENTION_PROVINCE_IDS`, `DANGER_CLASSES`, `DANGER_CLASS_COLORS`, `dangerColor()`, `dangerPillTone()`, `worstClass()`, `provinceBbox()`, `forecastDateLabel()`. No React/Leaflet/Supabase imports. |
| `src/lib/fire-danger-server.ts` | **server-only** (`import "server-only"`). `getProvinceDanger(provinceId)` → reads `danger_zones` + latest `fire_danger`, returns `ProvinceDanger | null`. |
| `src/app/[provincia]/layout.tsx` | Layout without footer (mirror of `app/mapa/layout.tsx`). |
| `src/app/[provincia]/page.tsx` | Server component: `generateStaticParams`, `generateMetadata`, loads data, renders `<ProvinceView>` + JSON-LD. |
| `src/components/danger/province-view.tsx` | **client.** Owns `selectedDay` + `showDetection` state; lays out map + panel; mobile drawer. |
| `src/components/danger/province-map.tsx` | **client.** Leaflet map; `paintDangerZones` (areas+marker) + detection layer. |
| `src/components/danger/danger-panel.tsx` | **client.** Header, overall Pill, slider, zone list, detection toggle, sources. |
| `src/components/danger/danger-trend.tsx` | **client.** Recharts mini-trend of FWI over the 16 days. |
| `src/components/jsonld.tsx` | Modify: add `ProvinceJsonLd`. |
| `src/app/sitemap.ts` | Modify: add province URLs (from `PREVENTION_PROVINCE_IDS`). |
| `src/__tests__/fire-danger.test.ts` | Vitest for the pure logic. |

---

## Task 1: Pure module `fire-danger.ts` (types + colors + helpers, TDD)

**Files:**
- Create: `src/lib/fire-danger.ts`
- Test: `src/__tests__/fire-danger.test.ts`

- [ ] **Step 1: Write the failing test**

`src/__tests__/fire-danger.test.ts`:
```typescript
import { describe, expect, it } from "vitest";
import {
  DANGER_CLASSES,
  PREVENTION_PROVINCE_IDS,
  dangerColor,
  dangerPillTone,
  worstClass,
  provinceBbox,
  forecastDateLabel,
  type DangerZone,
} from "../lib/fire-danger";

describe("fire-danger pure helpers", () => {
  it("orders classes and maps colors + pill tones", () => {
    expect(DANGER_CLASSES).toEqual(["bajo", "moderado", "alto", "muy alto", "extremo"]);
    expect(dangerColor("bajo")).toBe("#4d8f54");
    expect(dangerColor("alto")).toBe("#d2541d");
    expect(dangerColor("extremo")).toBe("#c23a3a");
    expect(dangerPillTone("bajo")).toBe("good");
    expect(dangerPillTone("moderado")).toBe("warn");
    expect(dangerPillTone("alto")).toBe("bad");
    expect(dangerPillTone("muy alto")).toBe("danger");
    expect(dangerPillTone("extremo")).toBe("danger");
  });

  it("worstClass returns the highest severity present", () => {
    expect(worstClass(["bajo", "alto", "moderado"])).toBe("alto");
    expect(worstClass(["bajo", "bajo"])).toBe("bajo");
    expect(worstClass([])).toBe("bajo");
  });

  it("provinceBbox unions zone bboxes [south,north,west,east]", () => {
    const zones = [
      { bbox: [-54.2, -52.6, -68.6, -66.4] },
      { bbox: [-55.1, -54.2, -68.7, -66.9] },
    ] as DangerZone[];
    expect(provinceBbox(zones)).toEqual([-55.1, -52.6, -68.7, -66.4]);
  });

  it("forecastDateLabel labels today/tomorrow/relative", () => {
    expect(forecastDateLabel("2026-06-18", "2026-06-18")).toBe("Hoy");
    expect(forecastDateLabel("2026-06-19", "2026-06-18")).toBe("Mañana");
    expect(forecastDateLabel("2026-06-21", "2026-06-18")).toBe("+3 días");
  });

  it("exposes Tierra del Fuego as a prevention province", () => {
    expect(PREVENTION_PROVINCE_IDS).toContain("tierra-del-fuego");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/fire-danger.test.ts`
Expected: FAIL — `Cannot find module '../lib/fire-danger'`.

- [ ] **Step 3: Write minimal implementation**

`src/lib/fire-danger.ts`:
```typescript
// Client-safe FWI fire-danger types + presentation helpers. No React/Leaflet/
// Supabase imports — importable from server components, client components, and
// Vitest alike. The Supabase repo has no generated types, so these interfaces
// are the contract (same pattern as FirePoint in firms.ts).

export type DangerClass = "bajo" | "moderado" | "alto" | "muy alto" | "extremo";

export const DANGER_CLASSES: DangerClass[] = ["bajo", "moderado", "alto", "muy alto", "extremo"];

// Provinces with prevention zones today. Add an id here when its zones exist.
export const PREVENTION_PROVINCE_IDS: string[] = ["tierra-del-fuego"];

export interface ZoneForecastDay {
  target_date: string; // YYYY-MM-DD
  fwi: number;
  danger_class: DangerClass;
  temp: number | null;
  rh: number | null;
  wind: number | null;
  precip: number | null;
}

export interface DangerZone {
  id: string;
  name: string;
  lat: number;
  lng: number;
  bbox: [number, number, number, number]; // [south, north, west, east]
  forecast: ZoneForecastDay[];
}

export interface ProvinceDanger {
  provinceId: string;
  provinceName: string;
  computedAt: string;
  dates: string[]; // the forecast target_dates, ordered
  zones: DangerZone[];
}

const COLORS: Record<DangerClass, string> = {
  bajo: "#4d8f54", // --good
  moderado: "#bd8512", // --warn
  alto: "#d2541d", // --bad
  "muy alto": "#c23a3a", // --danger
  extremo: "#c23a3a", // --danger (intensified by label)
};

export function dangerColor(c: DangerClass): string {
  return COLORS[c];
}

export function dangerPillTone(c: DangerClass): "good" | "warn" | "bad" | "danger" {
  switch (c) {
    case "bajo":
      return "good";
    case "moderado":
      return "warn";
    case "alto":
      return "bad";
    default:
      return "danger"; // muy alto, extremo
  }
}

export function worstClass(classes: DangerClass[]): DangerClass {
  let worst = 0;
  for (const c of classes) {
    const i = DANGER_CLASSES.indexOf(c);
    if (i > worst) worst = i;
  }
  return DANGER_CLASSES[worst];
}

export function provinceBbox(zones: Pick<DangerZone, "bbox">[]): [number, number, number, number] {
  const s = Math.min(...zones.map((z) => z.bbox[0]));
  const n = Math.max(...zones.map((z) => z.bbox[1]));
  const w = Math.min(...zones.map((z) => z.bbox[2]));
  const e = Math.max(...zones.map((z) => z.bbox[3]));
  return [s, n, w, e];
}

export function forecastDateLabel(dateStr: string, todayStr: string): string {
  const day = Date.parse(`${dateStr}T00:00:00Z`);
  const today = Date.parse(`${todayStr}T00:00:00Z`);
  const diff = Math.round((day - today) / 86_400_000);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  if (diff > 1) return `+${diff} días`;
  return dateStr;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/fire-danger.test.ts`
Expected: PASS (5 passed).

- [ ] **Step 5: Run the whole suite + lint, then commit**

Run: `npm run test && npm run lint`
Expected: existing suite green; eslint clean.
```bash
git add src/lib/fire-danger.ts src/__tests__/fire-danger.test.ts
git commit -m "feat: client-safe fire-danger types, colors and pure helpers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Server loader `getProvinceDanger`

No unit test (it hits Supabase). Verified end-to-end in the preview (Task 3 onward). Keep it small and defensive.

**Files:**
- Create: `src/lib/fire-danger-server.ts`

- [ ] **Step 1: Implement the loader**

`src/lib/fire-danger-server.ts`:
```typescript
import "server-only";
import { getSupabase } from "@/lib/supabase";
import { PROVINCES } from "@/lib/argentina-cities";
import type {
  DangerClass,
  DangerZone,
  ProvinceDanger,
  ZoneForecastDay,
} from "@/lib/fire-danger";

interface ZoneRow {
  id: string;
  name: string;
  lat: number;
  lng: number;
  bbox: number[];
}
interface ForecastRow {
  zone_id: string;
  target_date: string;
  fwi: number;
  danger_class: string;
  temp: number | null;
  rh: number | null;
  wind: number | null;
  precip: number | null;
}

// Reads the province's zones + their latest forecast. Returns null on any
// failure (no env locally, no zones, DB error) so callers render an empty state
// instead of crashing the build.
export async function getProvinceDanger(provinceId: string): Promise<ProvinceDanger | null> {
  try {
    const db = getSupabase();
    const { data: zoneData } = await db
      .from("danger_zones")
      .select("id,name,lat,lng,bbox")
      .eq("province", provinceId);
    const zones = (zoneData ?? []) as ZoneRow[];
    if (zones.length === 0) return null;

    const zoneIds = zones.map((z) => z.id);
    const { data: latest } = await db
      .from("fire_danger")
      .select("computed_at")
      .in("zone_id", zoneIds)
      .order("computed_at", { ascending: false })
      .limit(1)
      .single();
    const computedAt = (latest as { computed_at: string } | null)?.computed_at;
    if (!computedAt) return null;

    const { data: rowData } = await db
      .from("fire_danger")
      .select("zone_id,target_date,fwi,danger_class,temp,rh,wind,precip")
      .in("zone_id", zoneIds)
      .eq("computed_at", computedAt)
      .order("target_date", { ascending: true });
    const rows = (rowData ?? []) as ForecastRow[];

    const byZone = new Map<string, ZoneForecastDay[]>();
    for (const r of rows) {
      const list = byZone.get(r.zone_id) ?? [];
      list.push({
        target_date: r.target_date,
        fwi: r.fwi,
        danger_class: r.danger_class as DangerClass,
        temp: r.temp,
        rh: r.rh,
        wind: r.wind,
        precip: r.precip,
      });
      byZone.set(r.zone_id, list);
    }

    const builtZones: DangerZone[] = zones.map((z) => ({
      id: z.id,
      name: z.name,
      lat: z.lat,
      lng: z.lng,
      bbox: [z.bbox[0], z.bbox[1], z.bbox[2], z.bbox[3]],
      forecast: byZone.get(z.id) ?? [],
    }));

    const dates = builtZones[0]?.forecast.map((f) => f.target_date) ?? [];
    const provinceName = PROVINCES.find((p) => p.id === provinceId)?.name ?? provinceId;

    return { provinceId, provinceName, computedAt, dates, zones: builtZones };
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` (or `npm run build` later; at minimum ensure no TS errors in this file)
Expected: no type errors.
```bash
git add src/lib/fire-danger-server.ts
git commit -m "feat: server loader getProvinceDanger (zones + latest forecast)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Route + layout + minimal page (first navigable preview)

Goal: a real, navigable `/tierra-del-fuego` that lists the zones in text. Proves routing, SSG, data load.

**Files:**
- Create: `src/app/[provincia]/layout.tsx`
- Create: `src/app/[provincia]/page.tsx`

- [ ] **Step 1: Create the layout (mirror of mapa, no footer)**

`src/app/[provincia]/layout.tsx`:
```typescript
import { Nav } from "@/components/nav";
import { EmberParticles } from "@/components/ember-particles";

export default function ProvinciaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-[100dvh] relative">
      <div className="clara-ambient" aria-hidden />
      <EmberParticles />
      <div className="relative z-[3]">
        <Nav />
      </div>
      <div className="relative z-[3]">{children}</div>
    </div>
  );
}
```

- [ ] **Step 2: Create the minimal page**

`src/app/[provincia]/page.tsx`:
```typescript
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PROVINCES } from "@/lib/argentina-cities";
import { PREVENTION_PROVINCE_IDS } from "@/lib/fire-danger";
import { getProvinceDanger } from "@/lib/fire-danger-server";

export const revalidate = 3600;
export const dynamicParams = false;

interface PageProps {
  params: Promise<{ provincia: string }>;
}

export async function generateStaticParams() {
  return PREVENTION_PROVINCE_IDS.map((provincia) => ({ provincia }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { provincia } = await params;
  const name = PROVINCES.find((p) => p.id === provincia)?.name ?? provincia;
  const title = `Peligro de incendios en ${name}`;
  const description = `Índice de peligro de incendio (FWI) por zona en ${name}, con pronóstico a 16 días. Prevención antes del foco.`;
  return {
    title,
    description,
    alternates: { canonical: `/${provincia}` },
    openGraph: { title: `${title} — AlertaForestal`, description },
    twitter: { card: "summary_large_image", title: `${title} — AlertaForestal`, description },
  };
}

export default async function ProvinciaPage({ params }: PageProps) {
  const { provincia } = await params;
  if (!PREVENTION_PROVINCE_IDS.includes(provincia)) notFound();
  const data = await getProvinceDanger(provincia);

  return (
    <main className="relative z-10 border-t border-border p-6">
      <h1 className="text-2xl font-bold">Peligro de incendios — {data?.provinceName ?? provincia}</h1>
      {!data ? (
        <p className="text-muted mt-3">Sin datos de pronóstico disponibles.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {data.zones.map((z) => (
            <li key={z.id} className="font-mono text-sm">
              {z.name}: {z.forecast[0]?.danger_class ?? "—"} (FWI {z.forecast[0]?.fwi ?? "—"})
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Build to verify routing (the key check)**

Run: `npm run build`
Expected: build succeeds; `/[provincia]` appears in the route list as SSG with 1 param (`tierra-del-fuego`). The page may render the empty state locally (no Supabase env) — that's fine.
**If the build errors with a parallel-routes / conflicting-segment message:** apply the fallback — move both files to `src/app/provincia/[id]/` (param renamed `id`, canonical/route becomes `/provincia/...`), and update the `params` type + `generateStaticParams` key accordingly. Re-run the build.

- [ ] **Step 4: Commit**

```bash
git add src/app/[provincia]/layout.tsx src/app/[provincia]/page.tsx
git commit -m "feat: /[provincia] route, layout (no footer) and data-backed minimal page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Push branch + verify in preview**

```bash
git push -u origin feat/fwi-provincia-page
```
Then (controller, via Vercel MCP): find the preview deployment, and load `https://<preview>/tierra-del-fuego` through `web_fetch_vercel_url` (preview is behind SSO). Expected: the two TDF zones listed with their class + FWI from the real data. This confirms SSG + the server loader against production data.

---

## Task 4: `<ProvinceView>` + `<DangerPanel>` (header, overall danger, zone list)

Introduce the client container and the panel (no map yet). Wire the page to it.

**Files:**
- Create: `src/components/danger/province-view.tsx`
- Create: `src/components/danger/danger-panel.tsx`
- Modify: `src/app/[provincia]/page.tsx`

- [ ] **Step 1: Create `<DangerPanel>` (reuses `.clp-*` + `<Pill>`)**

`src/components/danger/danger-panel.tsx`:
```typescript
"use client";
import { Pill } from "@/components/clara-ui";
import {
  dangerPillTone,
  worstClass,
  forecastDateLabel,
  type ProvinceDanger,
} from "@/lib/fire-danger";

export function DangerPanel({
  data,
  selectedDay,
  onSelectDay,
  today,
}: {
  data: ProvinceDanger;
  selectedDay: number;
  onSelectDay: (i: number) => void;
  today: string;
}) {
  const dayClasses = data.zones.map((z) => z.forecast[selectedDay]?.danger_class ?? "bajo");
  const overall = worstClass(dayClasses);
  const dateStr = data.dates[selectedDay];

  return (
    <div className="clp-panel">
      <div className="clp-block">
        <div className="clp-title">{data.provinceName}</div>
        <div className="clp-sub">Peligro de incendio · {forecastDateLabel(dateStr, today)}</div>
        <div style={{ marginTop: 8 }}>
          <Pill tone={dangerPillTone(overall)}>{overall}</Pill>
        </div>
      </div>

      <div className="clp-block">
        <div className="clp-label">Pronóstico</div>
        <input
          type="range"
          min={0}
          max={data.dates.length - 1}
          value={selectedDay}
          onChange={(e) => onSelectDay(Number(e.target.value))}
          style={{ width: "100%" }}
          aria-label="Día de pronóstico"
        />
        <div className="clp-sub">{forecastDateLabel(dateStr, today)}</div>
      </div>

      <div className="clp-block clp-block--scroll">
        <div className="clp-label">Zonas</div>
        {data.zones.map((z) => {
          const d = z.forecast[selectedDay];
          return (
            <div key={z.id} className="clp-fire">
              <div>
                <strong>{z.name}</strong>
                <div className="clp-sub">
                  FWI {d?.fwi ?? "—"} · {d?.temp ?? "—"}°C · HR {d?.rh ?? "—"}% · viento {d?.wind ?? "—"}
                </div>
              </div>
              <Pill tone={dangerPillTone(d?.danger_class ?? "bajo")}>{d?.danger_class ?? "—"}</Pill>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `<ProvinceView>` (owns state)**

`src/components/danger/province-view.tsx`:
```typescript
"use client";
import { useState } from "react";
import type { ProvinceDanger } from "@/lib/fire-danger";
import { DangerPanel } from "./danger-panel";

export function ProvinceView({ data, today }: { data: ProvinceDanger; today: string }) {
  const [selectedDay, setSelectedDay] = useState(0);
  // Map comes in Task 5; for now the panel sits in the map column.
  return (
    <div style={{ display: "flex", height: "calc(100dvh - 64px)" }}>
      <div style={{ flex: 1, background: "var(--surface-2)" }} aria-hidden />
      <DangerPanel data={data} selectedDay={selectedDay} onSelectDay={setSelectedDay} today={today} />
    </div>
  );
}
```

- [ ] **Step 3: Wire the page to `<ProvinceView>`**

In `src/app/[provincia]/page.tsx`, replace the `<main>` body's `data` branch with `<ProvinceView>`, and compute `today` server-side. Replace the render block:
```typescript
import { ProvinceView } from "@/components/danger/province-view";
// ...
export default async function ProvinciaPage({ params }: PageProps) {
  const { provincia } = await params;
  if (!PREVENTION_PROVINCE_IDS.includes(provincia)) notFound();
  const data = await getProvinceDanger(provincia);
  const today = new Date().toISOString().slice(0, 10);

  if (!data) {
    return (
      <main className="relative z-10 border-t border-border p-6">
        <p className="text-muted">Sin datos de pronóstico disponibles para esta provincia.</p>
      </main>
    );
  }
  return (
    <main className="relative z-10 border-t border-border">
      <ProvinceView data={data} today={today} />
    </main>
  );
}
```

- [ ] **Step 4: Build + commit**

Run: `npm run build && npm run lint`
Expected: green.
```bash
git add src/components/danger/province-view.tsx src/components/danger/danger-panel.tsx src/app/[provincia]/page.tsx
git commit -m "feat: ProvinceView + DangerPanel (overall danger, slider, zone list)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Push + preview check** — panel shows both zones, the overall Pill, and the slider changes the day's values. (Map area is still a placeholder.)

---

## Task 5: `<ProvinceMap>` — Leaflet with painted danger areas

**Files:**
- Create: `src/components/danger/province-map.tsx`
- Modify: `src/components/danger/province-view.tsx`

- [ ] **Step 1: Create the map (dynamic-imported, `ssr:false`) + paint helper**

`src/components/danger/province-map.tsx`:
```typescript
"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  dangerColor,
  provinceBbox,
  type ProvinceDanger,
} from "@/lib/fire-danger";

export function ProvinceMap({ data, selectedDay }: { data: ProvinceDanger; selectedDay: number }) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const zonesLayer = useRef<L.LayerGroup | null>(null);

  // init once
  useEffect(() => {
    if (!elRef.current) return;
    const [s, n, w, e] = provinceBbox(data.zones);
    const map = L.map(elRef.current, { zoomControl: false, attributionControl: false });
    map.fitBounds([[s, w], [n, e]], { padding: [24, 24] });
    L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", { maxZoom: 18 }).addTo(map);
    L.control.zoom({ position: "bottomright" }).addTo(map);
    zonesLayer.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
      zonesLayer.current = null;
    };
  }, [data]);

  // repaint on day change
  useEffect(() => {
    const layer = zonesLayer.current;
    if (!layer) return;
    layer.clearLayers();
    for (const z of data.zones) {
      const day = z.forecast[selectedDay];
      const color = dangerColor(day?.danger_class ?? "bajo");
      const [s, n, w, e] = z.bbox;
      L.rectangle([[s, w], [n, e]], { color, weight: 1, fillColor: color, fillOpacity: 0.22 }).addTo(layer);
      L.circleMarker([z.lat, z.lng], { radius: 6, color, fillColor: color, fillOpacity: 1, weight: 1 })
        .bindTooltip(`${z.name} · ${day?.danger_class ?? "—"} · FWI ${day?.fwi ?? "—"}`)
        .addTo(layer);
    }
  }, [data, selectedDay]);

  return <div ref={elRef} style={{ width: "100%", height: "100%" }} />;
}
```

- [ ] **Step 2: Mount it in `<ProvinceView>` via dynamic import (`ssr:false`)**

In `src/components/danger/province-view.tsx`, replace the placeholder div:
```typescript
"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import type { ProvinceDanger } from "@/lib/fire-danger";
import { DangerPanel } from "./danger-panel";

const ProvinceMap = dynamic(() => import("./province-map").then((m) => m.ProvinceMap), {
  ssr: false,
  loading: () => <div style={{ flex: 1, background: "var(--surface-2)" }} />,
});

export function ProvinceView({ data, today }: { data: ProvinceDanger; today: string }) {
  const [selectedDay, setSelectedDay] = useState(0);
  return (
    <div style={{ display: "flex", height: "calc(100dvh - 64px)" }}>
      <div style={{ flex: 1 }}>
        <ProvinceMap data={data} selectedDay={selectedDay} />
      </div>
      <DangerPanel data={data} selectedDay={selectedDay} onSelectDay={setSelectedDay} today={today} />
    </div>
  );
}
```

- [ ] **Step 3: Build + commit**

Run: `npm run build && npm run lint`
Expected: green. (Leaflet is already a dependency — confirm `import L from "leaflet"` resolves the same way `argentina-map.tsx` does; match its import style if different.)
```bash
git add src/components/danger/province-map.tsx src/components/danger/province-view.tsx
git commit -m "feat: ProvinceMap — Leaflet danger areas painted by class + zone markers

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Push + preview check** — TDF map with both zone bboxes shaded (green today) + center markers; the slider repaints colors when a day's class changes.

---

## Task 6: `<DangerTrend>` — 16-day Recharts mini-trend

**Files:**
- Create: `src/components/danger/danger-trend.tsx`
- Modify: `src/components/danger/danger-panel.tsx`

- [ ] **Step 1: Create the trend chart**

`src/components/danger/danger-trend.tsx`:
```typescript
"use client";
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";
import type { DangerZone } from "@/lib/fire-danger";

export function DangerTrend({ zones }: { zones: DangerZone[] }) {
  // One series per zone: FWI over the forecast horizon.
  const dates = zones[0]?.forecast.map((f) => f.target_date) ?? [];
  const rows = dates.map((date, i) => {
    const row: Record<string, number | string> = { date: date.slice(5) };
    for (const z of zones) row[z.name] = z.forecast[i]?.fwi ?? 0;
    return row;
  });
  const colors = ["#d2541d", "#4d8f54", "#bd8512"];
  return (
    <ResponsiveContainer width="100%" height={120}>
      <LineChart data={rows} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
        <XAxis dataKey="date" tick={{ fontSize: 9 }} interval={3} />
        <YAxis tick={{ fontSize: 9 }} />
        <Tooltip />
        {zones.map((z, i) => (
          <Line key={z.id} type="monotone" dataKey={z.name} stroke={colors[i % colors.length]} dot={false} strokeWidth={1.5} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Add it to the panel**

In `src/components/danger/danger-panel.tsx`, add the import and a new block before the closing `</div>` of `.clp-panel`:
```typescript
import { DangerTrend } from "./danger-trend";
// ...inside the panel, after the zones block:
        <div className="clp-block">
          <div className="clp-label">Tendencia · 16 días</div>
          <DangerTrend zones={data.zones} />
        </div>
```

- [ ] **Step 3: Build + commit**

Run: `npm run build && npm run lint`
Expected: green. (Recharts is already a dependency — see `city-dashboard.tsx`.)
```bash
git add src/components/danger/danger-trend.tsx src/components/danger/danger-panel.tsx
git commit -m "feat: DangerTrend — 16-day FWI trend per zone in the panel

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Push + preview check** — trend lines render under the zone list.

---

## Task 7: Detection layer (active fires toggle)

**Files:**
- Modify: `src/components/danger/province-view.tsx`
- Modify: `src/components/danger/province-map.tsx`
- Modify: `src/components/danger/danger-panel.tsx`

- [ ] **Step 1: Add `showDetection` state in `<ProvinceView>` and thread it down**

In `province-view.tsx`: add `const [showDetection, setShowDetection] = useState(false);`, pass `showDetection` to `<ProvinceMap>` and `showDetection` + `onToggleDetection={() => setShowDetection(v => !v)}` to `<DangerPanel>`.

- [ ] **Step 2: Paint fires in `<ProvinceMap>` when enabled**

In `province-map.tsx`, add a `firesLayer` ref + an effect that, when `showDetection` is true, fetches `/api/fires`, filters to the province bbox, and draws `L.circleMarker` per fire (reuse the `FirePoint` shape from `@/lib/firms`); when false, clears the layer.
```typescript
// add prop: showDetection: boolean
// new ref: const firesLayer = useRef<L.LayerGroup | null>(null);
// in init effect: firesLayer.current = L.layerGroup().addTo(map);
// new effect:
useEffect(() => {
  const layer = firesLayer.current;
  if (!layer) return;
  layer.clearLayers();
  if (!showDetection) return;
  const [s, n, w, e] = provinceBbox(data.zones);
  let alive = true;
  fetch("/api/fires")
    .then((r) => r.json())
    .then((j: { fires: { latitude: number; longitude: number; frp: number }[] }) => {
      if (!alive) return;
      for (const f of j.fires) {
        if (f.latitude < s || f.latitude > n || f.longitude < w || f.longitude > e) continue;
        L.circleMarker([f.latitude, f.longitude], {
          radius: 4, color: "#d2541d", fillColor: "#d2541d", fillOpacity: 0.8, weight: 1,
        }).bindTooltip(`Foco activo · FRP ${f.frp}`).addTo(layer);
      }
    })
    .catch(() => {});
  return () => { alive = false; };
}, [showDetection, data]);
```

- [ ] **Step 3: Add the toggle to `<DangerPanel>`**

Add a footer block with a checkbox bound to `showDetection` / `onToggleDetection`, plus a one-line sources note ("Open-Meteo · FWI canadiense (SNMF)").

- [ ] **Step 4: Build + commit**

Run: `npm run build && npm run lint`
```bash
git add src/components/danger/province-view.tsx src/components/danger/province-map.tsx src/components/danger/danger-panel.tsx
git commit -m "feat: toggleable detection layer (active fires) on the province map

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 5: Push + preview check** — toggling shows/hides active fires within the TDF bbox.

---

## Task 8: SEO — JSON-LD + sitemap

**Files:**
- Modify: `src/components/jsonld.tsx`
- Modify: `src/app/[provincia]/page.tsx`
- Modify: `src/app/sitemap.ts`

- [ ] **Step 1: Add `ProvinceJsonLd`**

In `src/components/jsonld.tsx`, add (mirroring `CityJsonLd`):
```typescript
export function ProvinceJsonLd({
  provinceName, lat, lng, url,
}: { provinceName: string; lat: number; lng: number; url: string }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "Place",
    name: `Peligro de incendios en ${provinceName}`,
    url,
    geo: { "@type": "GeoCoordinates", latitude: lat, longitude: lng },
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}
```

- [ ] **Step 2: Render it in the page**

In `page.tsx`, when `data` exists, compute a province centroid (average of zone lat/lng) and render `<ProvinceJsonLd provinceName={data.provinceName} lat={...} lng={...} url={`${siteUrl}/${provincia}`} />` (use the same `siteUrl` constant the city page uses).

- [ ] **Step 3: Add province URLs to the sitemap**

In `src/app/sitemap.ts`, after the city loop, add:
```typescript
import { PREVENTION_PROVINCE_IDS } from "@/lib/fire-danger";
// ...
for (const provincia of PREVENTION_PROVINCE_IDS) {
  routes.push({
    url: `${baseUrl}/${provincia}`,
    lastModified: STATIC_LAST_MODIFIED,
    changeFrequency: "daily",
    priority: 0.8,
  });
}
```
(If the routing fallback `/provincia/[id]` shipped in Task 3, use `${baseUrl}/provincia/${provincia}` and the matching canonical in `generateMetadata`.)

- [ ] **Step 4: Build + commit**

Run: `npm run build && npm run lint`
```bash
git add src/components/jsonld.tsx src/app/[provincia]/page.tsx src/app/sitemap.ts
git commit -m "feat: SEO for province danger page (JSON-LD Place + sitemap)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Responsive + final preview verification

**Files:**
- Modify: `src/components/danger/province-view.tsx`

- [ ] **Step 1: Mobile drawer for the panel**

Make the panel a slide-in drawer below 768px (mirror the `/mapa` redesign pattern): a "Capas / Zonas" button + backdrop, panel off-canvas by default on mobile. Keep desktop unchanged.

- [ ] **Step 2: Build + lint + full test suite**

Run: `npm run build && npm run lint && npm run test`
Expected: all green (the Vitest suite includes `fire-danger.test.ts` from Task 1).

- [ ] **Step 3: Commit**

```bash
git add src/components/danger/province-view.tsx
git commit -m "feat: responsive drawer for the province danger panel on mobile

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

- [ ] **Step 4: Final preview walkthrough (controller, via Vercel MCP)**

On the preview, load `/tierra-del-fuego` and confirm: map with both zones shaded + markers; panel with overall Pill, slider (changing the day repaints map + panel), zone drivers, trend chart; detection toggle shows/hides fires; mobile drawer works (resize). Capture the preview URL for the user.

---

## Self-Review

**1. Spec coverage** (`2026-06-18-fwi-provincia-page-design.md`):
- §4.1 route `/[provincia]`, own layout no footer, SSG, ISR → Tasks 3 (+ fallback). ✅
- §4.2 data flow (server loads, client slider) → Tasks 2, 4, 5. ✅
- §5 map: prevention areas by class + marker; detection layer → Tasks 5, 7. ✅
- §6 panel: header, overall Pill, slider, zone list+drivers, trend, toggle, sources → Tasks 4, 6, 7. ✅
- §7 SEO: metadata, JSON-LD, sitemap → Tasks 3 (metadata), 8. ✅ (OG image: reuses the existing default OG — a province-specific OG image is a nice-to-have, not in the MVP task list; **noted gap**, acceptable per "MVP visual first".)
- §8 reuse vs new → matches the file structure. ✅
- §9 colors → Task 1. ✅
- §10 risks (empty map, bbox provisional, routing collision, large argentina-map, missing data) → bbox+marker (T5), routing build-check+fallback (T3), **derived `<ProvinceMap>` instead of extending argentina-map** (done — new component), null→empty state (T2/T3). ✅
- Responsive drawer (§6) → Task 9. ✅

**2. Placeholder scan:** No "TBD/handle edge cases". Each code step shows real code; build/preview checks replace unit tests only where the surface is Leaflet/React (stated explicitly). Tasks 7 §2/§3 and 8 §2 describe edits in prose with the key code shown — acceptable since they modify existing files at named anchors; the executor has the surrounding code.

**3. Type consistency:** `ProvinceDanger`/`DangerZone`/`ZoneForecastDay` defined in Task 1 are used identically in Tasks 2, 4, 5, 6, 7. `dangerColor`/`dangerPillTone`/`worstClass`/`provinceBbox`/`forecastDateLabel` signatures match across tasks. `selectedDay: number` index threaded consistently `ProvinceView → DangerPanel/ProvinceMap`. `bbox` is `[south, north, west, east]` everywhere (Task 1 type, Task 2 loader, Task 5 `L.rectangle([[s,w],[n,e]])`). ✅

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-18-fwi-provincia-page.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, two-stage review between tasks. Good here because each task ends in a buildable, preview-verifiable increment.
2. **Inline Execution** — execute in this session with checkpoints.

Which approach? (Note: each task pushes to the `feat/fwi-provincia-page` branch for preview verification — the preview is behind Vercel SSO, so the controller drives the preview checks via the Vercel MCP, as in Milestone 1.)
