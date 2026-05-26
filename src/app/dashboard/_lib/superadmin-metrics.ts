import "server-only";

import { getSupabase } from "@/lib/supabase";
import { findForestZone } from "@/lib/forest-zones-geo";
import { FOREST_ZONES } from "@/lib/forest-zones";
import { SUPERADMIN_CONFIG } from "./superadmin-config";

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx];
}

// ─── Suscriptores ────────────────────────────────────────────────────────

export type SubscriberBreakdown = {
  total: number;
  civilian: number;
  fireman: number;
  lightning_on: number;
  lightning_off: number;
  in_forest_zone: number;
  out_of_forest_zone: number;
};

export async function getSubscriberBreakdown(): Promise<SubscriberBreakdown> {
  const db = getSupabase();
  const { data } = await db
    .from("subscribers")
    .select("role, lightning_enabled, lat, lng");
  const subs = (data ?? []) as Array<{
    role: string | null;
    lightning_enabled: boolean | null;
    lat: number | null;
    lng: number | null;
  }>;

  let civilian = 0;
  let fireman = 0;
  let lightning_on = 0;
  let lightning_off = 0;
  let in_forest = 0;
  let out_forest = 0;

  for (const s of subs) {
    if (s.role === "fireman") fireman++;
    else civilian++;
    if (s.lightning_enabled !== false) lightning_on++;
    else lightning_off++;
    if (s.lat != null && s.lng != null) {
      if (findForestZone(s.lat, s.lng)) in_forest++;
      else out_forest++;
    }
  }

  return {
    total: subs.length,
    civilian,
    fireman,
    lightning_on,
    lightning_off,
    in_forest_zone: in_forest,
    out_of_forest_zone: out_forest,
  };
}

// ─── Cuarteles ───────────────────────────────────────────────────────────

export async function getTopCuarteles(): Promise<
  { cuartel: string; subs: number }[]
> {
  const db = getSupabase();
  const { data } = await db
    .from("subscribers")
    .select("cuartel_name")
    .eq("role", "fireman");
  const counts = new Map<string, number>();
  for (const r of (data ?? []) as Array<{ cuartel_name: string | null }>) {
    const name = r.cuartel_name?.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .filter(([, n]) => n >= SUPERADMIN_CONFIG.CUARTEL_MIN_SUBS)
    .map(([cuartel, subs]) => ({ cuartel, subs }))
    .sort((a, b) => b.subs - a.subs);
}

export async function getInviteCodesStatus(): Promise<{
  total_codes: number;
  total_slots: number;
  used_slots: number;
  exhausted_codes: number;
  rows: { code: string; cuartel_name: string | null; used_count: number; max_uses: number }[];
}> {
  const db = getSupabase();
  const { data } = await db
    .from("fireman_codes")
    .select("code, cuartel_name, used_count, max_uses");
  const rows = (data ?? []) as Array<{
    code: string;
    cuartel_name: string | null;
    used_count: number;
    max_uses: number;
  }>;
  let total_slots = 0;
  let used_slots = 0;
  let exhausted = 0;
  for (const r of rows) {
    total_slots += r.max_uses;
    used_slots += r.used_count;
    if (r.used_count >= r.max_uses) exhausted++;
  }
  return {
    total_codes: rows.length,
    total_slots,
    used_slots,
    exhausted_codes: exhausted,
    rows: rows.sort((a, b) => b.used_count - a.used_count),
  };
}

// ─── Engagement ──────────────────────────────────────────────────────────

export async function getEngagement(): Promise<{
  active_7d: number;
  active_30d: number;
  zombies: number;
  total_with_commands: number;
  cancellations_30d: number;
}> {
  const db = getSupabase();
  const sinceActive = new Date(
    Date.now() - SUPERADMIN_CONFIG.ACTIVE_COMMANDS_DAYS * DAY
  ).toISOString();
  const since7d = new Date(Date.now() - 7 * DAY).toISOString();
  const sinceZombie = new Date(
    Date.now() - SUPERADMIN_CONFIG.ZOMBIE_AFTER_DAYS * DAY
  ).toISOString();

  // Last command per chat_id
  const { data } = await db
    .from("bot_commands_log")
    .select("chat_id, command, created_at");
  const rows = (data ?? []) as Array<{
    chat_id: number;
    command: string;
    created_at: string;
  }>;

  const lastByChat = new Map<number, string>();
  let cancellations30d = 0;
  const since30d = new Date(Date.now() - 30 * DAY).toISOString();
  for (const r of rows) {
    const prev = lastByChat.get(r.chat_id);
    if (!prev || r.created_at > prev) lastByChat.set(r.chat_id, r.created_at);
    if (r.command === "/cancelar" && r.created_at >= since30d) cancellations30d++;
  }

  let active7 = 0;
  let active30 = 0;
  let zombies = 0;
  for (const lastAt of lastByChat.values()) {
    if (lastAt >= since7d) active7++;
    if (lastAt >= sinceActive) active30++;
    if (lastAt < sinceZombie) zombies++;
  }

  return {
    active_7d: active7,
    active_30d: active30,
    zombies,
    total_with_commands: lastByChat.size,
    cancellations_30d: cancellations30d,
  };
}

// ─── Detección GOES — funnel trend ───────────────────────────────────────

export type FunnelDay = {
  date: string;
  fire_pixels_global: number;
  after_mask: number;
  after_polygon: number;
  after_urban: number;
  after_flaring: number;
  after_dedup: number;
  inserted: number;
};

export async function getGoesFunnelTrend(daysBack = 14): Promise<FunnelDay[]> {
  const db = getSupabase();
  const since = new Date(Date.now() - daysBack * DAY).toISOString();
  const { data } = await db
    .from("goes_sync_runs")
    .select(
      "scan_start, fire_pixels_global, after_mask, after_polygon, after_urban, after_flaring, after_dedup, inserted"
    )
    .gte("scan_start", since);

  const buckets = new Map<string, FunnelDay>();
  for (let i = daysBack - 1; i >= 0; i--) {
    const key = dateKey(new Date(Date.now() - i * DAY));
    buckets.set(key, {
      date: key.slice(5),
      fire_pixels_global: 0,
      after_mask: 0,
      after_polygon: 0,
      after_urban: 0,
      after_flaring: 0,
      after_dedup: 0,
      inserted: 0,
    });
  }
  for (const r of (data ?? []) as Array<FunnelDay & { scan_start: string }>) {
    const k = (r.scan_start as string).slice(0, 10);
    const dayKeyShort = k.slice(5);
    const b = buckets.get(dayKeyShort);
    if (!b) continue;
    b.fire_pixels_global += r.fire_pixels_global ?? 0;
    b.after_mask += r.after_mask ?? 0;
    b.after_polygon += r.after_polygon ?? 0;
    b.after_urban += r.after_urban ?? 0;
    b.after_flaring += r.after_flaring ?? 0;
    b.after_dedup += r.after_dedup ?? 0;
    b.inserted += r.inserted ?? 0;
  }
  return Array.from(buckets.values());
}

// ─── Confirmation rate trend (mensual) ───────────────────────────────────

export async function getConfirmationTrend(): Promise<
  { month: string; alerted: number; confirmed: number; dismissed: number; conf_rate: number; dism_rate: number }[]
> {
  const db = getSupabase();
  const since = new Date(Date.now() - 180 * DAY).toISOString();
  const { data } = await db
    .from("goes_alerted")
    .select("preliminary_sent_at, confirmed_sent_at, dismissed_at")
    .gte("preliminary_sent_at", since);

  const rows = (data ?? []) as Array<{
    preliminary_sent_at: string;
    confirmed_sent_at: string | null;
    dismissed_at: string | null;
  }>;

  const buckets = new Map<
    string,
    { alerted: number; confirmed: number; dismissed: number }
  >();
  for (const r of rows) {
    const month = r.preliminary_sent_at.slice(0, 7);
    const b = buckets.get(month) ?? { alerted: 0, confirmed: 0, dismissed: 0 };
    b.alerted++;
    if (r.confirmed_sent_at) b.confirmed++;
    if (r.dismissed_at) b.dismissed++;
    buckets.set(month, b);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, b]) => ({
      month,
      alerted: b.alerted,
      confirmed: b.confirmed,
      dismissed: b.dismissed,
      conf_rate: b.alerted > 0 ? Math.round((b.confirmed / b.alerted) * 100) : 0,
      dism_rate: b.alerted > 0 ? Math.round((b.dismissed / b.alerted) * 100) : 0,
    }));
}

// ─── Latencias del pipeline ──────────────────────────────────────────────

export async function getLatencies(): Promise<{
  preliminary_to_confirmed_min: { p50: number | null; p95: number | null; n: number };
  detected_to_preliminary_min: { p50: number | null; p95: number | null; n: number };
  goes_sync_seconds: { p50: number | null; p95: number | null; n: number };
}> {
  const db = getSupabase();
  const since30 = new Date(Date.now() - 30 * DAY).toISOString();

  const [{ data: confirmRows }, { data: syncRows }] = await Promise.all([
    db
      .from("goes_alerted")
      .select("preliminary_sent_at, confirmed_sent_at, goes_id")
      .not("confirmed_sent_at", "is", null)
      .gte("preliminary_sent_at", since30),
    db
      .from("goes_sync_runs")
      .select("total_seconds")
      .gte("created_at", since30),
  ]);

  // preliminary → confirmed (minutos)
  const confDeltas = ((confirmRows ?? []) as Array<{
    preliminary_sent_at: string;
    confirmed_sent_at: string;
  }>)
    .map((r) => (new Date(r.confirmed_sent_at).getTime() - new Date(r.preliminary_sent_at).getTime()) / 60000)
    .filter((d) => d >= 0)
    .sort((a, b) => a - b);

  // detected_at → preliminary_sent (necesitamos join: goes_alerted.goes_id -> goes_preliminary.detected_at)
  const goesIds = ((confirmRows ?? []) as Array<{ goes_id: number }>)
    .map((r) => r.goes_id)
    .filter((x) => x != null)
    .slice(0, 1000); // safety cap
  let detDeltas: number[] = [];
  if (goesIds.length > 0) {
    const { data: prelimRows } = await db
      .from("goes_preliminary")
      .select("id, detected_at")
      .in("id", goesIds);
    const detMap = new Map<number, string>();
    for (const p of (prelimRows ?? []) as Array<{ id: number; detected_at: string }>) {
      detMap.set(p.id, p.detected_at);
    }
    detDeltas = ((confirmRows ?? []) as Array<{
      preliminary_sent_at: string;
      goes_id: number;
    }>)
      .map((r) => {
        const det = detMap.get(r.goes_id);
        if (!det) return null;
        return (new Date(r.preliminary_sent_at).getTime() - new Date(det).getTime()) / 60000;
      })
      .filter((d): d is number => d != null && d >= 0)
      .sort((a, b) => a - b);
  }

  const syncSecs = ((syncRows ?? []) as Array<{ total_seconds: number | null }>)
    .map((r) => r.total_seconds)
    .filter((s): s is number => s != null && s >= 0)
    .sort((a, b) => a - b);

  return {
    preliminary_to_confirmed_min: {
      p50: percentile(confDeltas, 0.5),
      p95: percentile(confDeltas, 0.95),
      n: confDeltas.length,
    },
    detected_to_preliminary_min: {
      p50: percentile(detDeltas, 0.5),
      p95: percentile(detDeltas, 0.95),
      n: detDeltas.length,
    },
    goes_sync_seconds: {
      p50: percentile(syncSecs, 0.5),
      p95: percentile(syncSecs, 0.95),
      n: syncSecs.length,
    },
  };
}

// ─── Distribución forestal de focos ──────────────────────────────────────

export async function getForestSplit(daysBack = 30): Promise<{
  forest: number;
  non_forest: number;
  by_zone: { id: string; name: string; count: number }[];
}> {
  const db = getSupabase();
  const since = new Date(Date.now() - daysBack * DAY).toISOString();
  const { data } = await db
    .from("goes_preliminary")
    .select("lat, lng")
    .gte("detected_at", since);
  const rows = (data ?? []) as Array<{ lat: number; lng: number }>;

  const byZone = new Map<string, number>();
  let forest = 0;
  let nonForest = 0;
  for (const r of rows) {
    const zone = findForestZone(r.lat, r.lng);
    if (zone) {
      forest++;
      byZone.set(zone.id, (byZone.get(zone.id) ?? 0) + 1);
    } else {
      nonForest++;
    }
  }
  const by_zone = FOREST_ZONES.map((z) => ({
    id: z.id,
    name: z.name,
    count: byZone.get(z.id) ?? 0,
  })).sort((a, b) => b.count - a.count);

  return { forest, non_forest: nonForest, by_zone };
}

// ─── Alertas / suscriptor ────────────────────────────────────────────────

export async function getAlertsPerSubscriber(daysBack = 30): Promise<{
  avg_alerts_per_sub: number;
  silent_subs: number;
  max_alerts: number;
  distribution: { bucket: string; subs: number }[];
}> {
  const db = getSupabase();
  const since = new Date(Date.now() - daysBack * DAY).toISOString();
  const sinceSilent = new Date(
    Date.now() - SUPERADMIN_CONFIG.SILENT_AFTER_DAYS * DAY
  ).toISOString();

  const [{ data: subs }, { data: firms }, { data: goes }] = await Promise.all([
    db.from("subscribers").select("chat_id, created_at"),
    db
      .from("ai_alerted_fires")
      .select("chat_id, alerted_at")
      .gte("alerted_at", since),
    db
      .from("goes_alerted")
      .select("chat_id, preliminary_sent_at")
      .gte("preliminary_sent_at", since),
  ]);

  const counts = new Map<number, number>();
  for (const r of (firms ?? []) as Array<{ chat_id: number }>) {
    counts.set(r.chat_id, (counts.get(r.chat_id) ?? 0) + 1);
  }
  for (const r of (goes ?? []) as Array<{ chat_id: number }>) {
    counts.set(r.chat_id, (counts.get(r.chat_id) ?? 0) + 1);
  }

  const subRows = (subs ?? []) as Array<{ chat_id: number; created_at: string }>;
  // Only consider subs old enough to have been eligible
  const eligible = subRows.filter((s) => s.created_at <= sinceSilent);
  let silent = 0;
  let total = 0;
  let max = 0;
  for (const s of eligible) {
    const c = counts.get(s.chat_id) ?? 0;
    if (c === 0) silent++;
    total += c;
    if (c > max) max = c;
  }

  // Bucket distribution (0, 1-2, 3-5, 6-10, 11+)
  const buckets = [
    { bucket: "0", min: 0, max: 0, subs: 0 },
    { bucket: "1-2", min: 1, max: 2, subs: 0 },
    { bucket: "3-5", min: 3, max: 5, subs: 0 },
    { bucket: "6-10", min: 6, max: 10, subs: 0 },
    { bucket: "11+", min: 11, max: Number.POSITIVE_INFINITY, subs: 0 },
  ];
  for (const s of eligible) {
    const c = counts.get(s.chat_id) ?? 0;
    for (const b of buckets) {
      if (c >= b.min && c <= b.max) {
        b.subs++;
        break;
      }
    }
  }

  return {
    avg_alerts_per_sub: eligible.length > 0 ? Math.round((total / eligible.length) * 10) / 10 : 0,
    silent_subs: silent,
    max_alerts: max,
    distribution: buckets.map((b) => ({ bucket: b.bucket, subs: b.subs })),
  };
}

// ─── Sistema ─────────────────────────────────────────────────────────────

export async function getSystemHealth(): Promise<{
  tle_age_hours: number | null;
  tle_count: number;
  tle_stale: number; // > 7d
  goes_preliminary_total: number;
  goes_preliminary_7d: number;
}> {
  const db = getSupabase();
  const since7d = new Date(Date.now() - 7 * DAY).toISOString();
  const [{ data: tles }, { count: total }, { count: last7 }] = await Promise.all([
    db.from("satellite_tles").select("fetched_at"),
    db.from("goes_preliminary").select("*", { count: "exact", head: true }),
    db
      .from("goes_preliminary")
      .select("*", { count: "exact", head: true })
      .gte("detected_at", since7d),
  ]);

  const tleRows = (tles ?? []) as Array<{ fetched_at: string }>;
  let oldestHours: number | null = null;
  let stale = 0;
  const now = Date.now();
  const staleThreshold = 7 * DAY;
  for (const r of tleRows) {
    const ageMs = now - new Date(r.fetched_at).getTime();
    if (oldestHours === null || ageMs / HOUR > oldestHours) {
      oldestHours = Math.round(ageMs / HOUR);
    }
    if (ageMs > staleThreshold) stale++;
  }

  return {
    tle_age_hours: oldestHours,
    tle_count: tleRows.length,
    tle_stale: stale,
    goes_preliminary_total: total ?? 0,
    goes_preliminary_7d: last7 ?? 0,
  };
}
