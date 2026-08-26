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
  /**
   * La lectura de `fires_cache` falló (no que la fila esté vacía: que no se
   * pudo leer). Ver abajo por qué no es lo mismo.
   */
  cacheReadFailed?: boolean;
}): { freshness: FreshnessAction; key: KeyAction } {
  let key: KeyAction = "none";
  if (input.hasKeyError && !input.keyAlerted) key = "alert_key_invalid";
  else if (!input.hasKeyError && input.keyAlerted) key = "alert_key_recovered";

  // 🔴 "NO PUDE LEER" NO ES "NO HAY DATOS", Y LAS DOS LLEGAN COMO null.
  //
  // El 2026-08-26 el monitor dio dos falsas alarmas (07:45 y 10:45) con el
  // caché sano —6 minutos de antigüedad, 54 detecciones por hora entrando—.
  // El route hacía `const { data: cache } = await db...`, descartando el error:
  // un fallo transitorio de la base devuelve `data: null`, que se leía como
  // "no hay fila = el dato falta". Ese mismo día hubo un `db_read_failed` real
  // en otro endpoint.
  //
  // Ante una lectura fallida no se avisa NADA: ni que está viejo ni que se
  // recuperó. Dar por recuperado sería cerrar un incidente sin haberlo mirado.
  // El aviso de clave inválida SÍ sigue, porque su flag vive en otra tabla.
  const freshness = input.hasKeyError || input.cacheReadFailed
    ? "none"
    : decideFreshnessAction({
        ageMinutes: input.ageMinutes,
        thresholdMinutes: input.thresholdMinutes,
        alerted: input.staleAlerted,
      });

  return { freshness, key };
}
