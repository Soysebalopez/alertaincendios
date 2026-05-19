import "server-only";
import { getSupabase } from "@/lib/supabase";
import type { SatelliteTLE } from "@/lib/satellites";

/**
 * Server-side fetch de TLEs desde `satellite_tles`. WHI-753/754.
 *
 * Usa SERVICE_ROLE_KEY — NO importar desde código cliente. El import de
 * `server-only` rompe el build si esto se cuela en un bundle del browser.
 *
 * Devuelve [] si la query falla o no hay rows (graceful degradation: el badge
 * del hero y la capa de satélites del mapa simplemente no renderizan).
 */
export async function fetchTLEs(): Promise<SatelliteTLE[]> {
  try {
    const db = getSupabase();
    const { data, error } = await db
      .from("satellite_tles")
      .select("norad_id, name, line1, line2, fetched_at");
    if (error || !data) return [];
    return data as SatelliteTLE[];
  } catch {
    return [];
  }
}
