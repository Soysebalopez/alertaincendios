/**
 * NASA FIRMS client — fetches active fire hotspots for Argentina.
 *
 * Uses the VIIRS SNPP sensor (375m resolution, best for small fires).
 * Bounding box covers continental Argentina.
 * Cache: 15 min in-memory to avoid rate limits.
 */

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

let _cache: { data: FirePoint[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function getFirmsUrl(): string {
  const key = process.env.FIRMS_API_KEY || "OPEN_KEY";
  return `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_SNPP_NRT/${BBOX.west},${BBOX.south},${BBOX.east},${BBOX.north}/1`;
}

export async function fetchFires(): Promise<FirePoint[]> {
  if (_cache && Date.now() - _cache.timestamp < CACHE_TTL_MS) {
    return _cache.data;
  }

  const res = await fetch(getFirmsUrl());
  if (!res.ok) {
    console.error(`FIRMS responded ${res.status}`);
    return _cache?.data ?? [];
  }

  const csv = await res.text();
  const fires = parseFirmsCSV(csv);
  _cache = { data: fires, timestamp: Date.now() };
  return fires;
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
