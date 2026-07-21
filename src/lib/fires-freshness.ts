/**
 * Decide whether to notify about FIRMS data freshness. Pure — no I/O. The caller
 * reads fires_cache.fetched_at and the anti-spam flag, passes them in, and acts
 * on the returned transition. `alerted` = a stale alert is currently outstanding.
 */
export type FreshnessAction = "none" | "alert_stale" | "alert_recovered";

/**
 * Minutes since `fires_cache.fetched_at` after which the cache is considered
 * stale. Single source of truth shared by the freshness monitor
 * (`/api/monitor/fires-freshness`) and `/rotarkey`'s conditional pre-arm check
 * — both must agree on the same threshold or the two sides can disagree on
 * whether the cache is stale at rotation time.
 */
export const FRESHNESS_THRESHOLD_MINUTES = 60;

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

/**
 * Key-invalidation alert transitions. `hasError` mirrors the presence of the
 * `_clara_config.firms_sync_error` flag written by the SQL body guard;
 * `alerted` mirrors `firms_key_alerted_at` (anti-spam).
 */
export type KeyAction = "none" | "alert_key_invalid" | "alert_key_recovered";

/**
 * Combined monitor decision. While a key error is active the specific key
 * alert supersedes the generic staleness alert: the guard stops `fetched_at`
 * from advancing during a key incident, so without this precedence the
 * monitor would fire a redundant "FIRMS sin actualizar" 60 min later.
 */
export function decideMonitorActions(input: {
  ageMinutes: number;
  thresholdMinutes: number;
  staleAlerted: boolean;
  hasKeyError: boolean;
  keyAlerted: boolean;
}): { freshness: FreshnessAction; key: KeyAction } {
  let key: KeyAction = "none";
  if (input.hasKeyError && !input.keyAlerted) key = "alert_key_invalid";
  else if (!input.hasKeyError && input.keyAlerted) key = "alert_key_recovered";

  const freshness = input.hasKeyError
    ? "none"
    : decideFreshnessAction({
        ageMinutes: input.ageMinutes,
        thresholdMinutes: input.thresholdMinutes,
        alerted: input.staleAlerted,
      });

  return { freshness, key };
}
