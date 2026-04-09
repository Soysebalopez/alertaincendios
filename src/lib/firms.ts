/**
 * NASA FIRMS client — fetches active fire hotspots for Argentina.
 *
 * FIRMS blocks datacenter IPs (Vercel, AWS, etc), so we use a two-layer strategy:
 * 1. fetchFiresFromFirms() — direct call, works from residential IPs only
 * 2. fetchFires() — reads from Supabase fires_cache table (works everywhere)
 *
 * A sync endpoint (/api/fires/sync) is called externally to populate the cache.
 */

import { getSupabase } from "./supabase";

export interface FirePoint {
  latitude: number;
  longitude: number;
  brightness: number;
  confidence: string;
  acqDate: string;
  acqTime: string;
  frp: number;
}

// Argentina bounding box (continental)
const BBOX = {
  west: -73.6,
  south: -55.1,
  east: -53.6,
  north: -21.8,
};

function getFirmsUrl(): string {
  const key = process.env.FIRMS_API_KEY || "OPEN_KEY";
  return `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_SNPP_NRT/${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north}/1`;
}

/**
 * Reads cached fire data from Supabase. Used by all server-side code on Vercel.
 * Deduplicates by lat_lng_date key to guard against accumulation in fires_cache.
 */
export async function fetchFires(): Promise<FirePoint[]> {
  try {
    const { data } = await getSupabase()
      .from("fires_cache")
      .select("fires")
      .eq("id", 1)
      .single();

    if (data?.fires) {
      return deduplicateFires(data.fires as FirePoint[]);
    }
  } catch (e) {
    console.error("fires_cache read error:", e);
  }
  return [];
}

/** Remove duplicate fire points (same lat/lng/date = same detection). */
function deduplicateFires(fires: FirePoint[]): FirePoint[] {
  const seen = new Set<string>();
  return fires.filter((f) => {
    const key = `${f.latitude.toFixed(3)}_${f.longitude.toFixed(3)}_${f.acqDate}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Fetches directly from NASA FIRMS and writes to Supabase cache.
 * Only works from residential IPs (local machine, not Vercel).
 */
export async function syncFiresFromFirms(): Promise<{
  count: number;
  error?: string;
}> {
  const res = await fetch(getFirmsUrl());
  if (!res.ok) {
    return { count: 0, error: `FIRMS responded ${res.status}` };
  }

  const csv = await res.text();
  const fires = deduplicateFires(parseFirmsCSV(csv));

  const { error } = await getSupabase()
    .from("fires_cache")
    .upsert(
      {
        id: 1,
        fires: JSON.parse(JSON.stringify(fires)),
        count: fires.length,
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    );

  if (error) {
    return { count: fires.length, error: error.message };
  }

  return { count: fires.length };
}

function parseFirmsCSV(csv: string): FirePoint[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(",");
  const idx = {
    lat: headers.indexOf("latitude"),
    lng: headers.indexOf("longitude"),
    bright: headers.indexOf("bright_ti4"),
    conf: headers.indexOf("confidence"),
    date: headers.indexOf("acq_date"),
    time: headers.indexOf("acq_time"),
    frp: headers.indexOf("frp"),
  };

  if (idx.lat === -1 || idx.lng === -1) return [];

  return lines
    .slice(1)
    .map((line) => {
      const cols = line.split(",");
      return {
        latitude: parseFloat(cols[idx.lat]),
        longitude: parseFloat(cols[idx.lng]),
        brightness: idx.bright >= 0 ? parseFloat(cols[idx.bright]) : 0,
        confidence: idx.conf >= 0 ? cols[idx.conf] : "unknown",
        acqDate: idx.date >= 0 ? cols[idx.date] : "",
        acqTime: idx.time >= 0 ? cols[idx.time] : "",
        frp: idx.frp >= 0 ? parseFloat(cols[idx.frp]) : 0,
      };
    })
    .filter(
      (f) =>
        !isNaN(f.latitude) &&
        !isNaN(f.longitude) &&
        f.confidence !== "low" &&
        f.confidence !== "l"
    );
}
