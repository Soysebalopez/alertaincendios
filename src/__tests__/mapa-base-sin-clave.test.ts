import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BASEMAP_BASE_URL, BASEMAP_LABELS_URL } from "@/lib/basemap";

/**
 * EL MAPA DE LA PORTADA APARECIÓ CON "API KEY REQUIRED" ESCRITO ENCIMA
 * (2026-08-26). CARTO empezó a exigir clave para sus mapas base y, en vez de
 * fallar, **sirve el mosaico con una marca de agua**.
 *
 * Ese detalle es lo que lo hizo invisible a toda verificación automática: la
 * respuesta es HTTP 200, `content-type: image/png`, un PNG válido de 256×256.
 * Todo chequeo de "¿responde bien?" pasa. El error está DIBUJADO EN LOS PÍXELES,
 * así que sólo se ve mirando la imagen — y lo reportó Seba, no el sistema.
 *
 * Este test no puede mirar píxeles, pero sí puede impedir la causa: que un mapa
 * apunte a un proveedor que exige clave. La lista es BLANCA, no negra —
 * enumerar los que sabemos gratuitos es lo único que ataja al próximo proveedor
 * que cambie sus condiciones sin avisar.
 */

// Proveedores verificados sin clave el 2026-08-26, mirando el mosaico servido.
const PROVEEDORES_SIN_CLAVE = [
  "services.arcgisonline.com", // Esri World Light Gray (base y etiquetas)
  "tile.openstreetmap.org",    // OSM estándar
];

const MAPAS = [
  "src/components/fire-map.tsx",
  "src/components/city/city-map.tsx",
  "src/components/map/argentina-map.tsx",
  "src/components/danger/province-map.tsx",
];

const leer = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("el mapa base no depende de una clave", () => {
  it("hay mapas que revisar", () => {
    // Si alguien renombra los componentes, el barrido de abajo pasaría en verde
    // sin haber mirado un solo archivo.
    expect(MAPAS.length).toBeGreaterThan(0);
    for (const m of MAPAS) expect(() => leer(m)).not.toThrow();
  });

  it.each([BASEMAP_BASE_URL, BASEMAP_LABELS_URL])(
    "%s usa un proveedor sin clave",
    (url) => {
      expect(PROVEEDORES_SIN_CLAVE.some((p) => url.includes(p))).toBe(true);
    },
  );

  it.each(MAPAS)("%s no arma su propia capa de mosaicos", (archivo) => {
    const codigo = leer(archivo)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");

    // Cuatro copias de la misma URL es como esto tardó en arreglarse: hay que
    // acordarse de los cuatro. Ahora va por un solo lugar.
    expect(codigo).not.toMatch(/L\.tileLayer\s*\(/);
    // Y por las dudas, el proveedor que empezó a cobrar queda nombrado.
    expect(codigo).not.toContain("cartocdn.com");
  });

  it("la CSP autoriza el dominio del mapa base", () => {
    // LA MITAD QUE SE OLVIDA. Cambiar el proveedor en el código no alcanza: sin
    // el dominio en `img-src`, el navegador bloquea cada mosaico y el mapa queda
    // GRIS Y VACÍO. No tira error visible ni rompe ningún test — pasó al hacer
    // este mismo cambio, y se descubrió mirando una captura del mapa local.
    const config = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");
    const dominio = new URL(BASEMAP_BASE_URL).host;
    const imgSrc = config.match(/"img-src[^"]*"/)?.[0];
    expect(imgSrc).toBeTruthy();
    expect(imgSrc).toContain(dominio);
  });
});
