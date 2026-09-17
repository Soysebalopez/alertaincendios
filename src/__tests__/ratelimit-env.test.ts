import { describe, expect, it } from "vitest";
import { resolveRedisEnv } from "@/lib/ratelimit";

/**
 * La integración de Upstash en Vercel no publica `UPSTASH_REDIS_REST_*`: al
 * conectar el store, el proyecto recibe `KV_REST_API_URL` y `KV_REST_API_TOKEN`.
 * AlertaForestal quedó conectado el 17/9 y, leyendo sólo los nombres viejos, el
 * limitador habría seguido en memoria sin que nada avisara.
 */
describe("resolveRedisEnv", () => {
  it("toma los nombres propios de Upstash", () => {
    expect(
      resolveRedisEnv({
        UPSTASH_REDIS_REST_URL: "https://uno.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "tok-uno",
      }),
    ).toEqual({ url: "https://uno.upstash.io", token: "tok-uno" });
  });

  it("toma los que publica la integración de Vercel (KV_*)", () => {
    expect(
      resolveRedisEnv({
        KV_REST_API_URL: "https://dos.upstash.io",
        KV_REST_API_TOKEN: "tok-dos",
      }),
    ).toEqual({ url: "https://dos.upstash.io", token: "tok-dos" });
  });

  it("prefiere los nombres propios si están los dos juegos", () => {
    expect(
      resolveRedisEnv({
        UPSTASH_REDIS_REST_URL: "https://propio.upstash.io",
        UPSTASH_REDIS_REST_TOKEN: "tok-propio",
        KV_REST_API_URL: "https://integracion.upstash.io",
        KV_REST_API_TOKEN: "tok-integracion",
      }),
    ).toEqual({ url: "https://propio.upstash.io", token: "tok-propio" });
  });

  it("recorta los espacios que agrega el editor de variables de Vercel", () => {
    expect(
      resolveRedisEnv({ KV_REST_API_URL: " https://tres.upstash.io\n", KV_REST_API_TOKEN: " tok-tres " }),
    ).toEqual({ url: "https://tres.upstash.io", token: "tok-tres" });
  });

  it("sin variables, null: el limitador cae a memoria", () => {
    expect(resolveRedisEnv({})).toBeNull();
  });

  it("con la mitad cargada, null — nunca una URL sin token", () => {
    expect(resolveRedisEnv({ KV_REST_API_URL: "https://cuatro.upstash.io" })).toBeNull();
  });
});
