# FIRMS MAP_KEY Guard + Semi-Auto Rotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect a dead FIRMS MAP_KEY within minutes, stop it from wiping `fires_cache`, alert the admin on Telegram, and let them rotate the key with a single `/rotarkey <key>` bot command.

**Architecture:** Three independent layers per the spec (`docs/superpowers/specs/2026-07-21-firms-mapkey-detection-rotation-design.md`): (1) a plpgsql guard in `fires_sync_step2_process()` that refuses to overwrite the cache when the body is not CSV and raises a `firms_sync_error` flag in `_clara_config`; (2) the existing `/api/monitor/fires-freshness` cron endpoint reads that flag (plus an active `mapkey_status` probe) and sends a specific one-shot Telegram alert; (3) a hidden admin-only `/rotarkey` command in the Telegram webhook that live-validates the candidate key against NASA before writing it to `_clara_config.firms_map_key`.

**Tech Stack:** Next.js 16 (App Router) + TypeScript, Supabase (Postgres, plpgsql, pg_cron/pg_net), Telegram Bot API, vitest.

## Global Constraints

- Commit messages: English, conventional prefixes (`feat:`, `fix:`, `docs:`).
- Bot / alert copy: Spanish, HTML `parse_mode`, external strings escaped with `escapeHtml` (unescaped `&`/`<`/`>` makes Telegram reject with HTTP 400).
- Never import `src/lib/firms.ts` from test files — it transitively imports `server-only` (via `forest-zones-geo`) and vitest cannot load it. New pure helpers live in `src/lib/firms-key.ts`.
- The `/rotarkey` argument is a secret: it must never reach `bot_commands_log`, `log.*`, or any Telegram reply.
- Supabase client is lazy (`getSupabase()`), never module scope.
- SQL is written to a versioned file only — Seba applies it manually in the Supabase SQL Editor (project `qmzuwnilehldvobjsbcs`); the Supabase MCP has no write permission.
- Tests live in `src/__tests__/*.test.ts`, run with `pnpm test` (vitest, node environment, pure units only).
- `_clara_config` schema: `key text PK, value text, updated_at timestamptz`.

---

### Task 1: Pure FIRMS body/key helpers (`firms-key.ts`)

**Files:**
- Create: `src/lib/firms-key.ts`
- Test: `src/__tests__/firms-key.test.ts`

**Interfaces:**
- Consumes: nothing (pure + plain `fetch`).
- Produces:
  - `isFirmsCsvBody(body: string | null | undefined): boolean`
  - `validateMapKey(key: string): Promise<{ valid: boolean; message: string }>` — `message` is a ≤200-char snippet of NASA's response body (for rejection replies), `""` when valid.
  - `FIRMS_MAP_KEY_FORM_URL` (string const) — reused in monitor + bot copy.

- [ ] **Step 1: Write the failing test**

Create `src/__tests__/firms-key.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { isFirmsCsvBody } from "@/lib/firms-key";

// Real header returned by the FIRMS area CSV API.
const CSV_HEADER =
  "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight";

describe("isFirmsCsvBody", () => {
  it("accepts a real CSV body with data rows", () => {
    const body = `${CSV_HEADER}\n-38.95,-68.05,330.1,0.39,0.36,2026-07-21,0512,N,VIIRS,n,2.0NRT,290.1,5.2,N`;
    expect(isFirmsCsvBody(body)).toBe(true);
  });
  it("accepts a header-only CSV (zero fires is legitimate)", () => {
    expect(isFirmsCsvBody(`${CSV_HEADER}\n`)).toBe(true);
  });
  it("rejects the invalid-key body NASA sends with HTTP 200", () => {
    expect(isFirmsCsvBody("Invalid MAP_KEY.")).toBe(false);
  });
  it("rejects the rate-limit body", () => {
    expect(
      isFirmsCsvBody(
        "MAP_KEY is invalid or your have exceeded your transaction/time limit. Please try again later."
      )
    ).toBe(false);
  });
  it("rejects an HTML error page", () => {
    expect(isFirmsCsvBody("<!DOCTYPE html><html><body>Maintenance</body></html>")).toBe(false);
  });
  it("rejects empty / null / undefined bodies", () => {
    expect(isFirmsCsvBody("")).toBe(false);
    expect(isFirmsCsvBody(null)).toBe(false);
    expect(isFirmsCsvBody(undefined)).toBe(false);
  });
  it("tolerates leading whitespace before the header", () => {
    expect(isFirmsCsvBody(`\n${CSV_HEADER}\n`)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test -- src/__tests__/firms-key.test.ts`
Expected: FAIL — `Cannot find module '@/lib/firms-key'` (or equivalent resolve error).

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/firms-key.ts`:

```ts
/**
 * FIRMS MAP_KEY helpers — pure + fetch-only, safe to import from tests and
 * from the Telegram webhook. Deliberately NOT in firms.ts: that module pulls
 * in server-only forest polygons and cannot be loaded by vitest.
 *
 * NASA quirk this module exists for: application errors ("Invalid MAP_KEY.",
 * rate-limit text, maintenance HTML) arrive with HTTP 200. The only reliable
 * validity signal is the body itself — real area CSV always starts with the
 * "latitude,longitude,..." header.
 */

export const FIRMS_MAP_KEY_FORM_URL = "https://firms.modaps.eosdis.nasa.gov/api/map_key/";

/** True iff the body looks like FIRMS area CSV (header present). */
export function isFirmsCsvBody(body: string | null | undefined): boolean {
  return Boolean(body && body.trimStart().startsWith("latitude"));
}

/**
 * Live-validates a candidate MAP_KEY against NASA with a tiny 1-day bbox
 * request. `message` carries NASA's response snippet on rejection so the
 * caller can show the exact reason ("Invalid MAP_KEY.", rate limit, ...).
 */
export async function validateMapKey(
  key: string
): Promise<{ valid: boolean; message: string }> {
  // Small bbox (Buenos Aires surroundings) — the error body is bbox-independent
  // and a small window keeps the success payload tiny.
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${encodeURIComponent(
    key
  )}/VIIRS_SNPP_NRT/-59.0,-35.5,-57.5,-34.0/1`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const body = await res.text();
    if (res.ok && isFirmsCsvBody(body)) return { valid: true, message: "" };
    return { valid: false, message: body.slice(0, 200) || `HTTP ${res.status}` };
  } catch (err) {
    return {
      valid: false,
      message: `network: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test -- src/__tests__/firms-key.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/firms-key.ts src/__tests__/firms-key.test.ts
git commit -m "feat: add FIRMS CSV-body detection and live MAP_KEY validation helpers"
```

---

### Task 2: Monitor decision logic (`decideMonitorActions`)

**Files:**
- Modify: `src/lib/fires-freshness.ts`
- Test: `src/__tests__/fires-freshness.test.ts` (extend)

**Interfaces:**
- Consumes: existing `decideFreshnessAction`, `FreshnessAction` (same file).
- Produces:
  - `type KeyAction = "none" | "alert_key_invalid" | "alert_key_recovered"`
  - `decideMonitorActions(input: { ageMinutes: number; thresholdMinutes: number; staleAlerted: boolean; hasKeyError: boolean; keyAlerted: boolean }): { freshness: FreshnessAction; key: KeyAction }`
  - Precedence rule: while `hasKeyError` is true, `freshness` is forced to `"none"` (the specific key alert supersedes the generic staleness alert — with the SQL guard in place, `fetched_at` stops advancing during a key incident and would otherwise double-alert at 60 min).

- [ ] **Step 1: Write the failing tests**

Append to `src/__tests__/fires-freshness.test.ts` (keep the existing `decideFreshnessAction` describe block untouched; add the import):

```ts
import { decideFreshnessAction, decideMonitorActions } from "@/lib/fires-freshness";
```

(replacing the current import line), then append:

```ts
describe("decideMonitorActions", () => {
  const base = { ageMinutes: 5, thresholdMinutes: 60, staleAlerted: false };

  it("alerts key-invalid when the error flag appears", () => {
    const r = decideMonitorActions({ ...base, hasKeyError: true, keyAlerted: false });
    expect(r.key).toBe("alert_key_invalid");
  });
  it("does not repeat the key alert while flagged (anti-spam)", () => {
    const r = decideMonitorActions({ ...base, hasKeyError: true, keyAlerted: true });
    expect(r.key).toBe("none");
  });
  it("signals key recovery when the flag clears after an alert", () => {
    const r = decideMonitorActions({ ...base, hasKeyError: false, keyAlerted: true });
    expect(r.key).toBe("alert_key_recovered");
  });
  it("stays silent with no flag and no outstanding alert", () => {
    const r = decideMonitorActions({ ...base, hasKeyError: false, keyAlerted: false });
    expect(r.key).toBe("none");
    expect(r.freshness).toBe("none");
  });
  it("suppresses the generic staleness alert while the key error is active", () => {
    const r = decideMonitorActions({
      ageMinutes: 90,
      thresholdMinutes: 60,
      staleAlerted: false,
      hasKeyError: true,
      keyAlerted: true,
    });
    expect(r.freshness).toBe("none");
  });
  it("keeps normal staleness behavior when there is no key error", () => {
    const r = decideMonitorActions({
      ageMinutes: 90,
      thresholdMinutes: 60,
      staleAlerted: false,
      hasKeyError: false,
      keyAlerted: false,
    });
    expect(r.freshness).toBe("alert_stale");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- src/__tests__/fires-freshness.test.ts`
Expected: FAIL — `decideMonitorActions` is not exported.

- [ ] **Step 3: Implement**

Append to `src/lib/fires-freshness.ts`:

```ts
/**
 * Key-invalidation alert transitions. `hasError` mirrors the presence of the
 * `_clara_config.firms_sync_error` flag written by the SQL body guard;
 * `alerted` mirrors `firms_key_alerted_at` (anti-spam).
 */
export type KeyAction = "none" | "alert_key_invalid" | "alert_key_recovered";

/**
 * Combined monitor decision. While a key error is active the specific key
 * alert supersedes the generic staleness alert: the guard stops `fetched_at`
 * from advancing during a key incident, so without this precedence the
 * monitor would fire a redundant "FIRMS sin actualizar" 60 min later.
 */
export function decideMonitorActions(input: {
  ageMinutes: number;
  thresholdMinutes: number;
  staleAlerted: boolean;
  hasKeyError: boolean;
  keyAlerted: boolean;
}): { freshness: FreshnessAction; key: KeyAction } {
  let key: KeyAction = "none";
  if (input.hasKeyError && !input.keyAlerted) key = "alert_key_invalid";
  else if (!input.hasKeyError && input.keyAlerted) key = "alert_key_recovered";

  const freshness = input.hasKeyError
    ? "none"
    : decideFreshnessAction({
        ageMinutes: input.ageMinutes,
        thresholdMinutes: input.thresholdMinutes,
        alerted: input.staleAlerted,
      });

  return { freshness, key };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- src/__tests__/fires-freshness.test.ts`
Expected: PASS (5 existing + 6 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/fires-freshness.ts src/__tests__/fires-freshness.test.ts
git commit -m "feat: add key-invalidation decision logic with staleness-suppression precedence"
```

---

### Task 3: Extend the freshness monitor route

**Files:**
- Modify: `src/app/api/monitor/fires-freshness/route.ts` (full rewrite below)

**Interfaces:**
- Consumes: `decideMonitorActions`, `KeyAction` (Task 2); `FIRMS_MAP_KEY_FORM_URL` (Task 1); existing `getSupabase`, `sendMessage`, `escapeHtml`, `isCronAuthorized`.
- Produces: `_clara_config` flag `firms_key_alerted_at` (set on key alert, deleted on recovery). Reads flags `firms_sync_error` (written by the SQL guard, Task 5) and `firms_map_key`.

No new unit tests: all decisions live in the pure functions tested in Task 2; the route is thin orchestration verified by the e2e recipe (Task 6) — same pattern as the original 2026-06-19 monitor plan.

- [ ] **Step 1: Replace the route file**

Replace the entire content of `src/app/api/monitor/fires-freshness/route.ts` with:

```ts
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { sendMessage, escapeHtml } from "@/lib/telegram";
import { isCronAuthorized } from "@/lib/cron-auth";
import { decideMonitorActions } from "@/lib/fires-freshness";
import { FIRMS_MAP_KEY_FORM_URL } from "@/lib/firms-key";

const THRESHOLD_MINUTES = 60;

/**
 * GET /api/monitor/fires-freshness
 *
 * Cron monitor (pg_cron `fires-freshness-monitor`, every 15 min). Two signals:
 * - `firms_sync_error` in _clara_config (written by the SQL body guard when
 *   NASA returns a non-CSV body, e.g. "Invalid MAP_KEY.") → specific one-shot
 *   Telegram alert with rotation instructions. Supersedes the generic alert.
 * - fires_cache.fetched_at older than THRESHOLD_MINUTES → generic staleness
 *   alert (cron/pg_net down, etc).
 * Anti-spam flags and admin_chat_id live in _clara_config. Gated by CRON_SECRET.
 */
export async function GET(request: Request) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = getSupabase();

  const { data: cache } = await db
    .from("fires_cache")
    .select("fetched_at")
    .eq("id", 1)
    .maybeSingle();

  const { data: cfgRows } = await db
    .from("_clara_config")
    .select("key, value")
    .in("key", [
      "admin_chat_id",
      "fires_freshness_alerted_at",
      "firms_sync_error",
      "firms_key_alerted_at",
      "firms_map_key",
    ]);

  const cfg = Object.fromEntries((cfgRows ?? []).map((r) => [r.key, r.value]));
  const adminChatId = cfg["admin_chat_id"];
  const keyError = cfg["firms_sync_error"];

  const fetchedAt = cache?.fetched_at ? new Date(cache.fetched_at) : null;
  // No row / no timestamp = treat as maximally stale (data is missing = a problem).
  const ageMinutes = fetchedAt ? (Date.now() - fetchedAt.getTime()) / 60000 : Number.POSITIVE_INFINITY;

  const { freshness, key } = decideMonitorActions({
    ageMinutes,
    thresholdMinutes: THRESHOLD_MINUTES,
    staleAlerted: Boolean(cfg["fires_freshness_alerted_at"]),
    hasKeyError: Boolean(keyError),
    keyAlerted: Boolean(cfg["firms_key_alerted_at"]),
  });

  const stale = ageMinutes > THRESHOLD_MINUTES;
  const ageOut = Number.isFinite(ageMinutes) ? Math.round(ageMinutes) : null;

  if (freshness === "none" && key === "none") {
    return NextResponse.json({ ageMinutes: ageOut, stale, freshness, key, notified: false });
  }

  if (!adminChatId) {
    // Monitor works but cannot notify until admin_chat_id is set in _clara_config.
    return NextResponse.json({
      ageMinutes: ageOut,
      stale,
      freshness,
      key,
      notified: false,
      reason: "admin_chat_id not configured",
    });
  }

  const now = new Date().toISOString();

  // --- Key-invalidation alert (specific, supersedes staleness) ---
  if (key === "alert_key_invalid") {
    const statusSnippet = await fetchMapkeyStatus(cfg["firms_map_key"]);
    const msg =
      `🔑 <b>Clara — MAP_KEY de FIRMS inválida</b>\n\n` +
      `NASA está rechazando los pedidos de focos:\n` +
      `<code>${escapeHtml(keyError)}</code>\n\n` +
      (statusSnippet
        ? `Chequeo directo del estado de la key:\n<code>${escapeHtml(statusSnippet)}</code>\n\n`
        : "") +
      `El sitio quedó congelado en el último dato bueno (no se pierde nada).\n\n` +
      `<b>Para arreglarlo:</b>\n` +
      `1. Pedí una key nueva (llega por mail): ${FIRMS_MAP_KEY_FORM_URL}\n` +
      `2. Cuando la tengas, mandame acá:\n<code>/rotarkey LA_KEY</code>`;
    await sendMessage(Number(adminChatId), msg);
    await db.from("_clara_config").upsert({
      key: "firms_key_alerted_at",
      value: now,
      updated_at: now,
    });
  } else if (key === "alert_key_recovered") {
    await sendMessage(
      Number(adminChatId),
      `✅ <b>Clara — MAP_KEY de FIRMS operativa</b>\n\nLos syncs de focos volvieron a traer datos.`
    );
    await db.from("_clara_config").delete().eq("key", "firms_key_alerted_at");
  }

  // --- Generic staleness alert (only when no key error is active) ---
  if (freshness === "alert_stale" || freshness === "alert_recovered") {
    const ageLabel = ageOut !== null ? `${ageOut} min` : "sin dato";
    const msg =
      freshness === "alert_stale"
        ? `⚠️ <b>Clara — FIRMS sin actualizar</b>\n\n` +
          `Los focos de FIRMS no se actualizan hace <b>${ageLabel}</b>.\n` +
          `Último fetch: ${fetchedAt ? fetchedAt.toISOString() : "—"}.\n\n` +
          `No hay error de MAP_KEY marcado — revisá el cron fires-fetch / pg_net.`
        : `✅ <b>Clara — FIRMS se recuperó</b>\n\n` +
          `Los focos de FIRMS volvieron a actualizar (hace ${ageLabel}).`;
    await sendMessage(Number(adminChatId), msg);
    if (freshness === "alert_stale") {
      await db.from("_clara_config").upsert({
        key: "fires_freshness_alerted_at",
        value: now,
        updated_at: now,
      });
    } else {
      await db.from("_clara_config").delete().eq("key", "fires_freshness_alerted_at");
    }
  }

  return NextResponse.json({ ageMinutes: ageOut, stale, freshness, key, notified: true });
}

/**
 * Best-effort probe of NASA's mapkey_status endpoint to enrich the alert with
 * NASA's own words. Failures return null — the `firms_sync_error` flag is the
 * primary signal and the alert goes out regardless.
 */
async function fetchMapkeyStatus(mapKey: string | undefined): Promise<string | null> {
  if (!mapKey) return null;
  try {
    const res = await fetch(
      `https://firms.modaps.eosdis.nasa.gov/mapserver/mapkey_status/?MAP_KEY=${encodeURIComponent(mapKey)}`,
      { signal: AbortSignal.timeout(8000) }
    );
    const text = (await res.text()).trim();
    return text ? text.slice(0, 200) : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Verify it compiles and nothing regressed**

Run: `npx tsc --noEmit && pnpm test`
Expected: tsc exits 0; all vitest suites PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/monitor/fires-freshness/route.ts
git commit -m "feat: alert on FIRMS key invalidation from the freshness monitor"
```

---

### Task 4: `/rotarkey` admin command in the Telegram webhook

**Files:**
- Modify: `src/lib/telegram.ts` (add `deleteMessage`)
- Modify: `src/app/api/bot/telegram/route.ts` (interface + dispatch + handler)

**Interfaces:**
- Consumes: `validateMapKey`, `FIRMS_MAP_KEY_FORM_URL` (Task 1); existing `getSupabase`, `sendMessage`, `escapeHtml`, `logBotCommand` (already defined in the route file), `callTelegram` (telegram.ts internal).
- Produces: `deleteMessage(chatId: number, messageId: number): Promise<SendResult>` in `src/lib/telegram.ts`; `/rotarkey` behavior. Writes `_clara_config.firms_map_key`; deletes `firms_sync_error` + `firms_key_alerted_at`.

- [ ] **Step 1: Add `deleteMessage` to `src/lib/telegram.ts`**

Append after `editMessageText`:

```ts
/**
 * Borra un mensaje del chat. Usado por /rotarkey para que la key no quede en
 * el historial del admin. Best-effort: Telegram lo permite en privados dentro
 * de 48h; si falla, el caller lo ignora.
 */
export async function deleteMessage(chatId: number, messageId: number): Promise<SendResult> {
  return callTelegram("deleteMessage", {
    chat_id: chatId,
    message_id: messageId,
  });
}
```

- [ ] **Step 2: Extend the update interface in `src/app/api/bot/telegram/route.ts`**

In `interface TelegramUpdate`, add `message_id` to `message` (Telegram always sends it; it was just never needed before):

```ts
  message?: {
    message_id?: number;
    chat: { id: number };
    text?: string;
    location?: { latitude: number; longitude: number };
    from?: { first_name: string };
  };
```

Extend the telegram import at the top of the file:

```ts
import { sendMessage, answerCallbackQuery, editMessageText, escapeHtml, deleteMessage } from "@/lib/telegram";
```

and add:

```ts
import { validateMapKey, FIRMS_MAP_KEY_FORM_URL } from "@/lib/firms-key";
```

- [ ] **Step 3: Add the dispatch branch**

In the command dispatch, insert **before** the final `else` (the `<unknown>` branch):

```ts
    } else if (text === "/rotarkey" || text.startsWith("/rotarkey ")) {
      // Admin-only, hidden. NEVER log the argument — it is the FIRMS secret.
      await logBotCommand(chatId, "/rotarkey");
      const arg = text === "/rotarkey" ? "" : text.slice("/rotarkey ".length);
      await handleRotarKey(chatId, arg, update.message?.message_id);
```

- [ ] **Step 4: Add the handler**

Add near the other handlers in the same file (e.g. after `handleSoyBombero`):

```ts
/**
 * /rotarkey <key> — rotación de la MAP_KEY de FIRMS (WHI: incidente recurrente
 * de key invalidada). Solo responde al admin (_clara_config.admin_chat_id);
 * para cualquier otro chat se comporta como comando desconocido. Valida la key
 * contra NASA EN VIVO antes de escribirla — un typo nunca llega a la DB.
 */
async function handleRotarKey(chatId: number, arg: string, messageId?: number) {
  const db = getSupabase();

  const { data: adminRow } = await db
    .from("_clara_config")
    .select("value")
    .eq("key", "admin_chat_id")
    .maybeSingle();
  const adminChatId = adminRow?.value ? Number(adminRow.value) : null;

  if (!adminChatId || chatId !== adminChatId) {
    // No revelar que el comando existe.
    await sendMessage(chatId, "Comando no reconocido. Usa /help para ver los comandos.");
    return;
  }

  const key = arg.trim();
  if (!key) {
    await sendMessage(
      chatId,
      `Uso: <code>/rotarkey LA_KEY</code>\n\n` +
        `Pedí una key nueva en ${FIRMS_MAP_KEY_FORM_URL} (llega por mail) y mandámela con el comando.`
    );
    return;
  }

  const result = await validateMapKey(key);
  if (!result.valid) {
    await sendMessage(
      chatId,
      `❌ NASA rechazó esa key, no la guardé.\n\n` +
        `Respuesta: <code>${escapeHtml(result.message)}</code>\n\n` +
        `Si acabás de pedirla puede tardar unos minutos en activarse — probá de nuevo en un rato.`
    );
    return;
  }

  const now = new Date().toISOString();
  const { error } = await db.from("_clara_config").upsert({
    key: "firms_map_key",
    value: key,
    updated_at: now,
  });
  if (error) {
    await sendMessage(chatId, `❌ La key es válida pero no pude guardarla: <code>${escapeHtml(error.message)}</code>`);
    return;
  }

  await db.from("_clara_config").delete().in("key", ["firms_sync_error", "firms_key_alerted_at"]);

  // Best-effort: que la key no quede en el historial del chat.
  if (messageId) await deleteMessage(chatId, messageId);

  await sendMessage(
    chatId,
    `✅ <b>Key validada contra NASA y rotada.</b>\n\n` +
      `El próximo sync corre en ≤15 min.\n` +
      `Borré tu mensaje para que la key no quede en el historial.\n\n` +
      `Pendiente (no crítico, cuando puedas):\n` +
      `• Vercel env <code>FIRMS_API_KEY</code> (solo la ruta manual de sync)\n` +
      `• <code>scripts/backfill.env</code> local\n\n` +
      `Anotá la fecha: si la key muere de nuevo en ~28 días, es política de NASA — ver spec 2026-07-21.`
  );
}
```

- [ ] **Step 5: Verify compile + tests + lint**

Run: `npx tsc --noEmit && pnpm test && pnpm lint`
Expected: all green. (`/rotarkey` is intentionally NOT added to `/api/bot/sync-commands` — hidden admin command, per spec.)

- [ ] **Step 6: Commit**

```bash
git add src/lib/telegram.ts src/app/api/bot/telegram/route.ts
git commit -m "feat: add hidden admin /rotarkey command with live NASA validation"
```

---

### Task 5: SQL body guard (versioned file, manual apply)

**Files:**
- Create: `scripts/sql/whi-firms-body-guard.sql`

**Interfaces:**
- Consumes: current prod `fires_sync_step2_process()` (WHI-378 semantics: replace, dedup, low-confidence filter — reproduced in full below).
- Produces: `_clara_config.firms_sync_error` flag (format `<now()::text> | <first 200 chars of body>`) — consumed by the monitor (Task 3) and cleared by `/rotarkey` (Task 4) and by the function itself on recovery.

- [ ] **Step 1: Write the SQL file**

Create `scripts/sql/whi-firms-body-guard.sql`:

```sql
-- scripts/sql/whi-firms-body-guard.sql
-- Guard de body no-CSV en fires_sync_step2_process().
--
-- Incidente recurrente (2026-06-19, 2026-07-17): NASA invalida la MAP_KEY y
-- responde el texto "Invalid MAP_KEY." con HTTP 200. El chequeo de status_code
-- nunca lo ve; el parser CSV lo convierte en 0 filas y REEMPLAZA fires_cache
-- con [] cada 15 min — el sitio queda "sin focos" en silencio.
--
-- Este patch: si el body NO empieza con el header CSV ("latitude,..."), NO
-- toca fires_cache (los últimos focos buenos quedan visibles), marca
-- _clara_config.firms_sync_error (el monitor /api/monitor/fires-freshness lo
-- convierte en alerta Telegram) y devuelve 'firms_body_error'. En el camino
-- feliz borra el flag (recovery automático).
--
-- Baseline: la versión WHI-378 (scripts/sql/whi-378-fix-fires-sync-step2.sql).
-- Antes de aplicar, verificar la versión actual con
-- scripts/sql/whi-378-inspect-fires-sync.sql.
--
-- Uso: pegar en Supabase SQL Editor (proyecto qmzuwnilehldvobjsbcs).

CREATE OR REPLACE FUNCTION fires_sync_step2_process()
RETURNS TABLE (count INTEGER, status TEXT)
LANGUAGE plpgsql
AS $$
DECLARE
  v_request_id BIGINT;
  v_status_code INT;
  v_body TEXT;
  v_fires JSONB;
  v_count INT;
BEGIN
  SELECT request_id INTO v_request_id
  FROM _fires_sync_state
  WHERE id = 1;

  IF v_request_id IS NULL THEN
    RETURN QUERY SELECT 0, 'no_pending_request';
    RETURN;
  END IF;

  SELECT r.status_code, r.content
  INTO v_status_code, v_body
  FROM net._http_response r
  WHERE r.id = v_request_id;

  IF v_status_code IS NULL THEN
    RETURN QUERY SELECT 0, 'response_not_ready';
    RETURN;
  END IF;

  IF v_status_code <> 200 THEN
    RETURN QUERY SELECT 0, format('firms_status_%s', v_status_code);
    RETURN;
  END IF;

  -- GUARD: los errores de aplicación de NASA llegan con HTTP 200 y un body de
  -- texto plano ("Invalid MAP_KEY.", rate limit, HTML de mantenimiento). El
  -- CSV real del area API SIEMPRE empieza con el header "latitude,...".
  -- Cualquier otra cosa NO debe pisar fires_cache.
  IF v_body IS NULL OR ltrim(v_body) NOT LIKE 'latitude%' THEN
    INSERT INTO _clara_config (key, value, updated_at)
    VALUES (
      'firms_sync_error',
      now()::text || ' | ' || left(coalesce(v_body, '<empty body>'), 200),
      now()
    )
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

    UPDATE _fires_sync_state SET request_id = NULL WHERE id = 1;
    RETURN QUERY SELECT 0, 'firms_body_error';
    RETURN;
  END IF;

  -- Parse CSV: header is the first line, descartar baja confianza
  WITH lines AS (
    SELECT
      regexp_split_to_table(v_body, E'\\n') AS line,
      generate_series(1, regexp_count(v_body, E'\\n') + 1) AS rn
  ),
  data_lines AS (
    SELECT line FROM lines WHERE rn > 1 AND length(trim(line)) > 0
  ),
  parsed AS (
    SELECT string_to_array(line, ',') AS c
    FROM data_lines
  ),
  filtered AS (
    SELECT
      c[1]::float8                         AS latitude,
      c[2]::float8                         AS longitude,
      COALESCE(c[3]::float8, 0)            AS brightness,
      COALESCE(c[10], 'unknown')           AS confidence,
      COALESCE(c[6], '')                   AS acq_date,
      COALESCE(c[7], '')                   AS acq_time,
      COALESCE(c[13]::float8, 0)           AS frp,
      COALESCE(NULLIF(c[14], '')::int, 0)  AS type
    FROM parsed
    WHERE array_length(c, 1) >= 13
      AND lower(COALESCE(c[10], '')) NOT IN ('low', 'l')
  ),
  -- Dedup por unique key natural (lat, lng, acq_date, acq_time)
  deduped AS (
    SELECT DISTINCT ON (latitude, longitude, acq_date, acq_time)
      latitude, longitude, brightness, confidence, acq_date, acq_time, frp, type
    FROM filtered
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'latitude',   latitude,
      'longitude',  longitude,
      'brightness', brightness,
      'confidence', confidence,
      'acqDate',    acq_date,
      'acqTime',    acq_time,
      'frp',        frp,
      'type',       type
    )), '[]'::jsonb)
  INTO v_fires
  FROM deduped;

  v_count := jsonb_array_length(v_fires);

  -- REEMPLAZA, no concatena (WHI-378)
  INSERT INTO fires_cache (id, fires, count, fetched_at)
  VALUES (1, v_fires, v_count, now())
  ON CONFLICT (id) DO UPDATE
    SET fires = EXCLUDED.fires,
        count = EXCLUDED.count,
        fetched_at = EXCLUDED.fetched_at;

  -- Recovery: un body CSV válido borra el flag de error (si existía).
  DELETE FROM _clara_config WHERE key = 'firms_sync_error';

  -- Limpiar estado de la request
  UPDATE _fires_sync_state SET request_id = NULL WHERE id = 1;

  RETURN QUERY SELECT v_count, 'ok';
END;
$$;

-- Verificación post-aplicación:
-- 1. El guard está en la función desplegada:
--    SELECT pg_get_functiondef('fires_sync_step2_process'::regproc) LIKE '%firms_body_error%';
--    → true
-- 2. El camino feliz sigue funcionando (esperar al próximo ciclo o correr a mano):
--    SELECT * FROM fires_sync_step2_process();
--    → (N, 'ok') o (0, 'no_pending_request') — nunca 'firms_body_error' con key sana.
-- 3. fires_cache sigue actualizándose:
--    SELECT count, fetched_at FROM fires_cache WHERE id = 1;
```

- [ ] **Step 2: Commit**

```bash
git add scripts/sql/whi-firms-body-guard.sql
git commit -m "feat: SQL body guard - non-CSV FIRMS response no longer wipes fires_cache"
```

---

### Task 6: Docs — TESTING.md recipe + CLAUDE.md

**Files:**
- Modify: `TESTING.md` (append section)
- Modify: `CLAUDE.md` (Key Patterns bullet, pg_cron list entry, monitor + rotarkey mentions, `_clara_config` description)

**Interfaces:**
- Consumes: everything above (documents it).
- Produces: nothing consumed by code.

- [ ] **Step 1: Append the e2e recipe to `TESTING.md`**

Append (adjust heading level to match the file's existing structure):

```markdown
## MAP_KEY inválida — guard + alerta + /rotarkey

Simula el incidente recurrente de key FIRMS invalidada (spec
`docs/superpowers/specs/2026-07-21-firms-mapkey-detection-rotation-design.md`)
sin tocar la key real.

### 1. Alerta del monitor

En Supabase SQL Editor:

```sql
INSERT INTO _clara_config (key, value, updated_at)
VALUES ('firms_sync_error', now()::text || ' | Invalid MAP_KEY. (test)', now())
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
```

Disparar el monitor (o esperar ≤15 min al pg_cron):

```bash
curl "https://alertaforestal.org/api/monitor/fires-freshness?secret=$CRON_SECRET"
# → {"key":"alert_key_invalid","notified":true,...}
```

Debe llegar el Telegram "🔑 MAP_KEY de FIRMS inválida" al admin. Una segunda
corrida devuelve `"key":"none"` (anti-spam). Limpiar el flag:

```sql
DELETE FROM _clara_config WHERE key = 'firms_sync_error';
```

La corrida siguiente manda el "✅ operativa" (recovery) y borra
`firms_key_alerted_at`.

### 2. /rotarkey

Desde el chat admin del bot:

- `/rotarkey` (sin argumento) → mensaje de uso.
- `/rotarkey basura123` → "❌ NASA rechazó esa key" con `Invalid MAP_KEY.`.
- `/rotarkey <key actual válida>` → "✅ Key validada y rotada" (rotación no-op),
  borra el mensaje con la key y limpia los flags.
- Desde un chat NO admin → "Comando no reconocido".

Verificar que `bot_commands_log` registró `/rotarkey` SIN el argumento:

```sql
SELECT command, args FROM bot_commands_log
WHERE command = '/rotarkey' ORDER BY created_at DESC LIMIT 3;
-- args debe ser NULL en todas
```

### 3. Guard SQL (destructivo suave — opcional)

Con el guard aplicado, un body no-CSV no pisa el cache. Verificable solo en un
incidente real; mientras tanto alcanza con la verificación post-aplicación del
archivo `scripts/sql/whi-firms-body-guard.sql`.
```

- [ ] **Step 2: Update `CLAUDE.md`**

Four edits:

1. Under `### API Routes — Cron`, add (it was never documented in the June work):

```markdown
- `/api/monitor/fires-freshness` — monitor dual: staleness de `fires_cache` (>60 min) + flag `firms_sync_error` (key FIRMS inválida, escrito por el guard SQL). Alerta Telegram one-shot al `admin_chat_id`; la alerta de key suprime la genérica de staleness
```

2. Under `## Supabase pg_cron Jobs`, add:

```markdown
- `fires-freshness-monitor` (`*/15 * * * *`) — `/api/monitor/fires-freshness` staleness + key inválida
```

3. Under `### Config`, replace the `_clara_config` line with:

```markdown
- `_clara_config` (key PK, value, updated_at) — `cron_secret`, `firms_map_key`, `admin_chat_id`, y flags operativos (`fires_freshness_alerted_at`, `firms_sync_error`, `firms_key_alerted_at`). Cron jobs leen el secret via `clara_cron_secret()` SECURITY DEFINER
```

4. Under `## Key Patterns`, add a bullet:

```markdown
- **Guard de body FIRMS**: NASA devuelve errores ("Invalid MAP_KEY.") con HTTP 200; `fires_sync_step2_process()` solo escribe `fires_cache` si el body empieza con el header CSV `latitude,...` — si no, marca `_clara_config.firms_sync_error` y el monitor alerta. Rotación semi-automática con el comando oculto de admin `/rotarkey <key>` (valida en vivo contra NASA antes de guardar; NO va en sync-commands)
```

- [ ] **Step 3: Commit**

```bash
git add TESTING.md CLAUDE.md
git commit -m "docs: MAP_KEY guard testing recipe and architecture notes"
```

---

### Task 7: Final verification

- [ ] **Step 1: Full suite**

Run: `npx tsc --noEmit && pnpm test && pnpm lint`
Expected: all green.

- [ ] **Step 2: Production build**

Run: `pnpm build` (if Turbopack hangs >5 min without output, retry with `pnpm build --webpack` — known repo gotcha).
Expected: build succeeds; `/api/monitor/fires-freshness` and `/api/bot/telegram` listed as dynamic routes.

- [ ] **Step 3: Commit any stragglers and stop**

Do NOT merge or push — rollout order per spec is: PR review → deploy app → Seba applies `scripts/sql/whi-firms-body-guard.sql` in the Supabase SQL Editor → run the TESTING.md recipe end-to-end.
