# FIRMS Freshness Monitor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alert the admin on Telegram when FIRMS fire data stops refreshing, so a silent outage like the 3-day MAP_KEY freeze is caught in ~1 hour instead of days.

**Architecture:** A pure decision function (`decideFreshnessAction`) drives a cron endpoint (`/api/monitor/fires-freshness`) that compares `fires_cache.fetched_at` to a 60-minute threshold and sends a Telegram message on the stale→/→recovered transitions, with anti-spam state and the admin chat id in `_clara_config`. A `pg_cron` hits the endpoint every 15 min. Also versions the already-applied MAP_KEY rotation.

**Tech Stack:** Next.js App Router (TS), vitest, Supabase (PostgREST via `@supabase/supabase-js` service role), Telegram Bot API, pg_cron + pg_net.

**Conventions:**
- Run TS tests: `npx vitest run src/__tests__/fires-freshness.test.ts` (or `npm test` for all).
- Cron endpoints: `GET(request)`, gate with `isCronAuthorized(request)` (`src/lib/cron-auth.ts`), DB via `getSupabase()` (`src/lib/supabase.ts`), Telegram via `sendMessage(chatId, html)` (`src/lib/telegram.ts`). Pattern reference: `src/app/api/lightning-alerts/route.ts`.
- Commit messages: conventional prefix, English, end with the `Co-Authored-By` trailer.
- Production apply (cron + admin_chat_id) is GATED — Task 4 is documentation only, not executed here.

---

### Task 1: Pure decision function (`fires-freshness.ts`)

The transition logic — the testable core.

**Files:**
- Create: `src/lib/fires-freshness.ts`
- Test: `src/__tests__/fires-freshness.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/__tests__/fires-freshness.test.ts
import { describe, it, expect } from "vitest";
import { decideFreshnessAction } from "@/lib/fires-freshness";

describe("decideFreshnessAction", () => {
  it("alerts when stale and not yet alerted", () => {
    expect(decideFreshnessAction({ ageMinutes: 90, thresholdMinutes: 60, alerted: false })).toBe("alert_stale");
  });
  it("stays silent when stale and already alerted", () => {
    expect(decideFreshnessAction({ ageMinutes: 90, thresholdMinutes: 60, alerted: true })).toBe("none");
  });
  it("signals recovery when fresh again after an alert", () => {
    expect(decideFreshnessAction({ ageMinutes: 5, thresholdMinutes: 60, alerted: true })).toBe("alert_recovered");
  });
  it("stays silent when fresh and never alerted", () => {
    expect(decideFreshnessAction({ ageMinutes: 5, thresholdMinutes: 60, alerted: false })).toBe("none");
  });
  it("treats exactly-at-threshold as fresh (strict greater-than)", () => {
    expect(decideFreshnessAction({ ageMinutes: 60, thresholdMinutes: 60, alerted: false })).toBe("none");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/__tests__/fires-freshness.test.ts`
Expected: FAIL — cannot find module `@/lib/fires-freshness`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/fires-freshness.ts
/**
 * Decide whether to notify about FIRMS data freshness. Pure — no I/O. The caller
 * reads fires_cache.fetched_at and the anti-spam flag, passes them in, and acts
 * on the returned transition. `alerted` = a stale alert is currently outstanding.
 */
export type FreshnessAction = "none" | "alert_stale" | "alert_recovered";

export function decideFreshnessAction(input: {
  ageMinutes: number;
  thresholdMinutes: number;
  alerted: boolean;
}): FreshnessAction {
  const stale = input.ageMinutes > input.thresholdMinutes;
  if (stale && !input.alerted) return "alert_stale";
  if (!stale && input.alerted) return "alert_recovered";
  return "none";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/__tests__/fires-freshness.test.ts`
Expected: PASS (5 passed).

- [ ] **Step 5: Commit**

```bash
git add src/lib/fires-freshness.ts src/__tests__/fires-freshness.test.ts
git commit -m "feat: pure FIRMS freshness transition decision + tests

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Cron endpoint (`/api/monitor/fires-freshness`)

Wires the decision function to `fires_cache`, `_clara_config`, and Telegram. Integration code — verified by `next build` typecheck + a manual smoke (Task 4), not unit-mocked, matching the repo's cron-route convention.

**Files:**
- Create: `src/app/api/monitor/fires-freshness/route.ts`

- [ ] **Step 1: Write the route**

```ts
// src/app/api/monitor/fires-freshness/route.ts
import { NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { sendMessage } from "@/lib/telegram";
import { isCronAuthorized } from "@/lib/cron-auth";
import { decideFreshnessAction } from "@/lib/fires-freshness";

const THRESHOLD_MINUTES = 60;

/**
 * GET /api/monitor/fires-freshness
 *
 * Cron monitor: alert the admin on Telegram when fires_cache stops refreshing.
 * Reads fires_cache.fetched_at + _clara_config (admin_chat_id, anti-spam flag),
 * and notifies on the stale / recovered transitions only. Gated by CRON_SECRET.
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
    .in("key", ["admin_chat_id", "fires_freshness_alerted_at"]);

  const cfg = Object.fromEntries((cfgRows ?? []).map((r) => [r.key, r.value]));
  const adminChatId = cfg["admin_chat_id"];
  const alerted = Boolean(cfg["fires_freshness_alerted_at"]);

  const fetchedAt = cache?.fetched_at ? new Date(cache.fetched_at) : null;
  // No row / no timestamp = treat as maximally stale (data is missing = a problem).
  const ageMinutes = fetchedAt ? (Date.now() - fetchedAt.getTime()) / 60000 : Number.POSITIVE_INFINITY;

  const action = decideFreshnessAction({ ageMinutes, thresholdMinutes: THRESHOLD_MINUTES, alerted });
  const stale = ageMinutes > THRESHOLD_MINUTES;
  const ageOut = Number.isFinite(ageMinutes) ? Math.round(ageMinutes) : null;

  if (action === "none") {
    return NextResponse.json({ ageMinutes: ageOut, stale, action, notified: false });
  }

  if (!adminChatId) {
    // Monitor works but cannot notify until admin_chat_id is set in _clara_config.
    return NextResponse.json({ ageMinutes: ageOut, stale, action, notified: false, reason: "admin_chat_id not configured" });
  }

  const ageLabel = ageOut !== null ? `${ageOut} min` : "sin dato";
  const msg =
    action === "alert_stale"
      ? `⚠️ <b>Clara — FIRMS sin actualizar</b>\n\n` +
        `Los focos de FIRMS no se actualizan hace <b>${ageLabel}</b>.\n` +
        `Último fetch: ${fetchedAt ? fetchedAt.toISOString() : "—"}.\n\n` +
        `Revisá el MAP_KEY (_clara_config.firms_map_key) o el cron fires-fetch.`
      : `✅ <b>Clara — FIRMS se recuperó</b>\n\n` +
        `Los focos de FIRMS volvieron a actualizar (hace ${ageLabel}).`;

  await sendMessage(Number(adminChatId), msg);

  if (action === "alert_stale") {
    await db.from("_clara_config").upsert({
      key: "fires_freshness_alerted_at",
      value: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } else {
    await db.from("_clara_config").delete().eq("key", "fires_freshness_alerted_at");
  }

  return NextResponse.json({ ageMinutes: ageOut, stale, action, notified: true });
}
```

Note: `sendMessage` is best-effort (returns void, no-ops if `TELEGRAM_BOT_TOKEN` is unset). We mark the flag after sending; a missed send is self-healing because the `recovered` transition clears the flag regardless.

- [ ] **Step 2: Typecheck the route compiles**

Run: `npx tsc --noEmit`
Expected: no errors (the new route typechecks against `getSupabase`/`sendMessage`/`isCronAuthorized`/`decideFreshnessAction`).

- [ ] **Step 3: Run the full TS test suite (no regressions)**

Run: `npm test`
Expected: all green, including the new `fires-freshness` tests.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/monitor/fires-freshness/route.ts
git commit -m "feat: FIRMS freshness monitor endpoint (Telegram on stale/recovered)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Version the SQL (MAP_KEY rotation + freshness cron)

Capture in the repo the MAP_KEY rotation already applied to prod, plus the new cron. SQL files only — no apply (Task 4).

**Files:**
- Create: `scripts/sql/whi-firms-map-key-config.sql`
- Create: `scripts/sql/whi-firms-freshness-cron.sql`
- Modify: `SECURITY-AUDIT.md` (add the MAP_KEY rotation procedure)

- [ ] **Step 1: Write the MAP_KEY rotation SQL (no literal key)**

```sql
-- scripts/sql/whi-firms-map-key-config.sql
-- FIRMS MAP_KEY moved out of the SQL function body into _clara_config, so the
-- key is not embedded in pg_get_functiondef output and rotation is a one-row UPDATE.
-- APPLIED to prod (qmzuwnilehldvobjsbcs) on 2026-06-19 during the MAP_KEY-expiry
-- incident; this file versions it. The key VALUE is a secret — set it manually,
-- never commit it.

-- 1. Set the key (run manually with the real value; do NOT commit the value):
--    insert into public._clara_config (key, value, updated_at)
--    values ('firms_map_key', '<MAP_KEY>', now())
--    on conflict (key) do update set value = excluded.value, updated_at = now();

-- 2. Accessor (same pattern as clara_cron_secret):
create or replace function public.clara_firms_map_key()
returns text language sql security definer
set search_path = pg_catalog, public as $$
  select value from public._clara_config where key = 'firms_map_key';
$$;

-- 3. Fetch step reads the key from config instead of a literal:
create or replace function public.fires_sync_step1_fetch()
returns void language plpgsql
set search_path = pg_catalog, public as $$
  declare _req_id bigint;
  begin
    select net.http_get(
      'https://firms.modaps.eosdis.nasa.gov/api/area/csv/'
        || public.clara_firms_map_key()
        || '/VIIRS_SNPP_NRT/-73.6,-55.1,-53.6,-21.8/1',
      timeout_milliseconds := 30000
    ) into _req_id;
    update public._fires_sync_state set request_id = _req_id, requested_at = now() where id = 1;
  end;
$$;
```

- [ ] **Step 2: Write the freshness cron SQL**

```sql
-- scripts/sql/whi-firms-freshness-cron.sql
-- Every 15 min, hit the freshness monitor endpoint. Mirrors the fire-danger-sync
-- cron: net.http_get with the secret from clara_cron_secret(), apex alias because
-- pg_net does not follow the alertaforestal.org redirect.
-- APPLY GATED: run after the endpoint is deployed AND admin_chat_id is set.

select cron.schedule(
  'fires-freshness-monitor',
  '*/15 * * * *',
  $$SELECT net.http_get(
      'https://alertaincendios.vercel.app/api/monitor/fires-freshness?secret=' || clara_cron_secret(),
      timeout_milliseconds := 30000
    )$$
);

-- Set the admin chat id (run manually; the chat id is not a secret but lives in config):
--   insert into public._clara_config (key, value, updated_at)
--   values ('admin_chat_id', '<CHAT_ID>', now())
--   on conflict (key) do update set value = excluded.value, updated_at = now();

-- Verify: select jobid, jobname, schedule, active from cron.job where jobname = 'fires-freshness-monitor';
-- Unschedule: select cron.unschedule('fires-freshness-monitor');
```

- [ ] **Step 3: Add the rotation note to SECURITY-AUDIT.md**

Append a section documenting: the FIRMS MAP_KEY now lives in `_clara_config.firms_map_key` (read via `clara_firms_map_key()`); to rotate, generate a key at https://firms.modaps.eosdis.nasa.gov/api/map_key/ and run `update public._clara_config set value='<key>', updated_at=now() where key='firms_map_key';` — no function recreation needed.

- [ ] **Step 4: Commit**

```bash
git add scripts/sql/whi-firms-map-key-config.sql scripts/sql/whi-firms-freshness-cron.sql SECURITY-AUDIT.md
git commit -m "chore: version FIRMS MAP_KEY rotation + freshness cron SQL (gated)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Production wiring (GATED — documentation, not executed)

After the branch is merged and deployed, a human completes these gated steps:

- [ ] Set the admin chat id: `insert into _clara_config (key,value,updated_at) values ('admin_chat_id','<CHAT_ID>',now()) on conflict (key) do update set value=excluded.value, updated_at=now();`
- [ ] Schedule the cron by applying `scripts/sql/whi-firms-freshness-cron.sql`.
- [ ] Smoke: `select net.http_get('https://alertaincendios.vercel.app/api/monitor/fires-freshness?secret=' || clara_cron_secret());` then check `net._http_response` shows `{ ageMinutes, stale:false, action:"none" }` while FIRMS is healthy.
- [ ] (Optional) Temporarily lower the threshold or stale the cache to confirm a Telegram message arrives, then revert.

---

## Final Verification
- [ ] `npm test` green (new freshness tests + no regressions).
- [ ] `npx tsc --noEmit` clean.
- [ ] Both SQL files present; neither contains a literal MAP_KEY or chat id.
- [ ] Task 4 left un-applied (awaiting admin_chat_id + deploy).
