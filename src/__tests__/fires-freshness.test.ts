import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import {
  decideFreshnessAction,
  decideMonitorActions,
  FRESHNESS_THRESHOLD_MINUTES,
  buildStaleAlert,
  buildRecoveredAlert,
} from "@/lib/fires-freshness";

describe("decideFreshnessAction", () => {
  it("alerts when stale and not yet alerted", () => {
    expect(decideFreshnessAction({ ageMinutes: 90, thresholdMinutes: 60, alerted: false })).toBe("alert_stale");
  });
  it("stays silent when stale and already alerted", () => {
    expect(decideFreshnessAction({ ageMinutes: 90, thresholdMinutes: 60, alerted: true })).toBe("none");
  });
  it("signals recovery when fresh again after an alert", () => {
    expect(decideFreshnessAction({ ageMinutes: 5, thresholdMinutes: 60, alerted: true })).toBe("alert_recovered");
  });
  it("stays silent when fresh and never alerted", () => {
    expect(decideFreshnessAction({ ageMinutes: 5, thresholdMinutes: 60, alerted: false })).toBe("none");
  });
  it("treats exactly-at-threshold as fresh (strict greater-than)", () => {
    expect(decideFreshnessAction({ ageMinutes: 60, thresholdMinutes: 60, alerted: false })).toBe("none");
  });
});

describe("decideMonitorActions", () => {
  const base = { ageMinutes: 5, thresholdMinutes: 60, staleAlerted: false };

  it("alerts key-invalid when the error flag appears", () => {
    const r = decideMonitorActions({ ...base, hasKeyError: true, keyAlerted: false });
    expect(r.key).toBe("alert_key_invalid");
  });
  it("does not repeat the key alert while flagged (anti-spam)", () => {
    const r = decideMonitorActions({ ...base, hasKeyError: true, keyAlerted: true });
    expect(r.key).toBe("none");
  });
  it("signals key recovery when the flag clears after an alert", () => {
    const r = decideMonitorActions({ ...base, hasKeyError: false, keyAlerted: true });
    expect(r.key).toBe("alert_key_recovered");
  });
  it("stays silent with no flag and no outstanding alert", () => {
    const r = decideMonitorActions({ ...base, hasKeyError: false, keyAlerted: false });
    expect(r.key).toBe("none");
    expect(r.freshness).toBe("none");
  });
  it("suppresses the generic staleness alert while the key error is active", () => {
    const r = decideMonitorActions({
      ageMinutes: 90,
      thresholdMinutes: 60,
      staleAlerted: false,
      hasKeyError: true,
      keyAlerted: true,
    });
    expect(r.freshness).toBe("none");
  });
  it("keeps normal staleness behavior when there is no key error", () => {
    const r = decideMonitorActions({
      ageMinutes: 90,
      thresholdMinutes: 60,
      staleAlerted: false,
      hasKeyError: false,
      keyAlerted: false,
    });
    expect(r.freshness).toBe("alert_stale");
  });
  it("suppresses staleness while the key-invalid alert itself is firing", () => {
    const r = decideMonitorActions({
      ageMinutes: 90,
      thresholdMinutes: 60,
      staleAlerted: false,
      hasKeyError: true,
      keyAlerted: false,
    });
    expect(r).toEqual({ key: "alert_key_invalid", freshness: "none" });
  });
  // Deliberate dual-message case the route documents: a key recovery and an
  // independently-stale (not-yet-alerted) cache can both be true in the same
  // run, and each gets its own accurate Telegram message rather than being
  // merged or suppressed.
  it("fires both key-recovered and stale-not-yet-alerted in the same run", () => {
    const r = decideMonitorActions({
      ageMinutes: 90,
      thresholdMinutes: 60,
      staleAlerted: false,
      hasKeyError: false,
      keyAlerted: true,
    });
    expect(r).toEqual({ key: "alert_key_recovered", freshness: "alert_stale" });
  });
});

/**
 * 2026-08-26 — DOS FALSAS ALARMAS EN UNA MAÑANA, a las 07:45 y a las 10:45.
 *
 * El monitor avisó "sin datos" con el caché sano: en ese momento tenía 6
 * minutos y entraban 54 detecciones por hora. Lo que había fallado era LA
 * LECTURA, no el dato.
 *
 * El route hacía `const { data: cache } = await db...` — **descartando el
 * error**. Un fallo transitorio de la base devuelve `data: null`, que el
 * código interpretaba como "no hay fila = el dato falta = problema". Esa
 * lectura es correcta para "no hay fila" y falsa para "no pude leer", y las
 * dos llegan como `null`. Ese mismo día hubo un `db_read_failed` en otro
 * endpoint, o sea que la base tuvo problemas de lectura reales.
 *
 * "No sé" no es "está roto". Y en un producto de alerta de incendios importa
 * el doble: un vigilante que da falsas alarmas se deja de leer justo antes de
 * la que importa.
 */
describe("decideMonitorActions — cuando no se pudo leer el caché", () => {
  const base = {
    thresholdMinutes: FRESHNESS_THRESHOLD_MINUTES,
    hasKeyError: false,
    keyAlerted: false,
  };

  it("NO avisa que el dato está viejo si la lectura falló", () => {
    const r = decideMonitorActions({
      ...base,
      ageMinutes: Number.POSITIVE_INFINITY, // lo que produce una lectura vacía
      staleAlerted: false,
      cacheReadFailed: true,
    });
    expect(r.freshness).toBe("none");
  });

  it("tampoco canta recuperación: no sabemos nada", () => {
    // La otra dirección del mismo error. Si hay una alarma abierta y la lectura
    // falla, dar por recuperado sería cerrar un incidente sin haberlo mirado.
    const r = decideMonitorActions({
      ...base,
      ageMinutes: 1,
      staleAlerted: true,
      cacheReadFailed: true,
    });
    expect(r.freshness).toBe("none");
  });

  it("con la lectura OK sigue avisando igual que siempre", () => {
    // La mitad que impide 'arreglarlo' silenciando todo.
    const viejo = decideMonitorActions({
      ...base,
      ageMinutes: FRESHNESS_THRESHOLD_MINUTES + 1,
      staleAlerted: false,
      cacheReadFailed: false,
    });
    expect(viejo.freshness).toBe("alert_stale");

    const recuperado = decideMonitorActions({
      ...base,
      ageMinutes: 1,
      staleAlerted: true,
      cacheReadFailed: false,
    });
    expect(recuperado.freshness).toBe("alert_recovered");
  });

  it("un problema de clave sigue avisando aunque la lectura falle", () => {
    // El flag de clave inválida vive en otra tabla: que no se pueda leer el
    // caché no es motivo para callar ESE aviso, que es el más accionable.
    const r = decideMonitorActions({
      ...base,
      ageMinutes: Number.POSITIVE_INFINITY,
      staleAlerted: false,
      hasKeyError: true,
      cacheReadFailed: true,
    });
    expect(r.key).toBe("alert_key_invalid");
  });
});

/**
 * `cacheReadFailed` puede estar impecable y no servir de nada si el route no lo
 * pasa — la misma forma de falla que el propio bug: el dato estaba disponible
 * (el `error` de Supabase) y el código lo descartaba.
 */
describe("el monitor mira el error de lectura, no sólo el dato", () => {
  const ROUTE = "src/app/api/monitor/fires-freshness/route.ts";
  const codigo = readFileSync(resolve(process.cwd(), ROUTE), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

  it("desestructura el error de la consulta", () => {
    expect(codigo).toMatch(/error:\s*cacheError/);
  });

  it("se lo pasa a la decisión", () => {
    expect(codigo).toMatch(/cacheReadFailed:\s*Boolean\(cacheError\)/);
  });
});

/**
 * 🔴 EL AVISO TE MANDABA A BUSCAR DONDE NO ESTABA EL PROBLEMA.
 *
 * El 2026-09-04 a las 18:37 ART llegó "FIRMS sin actualizar — revisá el cron
 * fires-fetch / pg_net". Los dos estaban impecables: el cron corrió sus 24
 * veces y pg_net encoló bien. La que se cayó fue NASA, que devolvió HTTP 500
 * en cuatro pedidos seguidos (17:45, 18:00, 18:15 y 18:30), dejando el dato
 * congelado 75 minutos.
 *
 * El monitor no podía saberlo porque el paso 2 del sync descartaba en silencio
 * toda respuesta que no fuera 200. Ahora la registra, y el texto del aviso
 * nombra al culpable en vez de mandar a revisar lo que funciona.
 */
describe("buildStaleAlert", () => {
  const base = { ageLabel: "65 min", fetchedAt: new Date("2026-09-04T20:32:00Z") };

  it("cuando NASA viene fallando, la nombra y no manda a revisar el cron", () => {
    const msg = buildStaleAlert({ ...base, upstreamError: "2026-09-04 21:30 | HTTP 500" });
    expect(msg).toContain("NASA");
    expect(msg).toContain("HTTP 500");
    // Lo que NO tiene que decir: el cron y pg_net están sanos en este caso.
    expect(msg).not.toContain("revisá el cron");
  });

  it("sin error de NASA registrado, sigue apuntando al cron (que ahí sí es sospechoso)", () => {
    const msg = buildStaleAlert({ ...base, upstreamError: null });
    expect(msg).toContain("revisá el cron");
    expect(msg).not.toContain("NASA está");
  });

  it("los dos mensajes dicen hace cuánto que el dato no se mueve", () => {
    expect(buildStaleAlert({ ...base, upstreamError: null })).toContain("65 min");
    expect(buildStaleAlert({ ...base, upstreamError: "x | HTTP 503" })).toContain("65 min");
  });

  it("aguanta no tener fecha del último fetch", () => {
    const msg = buildStaleAlert({ ageLabel: "sin dato", fetchedAt: null, upstreamError: null });
    expect(msg).toContain("sin dato");
  });
});

describe("buildRecoveredAlert", () => {
  it("dice que volvió y hace cuánto", () => {
    const msg = buildRecoveredAlert({ ageLabel: "5 min" });
    expect(msg).toContain("5 min");
    expect(msg).toContain("recuper");
  });
});

describe("buildStaleAlert — escapado de HTML", () => {
  /**
   * El texto va dentro de <code> en un mensaje HTML de Telegram. Un `<` o un
   * `&` sin escapar hacen que Telegram rechace el mensaje entero con 400: el
   * aviso del incidente se pierde JUSTO cuando hay un incidente.
   */
  it("escapa lo que viene de NASA antes de meterlo en el mensaje", () => {
    const msg = buildStaleAlert({
      ageLabel: "65 min",
      fetchedAt: null,
      upstreamError: '<html>error & "otro"</html>',
    });
    expect(msg).toContain("&lt;html&gt;");
    expect(msg).toContain("&amp;");
    expect(msg).not.toContain("<html>");
  });
});
