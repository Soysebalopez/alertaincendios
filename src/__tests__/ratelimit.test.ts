import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, clientIp, isInternalCall } from "../lib/ratelimit";

/**
 * Contract test: H-10 (rate limit). Sin Upstash configurado, el helper cae al
 * backend in-memory. Verificamos:
 *  - Que las primeras N requests pasan y N+1 falla.
 *  - Que namespaces distintos NO comparten contador.
 *  - Que la ventana se resetea correctamente.
 *  - isInternalCall fail-closed sin CRON_SECRET.
 *  - clientIp prefiere x-forwarded-for sobre x-real-ip.
 */

describe("rate limit (H-10)", () => {
  beforeEach(() => {
    // Sin Upstash → fuerza backend in-memory.
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("permite hasta limit requests; rechaza la siguiente", async () => {
    const opts = {
      key: "test-burst",
      limit: 3,
      windowSec: 60,
      namespace: "burst-test",
    };

    for (let i = 0; i < 3; i++) {
      const res = await checkRateLimit(opts);
      expect(res.ok).toBe(true);
      expect(res.remaining).toBe(2 - i);
    }

    const fourth = await checkRateLimit(opts);
    expect(fourth.ok).toBe(false);
    expect(fourth.remaining).toBe(0);
  });

  it("namespaces distintos no comparten contador", async () => {
    const a = await checkRateLimit({ key: "x", limit: 1, windowSec: 60, namespace: "ns-a" });
    const b = await checkRateLimit({ key: "x", limit: 1, windowSec: 60, namespace: "ns-b" });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it("keys distintas no comparten contador", async () => {
    const a = await checkRateLimit({ key: "ip-A", limit: 1, windowSec: 60, namespace: "shared" });
    const b = await checkRateLimit({ key: "ip-B", limit: 1, windowSec: 60, namespace: "shared" });
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
  });

  it("ventana corta se resetea", async () => {
    const opts = {
      key: "test-window",
      limit: 1,
      windowSec: 1,
      namespace: "window-test",
    };
    const first = await checkRateLimit(opts);
    expect(first.ok).toBe(true);
    const second = await checkRateLimit(opts);
    expect(second.ok).toBe(false);

    // Esperar a que se resetee la ventana (1s + buffer).
    await new Promise((r) => setTimeout(r, 1100));
    const third = await checkRateLimit(opts);
    expect(third.ok).toBe(true);
  });

  it("backend in-memory cuando Upstash no configurado", async () => {
    const res = await checkRateLimit({
      key: "any",
      limit: 5,
      windowSec: 60,
      namespace: "backend-check",
    });
    expect(res.backend).toBe("memory");
  });
});

describe("isInternalCall (H-10 bypass)", () => {
  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("rechaza si CRON_SECRET no está seteado (fail-closed)", () => {
    delete process.env.CRON_SECRET;
    const req = new Request("https://x.com", {
      headers: { "x-clara-internal": "anything" },
    });
    expect(isInternalCall(req)).toBe(false);
  });

  it("acepta si el header matchea CRON_SECRET", () => {
    process.env.CRON_SECRET = "test-secret-1234";
    const req = new Request("https://x.com", {
      headers: { "x-clara-internal": "test-secret-1234" },
    });
    expect(isInternalCall(req)).toBe(true);
  });

  it("rechaza si el header no matchea", () => {
    process.env.CRON_SECRET = "real-secret";
    const req = new Request("https://x.com", {
      headers: { "x-clara-internal": "fake-secret" },
    });
    expect(isInternalCall(req)).toBe(false);
  });
});

describe("clientIp", () => {
  it("prioriza x-real-ip (Vercel) sobre el x-forwarded-for spoofeable", () => {
    // B5 — el primer segmento de x-forwarded-for lo provee el cliente y se
    // puede falsificar; x-real-ip lo setea Vercel y es confiable.
    const req = new Request("https://x.com", {
      headers: {
        "x-forwarded-for": "1.2.3.4, 5.6.7.8",
        "x-real-ip": "9.10.11.12",
      },
    });
    expect(clientIp(req)).toBe("9.10.11.12");
  });

  it("usa x-real-ip si no hay x-forwarded-for", () => {
    const req = new Request("https://x.com", {
      headers: { "x-real-ip": "9.10.11.12" },
    });
    expect(clientIp(req)).toBe("9.10.11.12");
  });

  it("cae al ÚLTIMO hop de x-forwarded-for (el más confiable) si no hay x-real-ip", () => {
    const req = new Request("https://x.com", {
      headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" },
    });
    expect(clientIp(req)).toBe("5.6.7.8");
  });

  it("devuelve 'anon' sin headers", () => {
    const req = new Request("https://x.com");
    expect(clientIp(req)).toBe("anon");
  });
});
