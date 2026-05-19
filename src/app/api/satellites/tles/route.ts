import { NextResponse } from "next/server";
import { fetchTLEs } from "@/lib/satellites-server";

/**
 * GET /api/satellites/tles
 *
 * WHI-755 — Endpoint público (read-only) que devuelve los TLEs almacenados en
 * `satellite_tles`. Lo consume `<CitySatelliteCoverage>` desde el cliente para
 * computar cobertura sin requerir un cron job ni propagación server-side por
 * ciudad (78 páginas SSG, propagación time-dependent no se puede pre-computar).
 *
 * Los TLEs son **información pública** publicada por NORAD vía CelesTrak —
 * exponerlos no implica ningún riesgo de seguridad. La tabla `satellite_tles`
 * tiene RLS pero la pasamos por nuestro server (que usa SERVICE_ROLE) y
 * devolvemos solo los campos necesarios para SGP4.
 */
export async function GET() {
  const tles = await fetchTLEs();
  return NextResponse.json(
    { tles },
    {
      headers: {
        // 1h CDN cache, 5min stale-while-revalidate. Los TLEs cambian 1x/día
        // (cron 04:30 UTC) así que 1h es seguro y reduce muchísimo el load.
        "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=300",
      },
    }
  );
}
