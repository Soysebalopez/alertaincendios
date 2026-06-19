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
