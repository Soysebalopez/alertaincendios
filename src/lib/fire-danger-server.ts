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
export async function getProvinceDanger(
  provinceId: string
): Promise<ProvinceDanger | null> {
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
    if (dates.length === 0) return null;
    const provinceName =
      PROVINCES.find((p) => p.id === provinceId)?.name ?? provinceId;

    return { provinceId, provinceName, computedAt, dates, zones: builtZones };
  } catch {
    return null;
  }
}
