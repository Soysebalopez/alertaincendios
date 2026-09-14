import { describe, expect, it } from "vitest";
import { selectAlertPairs, ALERT_MAX_DISTANCE_KM } from "@/lib/alert-pairs";

/**
 * Guardián del orden de filtros en /api/alerts.
 *
 * Origen (2026-09-04): el endpoint consultaba `ai_alerted_fires` —un viaje a
 * la base— ANTES de calcular la distancia. Medido contra producción ese día:
 * 188 focos forestales × 3 suscriptores = 564 consultas secuenciales para
 * terminar mandando CERO alertas, porque ningún foco estaba a menos de 100 km
 * de nadie. Las 6 corridas siguientes del cron se cortaron a los 60 s.
 *
 * El arreglo no es invertir dos líneas: es que el bucle que toca la base
 * reciba únicamente pares que ya pasaron los filtros baratos. Este test fija
 * ese contrato — si alguien devuelve un par lejano, se pone rojo.
 */

const cerca = { latitude: -38.4, longitude: -69.2, forestZone: "andino-patagonico" };
const cercaSinBosque = { latitude: -38.4, longitude: -69.2 };
// Chaco: a más de 1.000 km del suscriptor de Neuquén.
const lejos = { latitude: -24.0, longitude: -61.0, forestZone: "chaco-norte" };

const suscriptor = { lat: -38.39, lng: -69.16 };

describe("selectAlertPairs", () => {
  it("descarta el foco lejano sin generar ningún par", () => {
    const { pairs } = selectAlertPairs([lejos], [suscriptor], ALERT_MAX_DISTANCE_KM);
    expect(pairs).toHaveLength(0);
  });

  it("deja pasar el foco cercano en zona forestal, con su distancia ya calculada", () => {
    const { pairs } = selectAlertPairs([cerca], [suscriptor], ALERT_MAX_DISTANCE_KM);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].fire).toBe(cerca);
    expect(pairs[0].sub).toBe(suscriptor);
    expect(pairs[0].distKm).toBeLessThan(10);
  });

  it("no manda un foco cercano fuera de zona forestal, y lo cuenta", () => {
    const { pairs, skippedNonForestCivilian } = selectAlertPairs(
      [cercaSinBosque],
      [suscriptor],
      ALERT_MAX_DISTANCE_KM
    );
    expect(pairs).toHaveLength(0);
    expect(skippedNonForestCivilian).toBe(1);
  });

  /**
   * El escenario exacto del 2026-09-04, que es el que costó el incidente:
   * muchos focos forestales, ninguno cerca. Antes esto eran 564 consultas a
   * la base; ahora tienen que ser cero pares.
   */
  it("con 188 focos forestales lejanos y 3 suscriptores no produce un solo par", () => {
    const focos = Array.from({ length: 188 }, (_, i) => ({
      latitude: -24.0 + i * 0.01,
      longitude: -61.0,
      forestZone: "chaco-norte",
    }));
    const subs = [
      { lat: -38.39, lng: -69.16 },
      { lat: -38.7196, lng: -62.2724 },
      { lat: 40.458, lng: 0.354 },
    ];
    const { pairs } = selectAlertPairs(focos, subs, ALERT_MAX_DISTANCE_KM);
    expect(pairs).toHaveLength(0);
  });

  it("respeta el radio que se le pasa", () => {
    // El mismo foco, dos radios: adentro con 100 km, afuera con 1 km.
    const aUnosKm = { latitude: -38.45, longitude: -69.16, forestZone: "andino-patagonico" };
    expect(selectAlertPairs([aUnosKm], [suscriptor], 100).pairs).toHaveLength(1);
    expect(selectAlertPairs([aUnosKm], [suscriptor], 1).pairs).toHaveLength(0);
  });
});
