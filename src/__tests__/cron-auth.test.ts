import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isCronAuthorized } from "../lib/cron-auth";

/**
 * Contract test: H-03 (timing-safe cron auth).
 *
 * El helper debe:
 *  - Aceptar el secret correcto vía query string o Bearer token.
 *  - Rechazar secrets incorrectos (incluso si comparten prefijo).
 *  - Rechazar secrets de length distinto SIN comparar byte por byte.
 *  - Fail-closed si la env var no está seteada.
 *
 * Si alguien re-introduce un `===` directo, el test sigue pasando para los
 * casos triviales — pero la inspección del código manual (más el comentario
 * del helper) deja claro el contrato. Vale la pena un test sólo del comportamiento.
 */

const REAL_SECRET = "super-secreto-de-32-chars-largoXX";

function makeRequest(opts: { secret?: string; bearer?: string } = {}): Request {
  const url = new URL("https://example.com/api/test");
  if (opts.secret) url.searchParams.set("secret", opts.secret);
  const headers = new Headers();
  if (opts.bearer) headers.set("authorization", `Bearer ${opts.bearer}`);
  return new Request(url, { headers });
}

describe("isCronAuthorized (H-03)", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = REAL_SECRET;
  });
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("acepta secret correcto vía query", () => {
    const req = makeRequest({ secret: REAL_SECRET });
    expect(isCronAuthorized(req)).toBe(true);
  });

  it("acepta secret correcto vía Bearer", () => {
    const req = makeRequest({ bearer: REAL_SECRET });
    expect(isCronAuthorized(req)).toBe(true);
  });

  it("rechaza secret incorrecto", () => {
    const req = makeRequest({ secret: "no-es-el-correcto-12345678901234XX" });
    expect(isCronAuthorized(req)).toBe(false);
  });

  it("rechaza secret con prefijo correcto pero suffix distinto", () => {
    // Si el helper hiciera `===` esto fallaría más rápido que el caso de
    // length distinto — verificamos que ambos caminos dan false.
    const req = makeRequest({ secret: REAL_SECRET.slice(0, -2) + "YY" });
    expect(isCronAuthorized(req)).toBe(false);
  });

  it("rechaza secret de length distinto sin tirar excepción", () => {
    // timingSafeEqual tira si los buffers tienen length distinto. El helper
    // debe hacer el length-check antes para devolver false limpio.
    expect(() => isCronAuthorized(makeRequest({ secret: "corto" }))).not.toThrow();
    expect(isCronAuthorized(makeRequest({ secret: "corto" }))).toBe(false);

    const muyLargo = REAL_SECRET + "extra";
    expect(isCronAuthorized(makeRequest({ secret: muyLargo }))).toBe(false);
  });

  it("rechaza request sin secret ni bearer", () => {
    expect(isCronAuthorized(makeRequest())).toBe(false);
  });

  it("fail-closed: si CRON_SECRET no está seteado, rechaza todo", () => {
    delete process.env.CRON_SECRET;
    expect(isCronAuthorized(makeRequest({ secret: "lo-que-sea" }))).toBe(false);
    expect(isCronAuthorized(makeRequest({ bearer: REAL_SECRET }))).toBe(false);
  });

  it("Bearer prefix case-insensitive", () => {
    // El regex /^Bearer\s+/i debería matchear "bearer" minúscula también.
    const url = new URL("https://example.com/api/test");
    const headers = new Headers({ authorization: `bearer ${REAL_SECRET}` });
    const req = new Request(url, { headers });
    expect(isCronAuthorized(req)).toBe(true);
  });
});
