/**
 * Thresholds para el panel /dashboard/superadmin.
 *
 * Estos valores definen QUÉ se considera "zombi", "silencioso" o "activo".
 * Ajustá los números si la definición cambia — la página los lee directamente.
 *
 * Notas de criterio:
 * - ZOMBIE_AFTER_DAYS: el bot es pasivo (el usuario no necesita escribir para
 *   recibir alertas), entonces un sub sin comandos por 2 meses puede seguir
 *   siendo válido. 60d balancea "sin actividad" sin marcar falsos positivos.
 * - SILENT_AFTER_DAYS: cuántos días sin recibir alertas antes de marcar al sub
 *   como "silencioso" (riesgo de churn por falta de valor percibido). 30d
 *   atraviesa al menos una semana de estación activa típica.
 * - ACTIVE_COMMANDS_DAYS: ventana para considerar un sub "activo" (usó algún
 *   comando). 30d es estándar producto.
 * - CUARTEL_MIN_SUBS: mínimo de subs fireman con cuartel_name = X para
 *   considerar el cuartel "real". 1 es laxo (ideal mientras el rol es nuevo).
 */
export const SUPERADMIN_CONFIG = {
  ZOMBIE_AFTER_DAYS: 60,
  SILENT_AFTER_DAYS: 30,
  ACTIVE_COMMANDS_DAYS: 30,
  CUARTEL_MIN_SUBS: 1,
  // Trends y latencias
  TREND_DAYS: 30,
  LATENCY_BUCKETS_MIN: [5, 15, 30, 60, 120, 240, 480] as const,
} as const;
