/**
 * Deep-link payloads: t.me/alertaforestal_bot?start=<payload> reaches the bot
 * as "/start <payload>" (P1-4, WHI-907 part 9).
 *
 *  - `src-<slug>`    campaign attribution (QR, radio…) → source "campaign:<slug>".
 *  - `ciudad-<slug>` subscribe straight to a listed city; the Bahía Blanca page
 *                    links `ciudad-bahia-blanca` → source "campaign:ciudad-<slug>".
 *
 * Anything else is an organic start (null).
 */
import type { City } from "@/lib/argentina-cities";
import { findCityBySlug } from "@/lib/city-slug";

export type StartPayload =
  | { kind: "campaign"; source: string }
  | { kind: "city"; source: string; city: City; provinceName: string };

const CAMPAIGN = /^src-([a-z0-9-]{1,48})$/;
const CITY = /^ciudad-([a-z0-9-]{1,48})$/;

export function parseStartPayload(payload: string): StartPayload | null {
  const p = payload.trim().toLowerCase().slice(0, 64);

  const campaign = CAMPAIGN.exec(p);
  if (campaign) return { kind: "campaign", source: `campaign:${campaign[1]}` };

  const city = CITY.exec(p);
  const match = city ? findCityBySlug(city[1]) : null;
  if (city && match) {
    return {
      kind: "city",
      source: `campaign:ciudad-${city[1]}`,
      city: match.city,
      provinceName: match.province.name,
    };
  }
  return null;
}
