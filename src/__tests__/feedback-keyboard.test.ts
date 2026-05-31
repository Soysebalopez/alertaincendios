import { describe, expect, it } from "vitest";
import {
  buildFeedbackKeyboard,
  parseFeedbackCallback,
} from "@/lib/feedback-keyboard";

/**
 * Feedback comunitario — el callback_data viaja por Telegram con un límite DURO
 * de 64 bytes UTF-8. El fire_key de FIRMS está acotado a 26 bytes por el BBOX
 * Argentina (ver FEEDBACK_COMUNITARIO_SPEC.md §2.2), así que el peor caso entra
 * con margen. Estos tests blindan ese invariante y el parseo/validación del voto.
 */

const bytes = (s: string) => new TextEncoder().encode(s).length;

describe("buildFeedbackKeyboard", () => {
  it("arma 5 botones en 3 filas con callback_data fb|<alertId>|<code>", () => {
    const kb = buildFeedbackKeyboard("f:-38.748_-68.920_2026-04-09");
    const rows = kb.inline_keyboard;
    expect(rows).toHaveLength(3);
    const flat = rows.flat();
    expect(flat).toHaveLength(5);
    for (const btn of flat) {
      expect(btn.callback_data).toMatch(/^fb\|f:-38\.748_-68\.920_2026-04-09\|[sfqnl]$/);
    }
    // los 5 códigos presentes, sin repetir
    const codes = flat.map((b) => b.callback_data.split("|")[2]).sort();
    expect(codes).toEqual(["f", "l", "n", "q", "s"]);
  });

  it("el callback_data nunca supera 64 bytes en el peor caso FIRMS", () => {
    // Peor caso: fire_key de 26 bytes (lat/lng de 2 dígitos + fecha) → alert_id 28.
    const worstAlertId = "f:-55.123_-73.456_2026-12-31";
    const kb = buildFeedbackKeyboard(worstAlertId);
    for (const btn of kb.inline_keyboard.flat()) {
      expect(bytes(btn.callback_data)).toBeLessThanOrEqual(64);
    }
    // sanity explícito del peor caso documentado (~33 bytes)
    expect(bytes(`fb|${worstAlertId}|s`)).toBeLessThanOrEqual(40);
  });
});

describe("parseFeedbackCallback", () => {
  it("parsea un voto FIRMS válido", () => {
    expect(parseFeedbackCallback("fb|f:-38.748_-68.920_2026-04-09|s")).toEqual({
      alertId: "f:-38.748_-68.920_2026-04-09",
      source: "firms",
      response: "humo",
    });
  });

  it("parsea un voto GOES válido", () => {
    expect(parseFeedbackCallback("fb|g:4336|f")).toEqual({
      alertId: "g:4336",
      source: "goes",
      response: "fuego",
    });
  });

  it("mapea cada código a su respuesta canónica", () => {
    const r = (c: string) => parseFeedbackCallback(`fb|g:1|${c}`)?.response;
    expect(r("s")).toBe("humo");
    expect(r("f")).toBe("fuego");
    expect(r("q")).toBe("olor");
    expect(r("n")).toBe("nada");
    expect(r("l")).toBe("lejos");
  });

  it("rechaza callbacks inválidos devolviendo null", () => {
    expect(parseFeedbackCallback(undefined)).toBeNull();
    expect(parseFeedbackCallback(null)).toBeNull();
    expect(parseFeedbackCallback("")).toBeNull();
    expect(parseFeedbackCallback("xx|f:1|s")).toBeNull(); // prefijo malo
    expect(parseFeedbackCallback("fb|f:1|z")).toBeNull(); // código desconocido
    expect(parseFeedbackCallback("fb|x:1|s")).toBeNull(); // fuente desconocida
    expect(parseFeedbackCallback("fb|f:|s")).toBeNull(); // native key vacío
    expect(parseFeedbackCallback("fb|f:1")).toBeNull(); // faltan partes
    expect(parseFeedbackCallback("fb|f:1|s|extra")).toBeNull(); // partes de más
  });
});

describe("local_hour (Argentina UTC-3 fijo, sin DST)", () => {
  // Misma fórmula que el webhook: (utcHour + 24 - 3) % 24
  const localHour = (utc: number) => (utc + 24 - 3) % 24;
  it("desplaza -3 con wrap correcto", () => {
    expect(localHour(15)).toBe(12); // mediodía aprox
    expect(localHour(3)).toBe(0); // medianoche ART
    expect(localHour(2)).toBe(23); // wrap al día anterior
    expect(localHour(0)).toBe(21);
  });
});
