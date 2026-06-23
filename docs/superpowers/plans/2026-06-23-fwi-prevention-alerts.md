# FWI Prevention Alerts via Telegram — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a TDF danger zone is forecast to cross to *alto* or higher in the next 3 days, the Clara bot alerts opted-in subscribers (episode dedup + escalation); subscribers in `daily` mode get a morning briefing. A unified `/preferencias` menu controls the optional layers (lightning + prevention).

**Architecture:** A new daily cron route `/api/prevention-alerts` reads the latest forecast from `fire_danger`, derives each subscriber's zone from their lat/lng, evaluates a pure trigger function, and notifies via the existing `sendMessage`. Pure helpers (zone match, trigger, message formatting, keyboard) are unit-tested in isolation; the route wires them together. Bot changes add a `/preferencias` inline-keyboard menu and a prevention opt-in in onboarding.

**Tech Stack:** Next.js 16 route handlers (TS), Supabase (Postgres via `getSupabase()` service client), Telegram Bot API (`src/lib/telegram.ts`), vitest, pg_cron + pg_net.

**Spec:** `docs/superpowers/specs/2026-06-23-fwi-prevention-alerts-design.md`

---

## File Structure

**Create:**
- `src/lib/danger-zone-match.ts` — pure `findDangerZone(lat, lng, zones)` (bbox + 5km buffer).
- `src/lib/prevention-trigger.ts` — pure `evaluatePreventionTrigger(forecast, today, alertedClass)`.
- `src/lib/prevention-messages.ts` — pure `formatPreventionAlert(...)` + `formatDailyBriefing(...)`.
- `src/lib/preferences-keyboard.ts` — pure `buildPreferencesKeyboard(state)` + `parsePreferencesCallback(data)`.
- `src/app/api/prevention-alerts/route.ts` — the daily cron route (orchestration).
- `scripts/sql/whi-fwi-prevention-alerts.sql` — schema migration + cron job (versioned copy).
- Tests under `src/__tests__/`: `danger-zone-match.test.ts`, `prevention-trigger.test.ts`, `prevention-messages.test.ts`, `preferences-keyboard.test.ts`, `prevention-alerts-route.test.ts`.

**Modify:**
- `src/app/api/bot/telegram/route.ts` — route `/preferencias` + `/prevencion`; split `callback_query` between feedback and prefs; offer prevention in onboarding; reset on zone change.
- `src/app/api/bot/sync-commands/route.ts` — add `preferencias` + `prevencion` commands.

**Reused as-is:** `getSupabase()` (`src/lib/supabase.ts`), `sendMessage`/`answerCallbackQuery`/`setMyCommands` (`src/lib/telegram.ts`), `isCronAuthorized` (`src/lib/cron-auth.ts`), `haversineKm` (`src/lib/geo.ts`), `DANGER_CLASSES`/`DANGER_COPY`/`DangerClass` (`src/lib/fire-danger.ts`).

---

## Task 1: Database migration (schema)

**Files:**
- Create: `scripts/sql/whi-fwi-prevention-alerts.sql`
- Apply: via Supabase MCP `apply_migration` (name `fwi_prevention_alerts`)

> Additive only (one new column with a default + two new tables). No destructive change. Per the production-safety rule, show this SQL and get an explicit OK before applying.

- [ ] **Step 1: Write the migration SQL**

```sql
-- whi-fwi-prevention-alerts.sql — opt-in column + dedup tables for prevention alerts

-- 1. Opt-in mode on subscribers
ALTER TABLE public.subscribers
  ADD COLUMN IF NOT EXISTS prevention_mode TEXT NOT NULL DEFAULT 'off'
    CHECK (prevention_mode IN ('off','alerts','daily'));

-- 2. Episode dedup for crossing alerts
CREATE TABLE IF NOT EXISTS public.prevention_alerted (
  zone_id       TEXT NOT NULL,
  chat_id       BIGINT NOT NULL,
  alerted_class TEXT NOT NULL,
  alerted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (zone_id, chat_id)
);
ALTER TABLE public.prevention_alerted ENABLE ROW LEVEL SECURITY;

-- 3. Daily-briefing idempotency
CREATE TABLE IF NOT EXISTS public.prevention_briefing_sent (
  chat_id   BIGINT NOT NULL,
  sent_date DATE NOT NULL,
  sent_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (chat_id, sent_date)
);
ALTER TABLE public.prevention_briefing_sent ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Apply the migration**

Use Supabase MCP `apply_migration` with name `fwi_prevention_alerts` and the SQL above (after explicit OK). RLS enabled with no policies = anon/auth blocked, service_role bypasses — consistent with every other table.

- [ ] **Step 3: Verify**

Run via MCP `execute_sql`:
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'subscribers' AND column_name = 'prevention_mode';
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('prevention_alerted','prevention_briefing_sent');
```
Expected: the column exists with default `'off'`; both tables listed.

- [ ] **Step 4: Commit**

```bash
git add scripts/sql/whi-fwi-prevention-alerts.sql
git commit -m "feat: schema for FWI prevention alerts (prevention_mode + dedup tables)"
```

---

## Task 2: `findDangerZone` (pure zone matching)

**Files:**
- Create: `src/lib/danger-zone-match.ts`
- Test: `src/__tests__/danger-zone-match.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { findDangerZone, type DangerZoneBox } from "@/lib/danger-zone-match";

// bbox = [south, north, west, east]
const ZONES: DangerZoneBox[] = [
  { id: "tdf-norte-estepa", name: "Estepa Fueguina Norte", bbox: [-54.0, -53.0, -68.5, -67.0] },
  { id: "tdf-sur-bosque", name: "Bosque Fueguino Sur", bbox: [-55.0, -54.0, -69.0, -67.5] },
];

describe("findDangerZone", () => {
  it("matches a point inside a zone bbox", () => {
    expect(findDangerZone(-53.5, -67.7, ZONES)?.id).toBe("tdf-norte-estepa");
  });
  it("picks the correct zone for the south point", () => {
    expect(findDangerZone(-54.8, -68.3, ZONES)?.id).toBe("tdf-sur-bosque");
  });
  it("matches within 5km buffer of a bbox edge", () => {
    // just north of the norte bbox (north edge -53.0), ~3km
    expect(findDangerZone(-52.975, -67.7, ZONES)?.id).toBe("tdf-norte-estepa");
  });
  it("returns null when far from every zone", () => {
    expect(findDangerZone(-34.6, -58.4, ZONES)).toBeNull(); // Buenos Aires
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/danger-zone-match.test.ts`
Expected: FAIL — cannot find module `@/lib/danger-zone-match`.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { haversineKm } from "@/lib/geo";

export interface DangerZoneBox {
  id: string;
  name: string;
  bbox: [number, number, number, number]; // [south, north, west, east]
}

const ZONE_BUFFER_KM = 5;

function distanceKmToBbox(
  lat: number,
  lng: number,
  [south, north, west, east]: [number, number, number, number]
): number {
  const clampedLat = Math.max(south, Math.min(north, lat));
  const clampedLng = Math.max(west, Math.min(east, lng));
  return haversineKm(lat, lng, clampedLat, clampedLng);
}

export function findDangerZone(
  lat: number,
  lng: number,
  zones: DangerZoneBox[]
): DangerZoneBox | null {
  // fast path: strictly inside a bbox
  for (const z of zones) {
    const [south, north, west, east] = z.bbox;
    if (lat >= south && lat <= north && lng >= west && lng <= east) return z;
  }
  // buffer path: within ZONE_BUFFER_KM of the nearest bbox edge
  let best: DangerZoneBox | null = null;
  let bestDist = Infinity;
  for (const z of zones) {
    const d = distanceKmToBbox(lat, lng, z.bbox);
    if (d <= ZONE_BUFFER_KM && d < bestDist) {
      best = z;
      bestDist = d;
    }
  }
  return best;
}
```

> Note: confirm `haversineKm` signature in `src/lib/geo.ts` is `(lat1, lng1, lat2, lng2) => number` (it is the one `goes-alerts` imports). If argument order differs, adjust the call.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/danger-zone-match.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/danger-zone-match.ts src/__tests__/danger-zone-match.test.ts
git commit -m "feat: pure findDangerZone (bbox + 5km buffer)"
```

---

## Task 3: `evaluatePreventionTrigger` (pure trigger logic)

**Files:**
- Create: `src/lib/prevention-trigger.ts`
- Test: `src/__tests__/prevention-trigger.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { evaluatePreventionTrigger, type ForecastDay } from "@/lib/prevention-trigger";

const days = (...classes: string[]): ForecastDay[] =>
  classes.map((c, i) => ({
    target_date: `2026-06-${String(24 + i).padStart(2, "0")}`,
    danger_class: c as ForecastDay["danger_class"],
  }));
const TODAY = "2026-06-24";

describe("evaluatePreventionTrigger", () => {
  it("no alert when window stays below alto and no prior episode", () => {
    expect(evaluatePreventionTrigger(days("bajo", "moderado", "bajo"), TODAY, null))
      .toEqual({ action: "none" });
  });
  it("alerts on initial crossing to alto", () => {
    expect(evaluatePreventionTrigger(days("moderado", "alto", "bajo"), TODAY, null))
      .toEqual({ action: "alert", peak: "alto", peakDate: "2026-06-25" });
  });
  it("escalates when peak rises above the alerted class", () => {
    expect(evaluatePreventionTrigger(days("extremo", "alto"), TODAY, "alto"))
      .toEqual({ action: "escalate", peak: "extremo", peakDate: "2026-06-24", from: "alto" });
  });
  it("no re-alert when already alerted at the same peak", () => {
    expect(evaluatePreventionTrigger(days("alto", "moderado"), TODAY, "alto"))
      .toEqual({ action: "none" });
  });
  it("clears the episode when window drops below alto", () => {
    expect(evaluatePreventionTrigger(days("moderado", "bajo"), TODAY, "alto"))
      .toEqual({ action: "clear" });
  });
  it("only looks at the next 3 days", () => {
    // day 4 is extremo but outside the window → no alert
    expect(evaluatePreventionTrigger(days("bajo", "bajo", "bajo", "extremo"), TODAY, null))
      .toEqual({ action: "none" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/prevention-trigger.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { DANGER_CLASSES, type DangerClass } from "@/lib/fire-danger";

export interface ForecastDay {
  target_date: string; // YYYY-MM-DD
  danger_class: DangerClass;
}

export type TriggerAction =
  | { action: "none" }
  | { action: "clear" }
  | { action: "alert"; peak: DangerClass; peakDate: string }
  | { action: "escalate"; peak: DangerClass; peakDate: string; from: DangerClass };

const ALTO_INDEX = DANGER_CLASSES.indexOf("alto"); // 2
const WINDOW_DAYS = 3;

export function evaluatePreventionTrigger(
  forecast: ForecastDay[],
  today: string,
  alertedClass: DangerClass | null
): TriggerAction {
  const window = forecast
    .filter((d) => d.target_date >= today)
    .sort((a, b) => a.target_date.localeCompare(b.target_date))
    .slice(0, WINDOW_DAYS);

  if (window.length === 0) return { action: "none" };

  let peakIdx = 0;
  let peak: DangerClass = "bajo";
  let peakDate = window[0].target_date;
  for (const d of window) {
    const i = DANGER_CLASSES.indexOf(d.danger_class);
    if (i > peakIdx) {
      peakIdx = i;
      peak = d.danger_class;
      peakDate = d.target_date;
    }
  }

  if (peakIdx < ALTO_INDEX) {
    return alertedClass ? { action: "clear" } : { action: "none" };
  }
  if (alertedClass === null) {
    return { action: "alert", peak, peakDate };
  }
  const prevIdx = DANGER_CLASSES.indexOf(alertedClass);
  if (peakIdx > prevIdx) {
    return { action: "escalate", peak, peakDate, from: alertedClass };
  }
  return { action: "none" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/prevention-trigger.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/prevention-trigger.ts src/__tests__/prevention-trigger.test.ts
git commit -m "feat: pure prevention trigger (3-day window, episode + escalation)"
```

---

## Task 4: Message formatting (pure)

**Files:**
- Create: `src/lib/prevention-messages.ts`
- Test: `src/__tests__/prevention-messages.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { formatPreventionAlert, formatDailyBriefing } from "@/lib/prevention-messages";
import type { ForecastDay } from "@/lib/prevention-trigger";

const fc = (...c: string[]): ForecastDay[] =>
  c.map((x, i) => ({ target_date: `2026-06-${String(24 + i).padStart(2, "0")}`, danger_class: x as ForecastDay["danger_class"] }));

describe("formatPreventionAlert", () => {
  it("includes zone, level, date and citizen copy on initial alert", () => {
    const msg = formatPreventionAlert("Estepa Fueguina Norte", "extremo", "2026-06-25", null);
    expect(msg).toContain("Estepa Fueguina Norte");
    expect(msg).toContain("EXTREMO");
    expect(msg).toContain("miércoles 25/06");
    expect(msg).toContain("Prohibido todo fuego al aire libre"); // DANGER_COPY.extremo.action
    expect(msg).toContain("/preferencias");
  });
  it("phrases an escalation with the previous level", () => {
    const msg = formatPreventionAlert("Bosque Fueguino Sur", "extremo", "2026-06-24", "alto");
    expect(msg).toContain("SUBE");
    expect(msg).toContain("alto");
    expect(msg).toContain("EXTREMO");
  });
});

describe("formatDailyBriefing", () => {
  it("shows today's level and an outlook when it rises", () => {
    const msg = formatDailyBriefing("Bosque Fueguino Sur", "2026-06-24", fc("moderado", "alto"));
    expect(msg).toContain("Bosque Fueguino Sur");
    expect(msg).toContain("MODERADO");
    expect(msg).toContain("alto"); // outlook mentions the rise
    expect(msg).toContain("/preferencias");
  });
  it("uses a short form on a calm day", () => {
    const msg = formatDailyBriefing("Estepa Fueguina Norte", "2026-06-24", fc("bajo", "bajo"));
    expect(msg).toContain("sin novedades");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/prevention-messages.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```typescript
import { DANGER_CLASSES, DANGER_COPY, type DangerClass } from "@/lib/fire-danger";
import type { ForecastDay } from "@/lib/prevention-trigger";

const EMOJI: Record<DangerClass, string> = {
  bajo: "🟢",
  moderado: "🟡",
  alto: "🟠",
  "muy alto": "🔴",
  extremo: "🔴",
};

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function spanishDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12)); // noon UTC avoids tz drift
  return `${WEEKDAYS[dt.getUTCDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

const FOOTER = "\n\nAjustá tus avisos: /preferencias";

export function formatPreventionAlert(
  zoneName: string,
  peak: DangerClass,
  peakDate: string,
  fromClass: DangerClass | null
): string {
  const copy = DANGER_COPY[peak];
  const head =
    fromClass !== null
      ? `🔥 <b>Aviso de prevención — ${zoneName}</b>\n\nEl peligro de incendio <b>SUBE de ${fromClass} a ${peak.toUpperCase()}</b> ${EMOJI[peak]} el ${spanishDate(peakDate)}.`
      : `🔥 <b>Aviso de prevención — ${zoneName}</b>\n\nEl peligro de incendio sube a <b>${peak.toUpperCase()}</b> ${EMOJI[peak]} el ${spanishDate(peakDate)}.`;
  return (
    `${head}\n\n${copy.summary}\n${copy.action}\n\n` +
    `Es un pronóstico — todavía no hay foco. Te aviso para prevenir.` +
    FOOTER
  );
}

export function formatDailyBriefing(
  zoneName: string,
  today: string,
  forecast: ForecastDay[]
): string {
  const sorted = [...forecast].sort((a, b) => a.target_date.localeCompare(b.target_date));
  const todayDay = sorted.find((d) => d.target_date === today) ?? sorted[0];
  const todayClass = todayDay.danger_class;
  const copy = DANGER_COPY[todayClass];
  const todayIdx = DANGER_CLASSES.indexOf(todayClass);

  // outlook: first upcoming day whose class is higher than today
  const rise = sorted.find(
    (d) => d.target_date > today && DANGER_CLASSES.indexOf(d.danger_class) > todayIdx
  );

  const header = `🌲 <b>Resumen — ${zoneName} · ${spanishDate(today).split(" ")[1]}</b>`;

  if (todayIdx < DANGER_CLASSES.indexOf("alto") && !rise) {
    return `${header}\n\nHoy: ${todayClass.toUpperCase()} ${EMOJI[todayClass]} — sin novedades. Outlook estable.${FOOTER}`;
  }

  const outlook = rise
    ? `\nPróximos días: sube a ${rise.danger_class} el ${spanishDate(rise.target_date)}.`
    : "";
  return `${header}\n\nHoy: ${todayClass.toUpperCase()} ${EMOJI[todayClass]} — ${copy.summary}${outlook}${FOOTER}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/prevention-messages.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/prevention-messages.ts src/__tests__/prevention-messages.test.ts
git commit -m "feat: pure prevention alert + daily briefing message formatting"
```

---

## Task 5: Preferences keyboard (pure)

**Files:**
- Create: `src/lib/preferences-keyboard.ts`
- Test: `src/__tests__/preferences-keyboard.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { buildPreferencesKeyboard, parsePreferencesCallback } from "@/lib/preferences-keyboard";

describe("buildPreferencesKeyboard", () => {
  it("includes a lightning toggle row", () => {
    const kb = buildPreferencesKeyboard({ lightning: true, prevention: "off", covered: false });
    const flat = kb.inline_keyboard.flat();
    expect(flat.some((b) => b.callback_data === "prefs|lightning")).toBe(true);
  });
  it("omits prevention rows when the sub is not in a covered zone", () => {
    const kb = buildPreferencesKeyboard({ lightning: true, prevention: "off", covered: false });
    const flat = kb.inline_keyboard.flat();
    expect(flat.some((b) => b.callback_data.startsWith("prefs|prev:"))).toBe(false);
  });
  it("shows the three prevention options when covered", () => {
    const kb = buildPreferencesKeyboard({ lightning: false, prevention: "alerts", covered: true });
    const data = kb.inline_keyboard.flat().map((b) => b.callback_data);
    expect(data).toContain("prefs|prev:daily");
    expect(data).toContain("prefs|prev:alerts");
    expect(data).toContain("prefs|prev:off");
  });
});

describe("parsePreferencesCallback", () => {
  it("parses a lightning toggle", () => {
    expect(parsePreferencesCallback("prefs|lightning")).toEqual({ kind: "lightning" });
  });
  it("parses a prevention mode set", () => {
    expect(parsePreferencesCallback("prefs|prev:daily")).toEqual({ kind: "prevention", mode: "daily" });
  });
  it("returns null for non-prefs or malformed data", () => {
    expect(parsePreferencesCallback("fb|f:1|s")).toBeNull();
    expect(parsePreferencesCallback(undefined)).toBeNull();
    expect(parsePreferencesCallback("prefs|prev:bogus")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/preferences-keyboard.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```typescript
export type PreventionMode = "off" | "alerts" | "daily";

export interface PreferencesState {
  lightning: boolean;
  prevention: PreventionMode;
  covered: boolean; // sub's location falls in a covered FWI zone
}

export type InlineKeyboard = {
  inline_keyboard: { text: string; callback_data: string }[][];
};

export type PreferencesAction =
  | { kind: "lightning" }
  | { kind: "prevention"; mode: PreventionMode };

const PREVENTION_MODES: PreventionMode[] = ["off", "alerts", "daily"];

export function buildPreferencesKeyboard(state: PreferencesState): InlineKeyboard {
  const rows: { text: string; callback_data: string }[][] = [];

  rows.push([
    {
      text: `⚡ Rayos: ${state.lightning ? "✅ Activado" : "❌ Desactivado"}`,
      callback_data: "prefs|lightning",
    },
  ]);

  if (state.covered) {
    rows.push([
      { text: `${state.prevention === "daily" ? "🔘 " : ""}Resumen diario`, callback_data: "prefs|prev:daily" },
      { text: `${state.prevention === "alerts" ? "🔘 " : ""}Solo si hay peligro`, callback_data: "prefs|prev:alerts" },
    ]);
    rows.push([
      { text: `${state.prevention === "off" ? "🔘 " : ""}🌲 Prevención: No, gracias`, callback_data: "prefs|prev:off" },
    ]);
  }

  return { inline_keyboard: rows };
}

export function parsePreferencesCallback(data: string | null | undefined): PreferencesAction | null {
  if (!data || !data.startsWith("prefs|")) return null;
  const rest = data.slice("prefs|".length);
  if (rest === "lightning") return { kind: "lightning" };
  if (rest.startsWith("prev:")) {
    const mode = rest.slice("prev:".length) as PreventionMode;
    if (PREVENTION_MODES.includes(mode)) return { kind: "prevention", mode };
  }
  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/preferences-keyboard.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/preferences-keyboard.ts src/__tests__/preferences-keyboard.test.ts
git commit -m "feat: pure preferences keyboard builder + callback parser"
```

---

## Task 6: The `/api/prevention-alerts` route

**Files:**
- Create: `src/app/api/prevention-alerts/route.ts`
- Test: `src/__tests__/prevention-alerts-route.test.ts`

This route wires the pure helpers to Supabase + Telegram. The test mocks both with `vi.mock`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMessage = vi.fn();
vi.mock("@/lib/telegram", () => ({ sendMessage: (...a: unknown[]) => sendMessage(...a) }));

// minimal chainable supabase stub
const state = {
  zones: [] as any[],
  forecast: [] as any[],
  subs: [] as any[],
  alerted: new Map<string, string>(), // `${zone}:${chat}` -> alerted_class
  briefings: new Set<string>(), // `${chat}:${date}`
};
function makeDb() {
  return {
    from(table: string) {
      return buildQuery(table);
    },
  };
}
function buildQuery(table: string): any {
  const q: any = {
    _table: table,
    _filters: {} as Record<string, unknown>,
    select() { return q; },
    eq(col: string, val: unknown) { q._filters[col] = val; return q; },
    in() { return q; },
    order() { return q; },
    limit() { return q; },
    gte() { return q; },
    async single() {
      if (table === "fire_danger") return { data: { computed_at: "2026-06-23" } };
      if (table === "prevention_alerted") {
        const key = `${q._filters.zone_id}:${q._filters.chat_id}`;
        const cls = state.alerted.get(key);
        return { data: cls ? { alerted_class: cls } : null };
      }
      return { data: null };
    },
    insert(row: any) {
      if (table === "prevention_briefing_sent") {
        const key = `${row.chat_id}:${row.sent_date}`;
        if (state.briefings.has(key)) {
          return { select: () => ({ single: async () => ({ data: null, error: { code: "23505" } }) }) };
        }
        state.briefings.add(key);
        return { select: () => ({ single: async () => ({ data: { chat_id: row.chat_id }, error: null }) }) };
      }
      return { select: () => ({ single: async () => ({ data: {}, error: null }) }) };
    },
    upsert(row: any) { state.alerted.set(`${row.zone_id}:${row.chat_id}`, row.alerted_class); return Promise.resolve({ error: null }); },
    delete() { return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) }; },
    then(resolve: (v: any) => void) {
      if (table === "danger_zones") return resolve({ data: state.zones });
      if (table === "fire_danger") return resolve({ data: state.forecast });
      if (table === "subscribers") return resolve({ data: state.subs });
      return resolve({ data: [] });
    },
  };
  return q;
}
vi.mock("@/lib/supabase", () => ({ getSupabase: () => makeDb() }));
vi.mock("@/lib/cron-auth", () => ({ isCronAuthorized: () => true }));

import { GET } from "@/app/api/prevention-alerts/route";

function req() { return new Request("https://x/api/prevention-alerts?secret=ok"); }

beforeEach(() => {
  sendMessage.mockClear();
  state.zones = [{ id: "tdf-norte-estepa", name: "Estepa Norte", bbox: [-54, -53, -68.5, -67], province: "tierra-del-fuego" }];
  state.alerted.clear();
  state.briefings.clear();
});

describe("GET /api/prevention-alerts", () => {
  it("sends an alert when a covered sub's zone crosses to alto", async () => {
    state.subs = [{ chat_id: 1, lat: -53.5, lng: -67.7, prevention_mode: "alerts" }];
    state.forecast = [{ zone_id: "tdf-norte-estepa", target_date: futureDay(0), danger_class: "alto" }];
    const res = await GET(req());
    const body = await res.json();
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(body.alerts).toBe(1);
  });

  it("never messages a sub in off mode", async () => {
    state.subs = [{ chat_id: 2, lat: -53.5, lng: -67.7, prevention_mode: "off" }];
    state.forecast = [{ zone_id: "tdf-norte-estepa", target_date: futureDay(0), danger_class: "extremo" }];
    await GET(req());
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

function futureDay(offset: number): string {
  const d = new Date(Date.now() - 3 * 3600_000 + offset * 86400_000);
  return d.toISOString().slice(0, 10);
}
```

> The stub is intentionally loose: it proves the wiring (auth → load → match → trigger → dedup → send), not Supabase's exact API. If the chain shape drifts during implementation, adjust the stub to match the real calls — keep the two assertions.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/prevention-alerts-route.test.ts`
Expected: FAIL — cannot find module `@/app/api/prevention-alerts/route`.

- [ ] **Step 3: Write the route**

```typescript
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { isCronAuthorized } from "@/lib/cron-auth";
import { sendMessage } from "@/lib/telegram";
import { findDangerZone, type DangerZoneBox } from "@/lib/danger-zone-match";
import { evaluatePreventionTrigger, type ForecastDay } from "@/lib/prevention-trigger";
import { formatPreventionAlert, formatDailyBriefing } from "@/lib/prevention-messages";
import { PREVENTION_PROVINCE_IDS, type DangerClass } from "@/lib/fire-danger";

export const dynamic = "force-dynamic";

function artToday(): string {
  // Argentina is UTC-3, no DST. Shift now by -3h and take the date.
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getSupabase();
  const today = artToday();

  // 1. covered zones (M1: all danger_zones in prevention provinces)
  const { data: zoneData } = await db
    .from("danger_zones")
    .select("id,name,bbox,province")
    .in("province", PREVENTION_PROVINCE_IDS);
  const zones = (zoneData ?? []) as (DangerZoneBox & { province: string })[];
  if (zones.length === 0) return NextResponse.json({ alerts: 0, briefings: 0, reason: "no_zones" });
  const zoneIds = zones.map((z) => z.id);

  // 2. latest forecast per zone
  const { data: latest } = await db
    .from("fire_danger")
    .select("computed_at")
    .in("zone_id", zoneIds)
    .order("computed_at", { ascending: false })
    .limit(1)
    .single();
  const computedAt = (latest as { computed_at: string } | null)?.computed_at;
  if (!computedAt) return NextResponse.json({ alerts: 0, briefings: 0, reason: "no_forecast" });

  const { data: rows } = await db
    .from("fire_danger")
    .select("zone_id,target_date,danger_class")
    .in("zone_id", zoneIds)
    .eq("computed_at", computedAt)
    .order("target_date", { ascending: true });
  const byZone = new Map<string, ForecastDay[]>();
  for (const r of (rows ?? []) as { zone_id: string; target_date: string; danger_class: DangerClass }[]) {
    if (!byZone.has(r.zone_id)) byZone.set(r.zone_id, []);
    byZone.get(r.zone_id)!.push({ target_date: r.target_date, danger_class: r.danger_class });
  }

  // 3. opted-in subs
  const { data: subData } = await db
    .from("subscribers")
    .select("chat_id, lat, lng, prevention_mode")
    .in("prevention_mode", ["alerts", "daily"]);
  const subs = (subData ?? []) as { chat_id: number; lat: number; lng: number; prevention_mode: "alerts" | "daily" }[];

  let alerts = 0;
  let briefings = 0;

  for (const sub of subs) {
    const zone = findDangerZone(sub.lat, sub.lng, zones);
    if (!zone) continue;
    const forecast = byZone.get(zone.id);
    if (!forecast || forecast.length === 0) continue;

    if (sub.prevention_mode === "alerts") {
      const { data: prevRow } = await db
        .from("prevention_alerted")
        .select("alerted_class")
        .eq("zone_id", zone.id)
        .eq("chat_id", sub.chat_id)
        .single();
      const alertedClass = (prevRow as { alerted_class: DangerClass } | null)?.alerted_class ?? null;

      const decision = evaluatePreventionTrigger(forecast, today, alertedClass);

      if (decision.action === "clear") {
        await db.from("prevention_alerted").delete().eq("zone_id", zone.id).eq("chat_id", sub.chat_id);
        continue;
      }
      if (decision.action === "none") continue;

      const message = formatPreventionAlert(
        zone.name,
        decision.peak,
        decision.peakDate,
        decision.action === "escalate" ? decision.from : null
      );
      await sendMessage(sub.chat_id, message);
      // mark AFTER a successful send (prioritise not-losing a hazard alert)
      await db.from("prevention_alerted").upsert({
        zone_id: zone.id,
        chat_id: sub.chat_id,
        alerted_class: decision.peak,
        alerted_at: new Date().toISOString(),
      });
      alerts++;
    } else {
      // daily: idempotency claim BEFORE sending (prioritise not-duplicating)
      const { error: claimErr } = await db
        .from("prevention_briefing_sent")
        .insert({ chat_id: sub.chat_id, sent_date: today })
        .select("chat_id")
        .single();
      if (claimErr) continue; // 23505 = already sent today
      const message = formatDailyBriefing(zone.name, today, forecast);
      await sendMessage(sub.chat_id, message);
      briefings++;
    }
  }

  return NextResponse.json({ subscribers: subs.length, alerts, briefings, computedAt });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/prevention-alerts-route.test.ts`
Expected: PASS (2 tests). Adjust the stub if the real chain differs; keep both assertions green.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/prevention-alerts/route.ts src/__tests__/prevention-alerts-route.test.ts
git commit -m "feat: /api/prevention-alerts daily route (crossing alerts + briefing)"
```

---

## Task 7: Bot — `/preferencias` command + prefs callback routing

**Files:**
- Modify: `src/app/api/bot/telegram/route.ts`

The webhook already handles `callback_query` by routing to `handleVote`. We add a prefs branch and a `/preferencias` command. The pure pieces are already tested (Task 5); this task is wiring + manual verification.

- [ ] **Step 1: Add imports (top of file)**

```typescript
import { buildPreferencesKeyboard, parsePreferencesCallback } from "@/lib/preferences-keyboard";
import { findDangerZone } from "@/lib/danger-zone-match";
```

- [ ] **Step 2: Split callback routing**

Replace the existing block:
```typescript
if (update.callback_query) {
  await handleVote(update.callback_query);
  return NextResponse.json({ ok: true });
}
```
with:
```typescript
if (update.callback_query) {
  const cb = update.callback_query;
  if (parsePreferencesCallback(cb.data)) {
    await handlePreferencesCallback(cb);
  } else {
    await handleVote(cb);
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 3: Route the `/preferencias` and `/prevencion` commands**

In the `message` command dispatch (next to the `/rayos` branch), add:
```typescript
else if (text === "/preferencias" || text === "/prevencion") {
  await handlePreferencesCommand(chatId);
}
```

- [ ] **Step 4: Add the helpers (near `handleRayosToggle`)**

```typescript
// Loads the sub, derives coverage, and shows the unified preferences menu.
async function handlePreferencesCommand(chatId: number) {
  const db = getSupabase();
  const { data: sub } = await db
    .from("subscribers")
    .select("lat, lng, lightning_enabled, prevention_mode")
    .eq("chat_id", chatId)
    .limit(1)
    .single();

  if (!sub) {
    await sendMessage(chatId, "⚙️ Primero suscribite con /ciudad o compartiendo tu ubicación." + FOOTER);
    return;
  }

  const { data: zoneData } = await db
    .from("danger_zones")
    .select("id,name,bbox")
    .in("province", PREVENTION_PROVINCE_IDS);
  const covered = findDangerZone(sub.lat, sub.lng, (zoneData ?? []) as never) !== null;

  const keyboard = buildPreferencesKeyboard({
    lightning: sub.lightning_enabled !== false,
    prevention: (sub.prevention_mode ?? "off") as "off" | "alerts" | "daily",
    covered,
  });

  const body =
    "⚙️ <b>Tus avisos</b>\n\n" +
    "🔥 Focos cercanos — <b>siempre activos</b> (es el corazón del servicio)\n" +
    (covered ? "🌲 Elegí si querés avisos de prevención de incendio." : "");

  await sendMessage(chatId, body, { reply_markup: keyboard });
}

// Applies a preferences button press and re-renders the menu.
async function handlePreferencesCallback(cb: {
  id: string;
  from: { id: number };
  message?: { message_id: number; chat: { id: number } };
  data?: string;
}) {
  const action = parsePreferencesCallback(cb.data);
  if (!action) {
    await answerCallbackQuery(cb.id);
    return;
  }
  const chatId = cb.from.id;
  const db = getSupabase();

  if (action.kind === "lightning") {
    const { data: sub } = await db.from("subscribers").select("lightning_enabled").eq("chat_id", chatId).limit(1).single();
    const next = sub?.lightning_enabled === false;
    await db.from("subscribers").update({ lightning_enabled: next }).eq("chat_id", chatId);
    await answerCallbackQuery(cb.id, next ? "Rayos activados" : "Rayos desactivados");
  } else {
    await db.from("subscribers").update({ prevention_mode: action.mode }).eq("chat_id", chatId);
    // starting fresh: drop any stale episode so a new crossing re-alerts cleanly
    await db.from("prevention_alerted").delete().eq("chat_id", chatId);
    const label = action.mode === "daily" ? "Resumen diario" : action.mode === "alerts" ? "Solo si hay peligro" : "Prevención desactivada";
    await answerCallbackQuery(cb.id, label);
  }

  // re-render the menu in place
  await handlePreferencesCommand(chatId);
}
```

> `FOOTER`, `getSupabase`, `sendMessage`, `answerCallbackQuery`, and `PREVENTION_PROVINCE_IDS` must be imported/available in this file. `PREVENTION_PROVINCE_IDS` comes from `@/lib/fire-danger`; add the import if missing.

- [ ] **Step 5: Verify build + existing tests**

Run: `npx vitest run && npx tsc --noEmit`
Expected: all tests pass, no type errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/bot/telegram/route.ts
git commit -m "feat: /preferencias unified menu + prevention opt-in callbacks"
```

---

## Task 8: Onboarding offer + reset on zone change

**Files:**
- Modify: `src/app/api/bot/telegram/route.ts`

- [ ] **Step 1: Offer prevention after location is set**

In `handleLocation`, after the existing confirmation `sendMessage`, add:
```typescript
  // Offer prevention only if the new location falls in a covered zone.
  const db = getSupabase();
  const { data: zoneData } = await db
    .from("danger_zones")
    .select("id,name,bbox")
    .in("province", PREVENTION_PROVINCE_IDS);
  const zone = findDangerZone(lat, lng, (zoneData ?? []) as never);
  if (zone) {
    await sendMessage(
      chatId,
      `🌲 Tu zona (${zone.name}) tiene pronóstico de peligro de incendio. ¿Querés que te avise?`,
      {
        reply_markup: buildPreferencesKeyboard({
          lightning: true,
          prevention: "off",
          covered: true,
        }),
      }
    );
  }
```

- [ ] **Step 2: Reset prevention_mode when the zone changes**

In `upsertSubscriber`, before writing the new lat/lng, read the previous location and compare zones; reset `prevention_mode` only if the zone changed or coverage was lost:
```typescript
  const db = getSupabase();
  const { data: prev } = await db
    .from("subscribers")
    .select("lat, lng, prevention_mode")
    .eq("chat_id", chatId)
    .limit(1)
    .single();

  let resetPrevention = false;
  if (prev && prev.prevention_mode && prev.prevention_mode !== "off") {
    const { data: zoneData } = await db
      .from("danger_zones")
      .select("id,name,bbox")
      .in("province", PREVENTION_PROVINCE_IDS);
    const zones = (zoneData ?? []) as never;
    const oldZone = findDangerZone(prev.lat, prev.lng, zones);
    const newZone = findDangerZone(lat, lng, zones);
    if (oldZone?.id !== newZone?.id) resetPrevention = true;
  }
  // ...include `prevention_mode: 'off'` in the upsert payload when resetPrevention is true,
  // and also delete the prevention_alerted rows for this chat_id.
```

> Adapt to the existing `upsertSubscriber` shape (it already builds an upsert payload + resolves `source`). Add `prevention_mode: "off"` to that payload conditionally, and `await db.from("prevention_alerted").delete().eq("chat_id", chatId)` when `resetPrevention`.

- [ ] **Step 3: Verify**

Run: `npx vitest run && npx tsc --noEmit`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/bot/telegram/route.ts
git commit -m "feat: offer prevention opt-in on onboarding + reset on zone change"
```

---

## Task 9: Register the new bot commands

**Files:**
- Modify: `src/app/api/bot/sync-commands/route.ts:15-25`

- [ ] **Step 1: Add the commands to the `COMMANDS` array**

After the `rayos` entry:
```typescript
  { command: "preferencias", description: "Ajustar tus avisos (rayos y prevención)" },
  { command: "prevencion", description: "Avisos de prevención de incendio" },
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/bot/sync-commands/route.ts
git commit -m "feat: register /preferencias and /prevencion bot commands"
```

- [ ] **Step 3: Re-register the menu (after deploy)**

`GET https://alertaforestal.org/api/bot/sync-commands?secret=<CRON_SECRET>` once, so Telegram shows the new commands.

---

## Task 10: Cron job

**Files:**
- Append to: `scripts/sql/whi-fwi-prevention-alerts.sql` (the migration file from Task 1)

- [ ] **Step 1: Add the pg_cron schedule**

```sql
-- daily at 09:30 UTC (06:30 ART), ~30 min after fire-danger-sync (09:00 UTC)
SELECT cron.schedule(
  'prevention-alerts',
  '30 9 * * *',
  $$SELECT net.http_get(
      'https://alertaforestal.org/api/prevention-alerts?secret=' || clara_cron_secret(),
      timeout_milliseconds := 120000
    )$$
);
```

- [ ] **Step 2: Apply (after explicit OK)**

Run the `cron.schedule` statement via Supabase MCP `execute_sql`. Verify:
```sql
SELECT jobname, schedule FROM cron.job WHERE jobname = 'prevention-alerts';
```
Expected: one row, schedule `30 9 * * *`.

- [ ] **Step 3: Commit**

```bash
git add scripts/sql/whi-fwi-prevention-alerts.sql
git commit -m "feat: pg_cron job for daily prevention-alerts"
```

---

## Task 11: End-to-end smoke verification

**Files:** none (manual verification, document in `TESTING.md` if a recipe is added)

- [ ] **Step 1: Inject a synthetic high-danger forecast**

For a test subscriber located in TDF with `prevention_mode='alerts'`, insert a `fire_danger` row for a covered zone with `danger_class='extremo'`, `target_date=today`, `computed_at=today`. (See `TESTING.md` synthetic-injection recipes.)

- [ ] **Step 2: Trigger the route manually**

`GET https://alertaforestal.org/api/prevention-alerts?secret=<CRON_SECRET>` (or against a preview deploy).
Expected JSON: `alerts >= 1`. The test sub receives the alert message in Telegram with the citizen-language copy and `/preferencias` footer.

- [ ] **Step 3: Re-run to confirm dedup**

Trigger again the same day. Expected: `alerts: 0` for that sub (episode already alerted, no escalation).

- [ ] **Step 4: Clean up**

Delete the synthetic `fire_danger` row and the test `prevention_alerted` row. Reset the test sub's `prevention_mode` if desired.

---

## Self-Review

**Spec coverage:**
- §3 architecture (route + cron post-sync) → Tasks 6, 10. ✓
- §4 data model (prevention_mode + 2 tables) → Task 1. ✓
- §5 trigger logic (window, episode, escalation) → Task 3. ✓
- §6 zone derivation (bbox + buffer) → Task 2. ✓
- §7.1 `/preferencias` hub → Tasks 5, 7, 9. ✓
- §7.2 onboarding offer + reset on zone change → Task 8. ✓
- §7.3 message content (alert + briefing, DANGER_COPY) → Task 4. ✓
- §8 error handling (best-effort send; dedup order: alert after / briefing before) → Task 6 (route). ✓
- §9 testing → Tasks 2-6 (pure helpers + route). ✓
- §10 cron config → Task 10. ✓

**Placeholder scan:** Tasks 7 and 8 modify an existing large file and intentionally describe *where* to insert against named anchors (the `/rayos` branch, `handleLocation`, `upsertSubscriber`) with complete code for the new helpers. This is the standard "adapt to existing shape" case for an established file, not a missing-code placeholder; every new function body is fully written.

**Type consistency:** `DangerZoneBox` (Task 2) is reused in Task 6's route. `ForecastDay` (Task 3) is reused in Tasks 4 and 6. `PreventionMode` / `PreferencesState` (Task 5) used in Task 7. `findDangerZone`, `evaluatePreventionTrigger`, `formatPreventionAlert`, `formatDailyBriefing`, `buildPreferencesKeyboard`, `parsePreferencesCallback` are named identically across definition and call sites. ✓
