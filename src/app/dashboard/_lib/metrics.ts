// WHI-587 — server-side metric queries for the dashboard.
// All use SERVICE_ROLE to bypass RLS and return aggregated data only.
import { getSupabase } from "@/lib/supabase";
import { haversineKm } from "@/lib/geo";
import { PROVINCES } from "@/lib/argentina-cities";

const DAY = 24 * 60 * 60 * 1000;

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fillDays(
  rows: { day: string; count: number }[],
  daysBack: number
): { date: string; value: number }[] {
  const now = new Date();
  const map = new Map(rows.map((r) => [r.day, r.count]));
  const out: { date: string; value: number }[] = [];
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(now.getTime() - i * DAY);
    const key = dateKey(d);
    out.push({ date: key.slice(5), value: map.get(key) ?? 0 });
  }
  return out;
}

export async function getSubscriberCount(): Promise<{ total: number; last7d: number }> {
  const db = getSupabase();
  const [{ count: total }, { count: last7d }] = await Promise.all([
    db.from("subscribers").select("*", { count: "exact", head: true }),
    db
      .from("subscribers")
      .select("*", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 7 * DAY).toISOString()),
  ]);
  return { total: total ?? 0, last7d: last7d ?? 0 };
}

export async function getSubscribersGrowth(daysBack = 30): Promise<{ date: string; value: number }[]> {
  const db = getSupabase();
  const since = new Date(Date.now() - daysBack * DAY).toISOString();
  const [{ data }, { count: priorCount }] = await Promise.all([
    db.from("subscribers").select("created_at").gte("created_at", since),
    // Base of subscribers that already existed before the window, so the
    // cumulative curve reflects the real running total instead of starting at 0.
    db
      .from("subscribers")
      .select("*", { count: "exact", head: true })
      .lt("created_at", since),
  ]);
  // Bucket by day
  const map = new Map<string, number>();
  for (const r of data ?? []) {
    const day = (r.created_at as string).slice(0, 10);
    map.set(day, (map.get(day) ?? 0) + 1);
  }
  // Cumulative count seeded with the pre-window base, then fill missing days
  const points: { day: string; count: number }[] = [];
  let cumulative = priorCount ?? 0;
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY);
    const key = dateKey(d);
    cumulative += map.get(key) ?? 0;
    points.push({ day: key, count: cumulative });
  }
  return points.map((p) => ({ date: p.day.slice(5), value: p.count }));
}

export type AlertsByDay = {
  date: string;
  firms: number;
  goes_preliminary: number;
  goes_confirmed: number;
  goes_dismissed: number;
  lightning: number;
};

export async function getAlertsByDay(daysBack = 7): Promise<AlertsByDay[]> {
  const db = getSupabase();
  const since = new Date(Date.now() - daysBack * DAY).toISOString();

  // Each GOES event metric is queried by its OWN timestamp window to avoid an
  // edge-bias: a row whose preliminary_sent_at is inside the window but whose
  // confirmed_sent_at/dismissed_at falls just outside (or vice-versa) was being
  // mis-bucketed when everything was filtered by preliminary_sent_at alone.
  const [firms, goesPreliminary, goesConfirmed, goesDismissed, lightning] =
    await Promise.all([
      db.from("ai_alerted_fires").select("alerted_at").gte("alerted_at", since),
      db
        .from("goes_alerted")
        .select("preliminary_sent_at")
        .gte("preliminary_sent_at", since),
      db
        .from("goes_alerted")
        .select("confirmed_sent_at")
        .gte("confirmed_sent_at", since),
      db
        .from("goes_alerted")
        .select("dismissed_at")
        .gte("dismissed_at", since),
      db.from("lightning_alerted").select("alerted_at").gte("alerted_at", since),
    ]);

  const days = new Map<string, AlertsByDay>();
  const blank = (date: string): AlertsByDay => ({
    date,
    firms: 0,
    goes_preliminary: 0,
    goes_confirmed: 0,
    goes_dismissed: 0,
    lightning: 0,
  });

  // Initialise window
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = dateKey(new Date(Date.now() - i * DAY));
    days.set(d, blank(d));
  }

  for (const r of firms.data ?? []) {
    const d = (r.alerted_at as string).slice(0, 10);
    if (days.has(d)) days.get(d)!.firms++;
  }
  for (const r of goesPreliminary.data ?? []) {
    const prelDay = (r.preliminary_sent_at as string).slice(0, 10);
    if (days.has(prelDay)) days.get(prelDay)!.goes_preliminary++;
  }
  for (const r of goesConfirmed.data ?? []) {
    if (!r.confirmed_sent_at) continue;
    const confDay = (r.confirmed_sent_at as string).slice(0, 10);
    if (days.has(confDay)) days.get(confDay)!.goes_confirmed++;
  }
  for (const r of goesDismissed.data ?? []) {
    if (!r.dismissed_at) continue;
    const dismDay = (r.dismissed_at as string).slice(0, 10);
    if (days.has(dismDay)) days.get(dismDay)!.goes_dismissed++;
  }
  for (const r of lightning.data ?? []) {
    const d = (r.alerted_at as string).slice(0, 10);
    if (days.has(d)) days.get(d)!.lightning++;
  }

  return Array.from(days.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((r) => ({ ...r, date: r.date.slice(5) }));
}

export async function getCronHealth(): Promise<
  { jobname: string; last_run: string | null; status: string | null; lag_minutes: number | null }[]
> {
  const db = getSupabase();
  // cron.job_run_details is privileged; we use a service-role select.
  const { data } = await db.rpc("clara_cron_health");
  return (data as never) ?? [];
}

export async function getGoesQuality(): Promise<{
  total7d: number;
  high_confidence: number;
  persistent: number;
  confirmation_rate: string;
}> {
  const db = getSupabase();
  const since = new Date(Date.now() - 7 * DAY).toISOString();
  const [{ count: total7d }, { count: high_conf }, { count: persistent }, { count: alertedTotal }, { count: alertedConfirmed }] =
    await Promise.all([
      db.from("goes_preliminary").select("*", { count: "exact", head: true }).gte("detected_at", since),
      db
        .from("goes_preliminary")
        .select("*", { count: "exact", head: true })
        .eq("high_confidence", true)
        .gte("detected_at", since),
      db
        .from("goes_preliminary")
        .select("*", { count: "exact", head: true })
        .gte("seen_in_scans", 2)
        .gte("detected_at", since),
      db
        .from("goes_alerted")
        .select("*", { count: "exact", head: true })
        .gte("preliminary_sent_at", since),
      db
        .from("goes_alerted")
        .select("*", { count: "exact", head: true })
        .not("confirmed_sent_at", "is", null)
        .gte("preliminary_sent_at", since),
    ]);
  const total = alertedTotal ?? 0;
  const confirmed = alertedConfirmed ?? 0;
  const rate = total > 0 ? `${Math.round((confirmed / total) * 100)}%` : "—";
  return {
    total7d: total7d ?? 0,
    high_confidence: high_conf ?? 0,
    persistent: persistent ?? 0,
    confirmation_rate: rate,
  };
}

// Flattened (lat, lng) -> province lookup built once from the cities dataset.
// `subscribers.city_name` only stores the city (no province), so we derive the
// province from each subscriber's coords by nearest-city match instead.
const CITY_PROVINCE_INDEX: { lat: number; lng: number; province: string }[] =
  PROVINCES.flatMap((p) =>
    p.cities.map((c) => ({ lat: c.lat, lng: c.lng, province: p.name }))
  );

function provinceForCoords(lat: number, lng: number): string {
  let best = "Desconocida";
  let bestDist = Number.POSITIVE_INFINITY;
  for (const c of CITY_PROVINCE_INDEX) {
    const d = haversineKm(lat, lng, c.lat, c.lng);
    if (d < bestDist) {
      bestDist = d;
      best = c.province;
    }
  }
  return best;
}

export async function getTopProvinces(): Promise<{ name: string; subs: number }[]> {
  const db = getSupabase();
  const { data } = await db.from("subscribers").select("lat, lng");
  const rows = (data ?? []) as Array<{ lat: number | null; lng: number | null }>;
  const counts = new Map<string, number>();
  for (const r of rows) {
    const lat = r.lat;
    const lng = r.lng;
    const province =
      lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
        ? provinceForCoords(lat, lng)
        : "Desconocida";
    counts.set(province, (counts.get(province) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, subs]) => ({ name, subs }))
    .sort((a, b) => b.subs - a.subs)
    .slice(0, 10);
}

export async function getBotCommands(daysBack = 7): Promise<{ command: string; count: number }[]> {
  const db = getSupabase();
  const since = new Date(Date.now() - daysBack * DAY).toISOString();
  const { data } = await db
    .from("bot_commands_log")
    .select("command")
    .gte("created_at", since);
  const counts = new Map<string, number>();
  for (const r of data ?? []) counts.set(r.command, (counts.get(r.command) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([command, count]) => ({ command, count }))
    .sort((a, b) => b.count - a.count);
}

// WHI-587 follow-up — filter funnel from per-scan stats
export type GoesRun = {
  scan_start: string;
  s3_key: string | null;
  fire_pixels_global: number;
  after_mask: number;
  after_polygon: number;
  after_urban: number;
  after_flaring: number;
  agricultural_count: number;
  after_dedup: number;
  inserted: number;
  persistent: number;
  total_seconds: number | null;
  created_at: string;
};

export async function getRecentGoesRuns(limit = 10): Promise<GoesRun[]> {
  const db = getSupabase();
  const { data } = await db
    .from("goes_sync_runs")
    .select(
      "scan_start, s3_key, fire_pixels_global, after_mask, after_polygon, after_urban, after_flaring, agricultural_count, after_dedup, inserted, persistent, total_seconds, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as GoesRun[];
}

export async function getFunnelAggregate(daysBack = 7): Promise<{
  scans: number;
  fire_pixels_global: number;
  after_mask: number;
  after_polygon: number;
  after_urban: number;
  after_flaring: number;
  after_dedup: number;
  inserted: number;
}> {
  const db = getSupabase();
  const since = new Date(Date.now() - daysBack * DAY).toISOString();
  const { data } = await db
    .from("goes_sync_runs")
    .select(
      "fire_pixels_global, after_mask, after_polygon, after_urban, after_flaring, after_dedup, inserted"
    )
    .gte("created_at", since);

  const rows = (data ?? []) as Array<{
    fire_pixels_global: number;
    after_mask: number;
    after_polygon: number;
    after_urban: number;
    after_flaring: number;
    after_dedup: number;
    inserted: number;
  }>;
  return {
    scans: rows.length,
    fire_pixels_global: rows.reduce((a, r) => a + (r.fire_pixels_global ?? 0), 0),
    after_mask: rows.reduce((a, r) => a + (r.after_mask ?? 0), 0),
    after_polygon: rows.reduce((a, r) => a + (r.after_polygon ?? 0), 0),
    after_urban: rows.reduce((a, r) => a + (r.after_urban ?? 0), 0),
    after_flaring: rows.reduce((a, r) => a + (r.after_flaring ?? 0), 0),
    after_dedup: rows.reduce((a, r) => a + (r.after_dedup ?? 0), 0),
    inserted: rows.reduce((a, r) => a + (r.inserted ?? 0), 0),
  };
}

// Re-export helper for typed series consumers
export { fillDays };

/**
 * Detecta si el cron `fires-daily-snapshot` está stuck insertando count=0
 * mientras `fires_cache` tiene focos activos. Es defensa contra la regresión
 * del bug del 2026-04-11 (snapshot corrió 41 días con count=0 porque el
 * horario UTC coincidía con cache casi vacío).
 *
 * Niveles:
 * - "ok": último snapshot tiene count > 0, o todo (snapshot + cache) está
 *   en 0 → baja temporada legítima.
 * - "warning": ≥2 días consecutivos con count=0 al final, pero cache también
 *   en 0 → posiblemente baja temporada, pero raro.
 * - "danger": último snapshot count=0 AND cache tiene focos > 0 →
 *   contradicción interna, snapshot roto.
 */
export async function getSnapshotHealth(): Promise<{
  level: "ok" | "warning" | "danger";
  lastDate: string | null;
  lastCount: number;
  consecutiveZeroDays: number;
  liveFiresCount: number;
  message: string;
}> {
  const db = getSupabase();

  const [{ data: history }, { data: cache }] = await Promise.all([
    db
      .from("fires_daily_history")
      .select("date, count")
      .order("date", { ascending: false })
      .limit(14),
    db.from("fires_cache").select("count").eq("id", 1).maybeSingle(),
  ]);

  const liveFiresCount = (cache as { count: number } | null)?.count ?? 0;
  const rows = (history ?? []) as Array<{ date: string; count: number }>;

  if (rows.length === 0) {
    return {
      level: "warning",
      lastDate: null,
      lastCount: 0,
      consecutiveZeroDays: 0,
      liveFiresCount,
      message: "Sin filas en fires_daily_history — el cron nunca corrió",
    };
  }

  let consecutiveZeroDays = 0;
  for (const r of rows) {
    if (r.count === 0) consecutiveZeroDays++;
    else break;
  }

  const last = rows[0];

  if (last.count === 0 && liveFiresCount > 0) {
    return {
      level: "danger",
      lastDate: last.date,
      lastCount: 0,
      consecutiveZeroDays,
      liveFiresCount,
      message:
        `Snapshot insertó count=0 pero fires_cache tiene ${liveFiresCount} focos. ` +
        `Probable timing bug del cron (ver scripts/sql/fix-fires-daily-snapshot-schedule.sql)`,
    };
  }

  if (consecutiveZeroDays >= 2 && liveFiresCount === 0) {
    return {
      level: "warning",
      lastDate: last.date,
      lastCount: last.count,
      consecutiveZeroDays,
      liveFiresCount,
      message: `${consecutiveZeroDays} días consecutivos con count=0. Cache también vacío — verificar si es baja temporada real`,
    };
  }

  return {
    level: "ok",
    lastDate: last.date,
    lastCount: last.count,
    consecutiveZeroDays,
    liveFiresCount,
    message: `Último snapshot: ${last.count} focos el ${last.date}`,
  };
}
