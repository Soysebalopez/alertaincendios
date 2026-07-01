/**
 * Argentina-local time helpers.
 *
 * Argentina is UTC-3 year-round (no DST), so a fixed -3h shift is exact. These
 * centralize the ad-hoc `getUTCHours() - 3` / date-slice computations that were
 * duplicated across the bot webhook and the prevention cron (audit B7).
 */
const ART_OFFSET_MS = 3 * 3600_000;

/** Current Argentina-local date as `YYYY-MM-DD`. */
export function artToday(): string {
  return new Date(Date.now() - ART_OFFSET_MS).toISOString().slice(0, 10);
}

/** Current Argentina-local hour of day (0–23). */
export function artHour(): number {
  return new Date(Date.now() - ART_OFFSET_MS).getUTCHours();
}
