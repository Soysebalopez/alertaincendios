import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guardián del número grande de la home. No hay forma de testear el componente
 * de servidor sin levantar media app, así que este test mira el código: las dos
 * superficies que muestran el contador —el render del servidor y el refresco en
 * vivo— tienen que contar INCENDIOS con la misma función compartida.
 *
 * Origen (17/9/2026): mostraba 426 "focos activos ahora mismo", que eran las
 * detecciones del día; los incendios distintos eran 217. Un lector entiende
 * "incendios", no "veces que el satélite vio fuego".
 */
/**
 * Sin comentarios: `page.tsx` cuenta en dos comentarios largos cómo era el
 * texto viejo («507focos activos ahora mismo…»), así que un `not.toContain`
 * sobre el archivo crudo se pone rojo por la memoria del archivo y no por el
 * código. Lo cazamos sabotando: pasó exactamente eso.
 */
function sinComentarios(fuente: string): string {
  const salida: string[] = [];
  let dentroDeBloque = false;
  for (const linea of fuente.split("\n")) {
    let l = linea;
    if (dentroDeBloque) {
      const fin = l.indexOf("*/");
      if (fin === -1) continue;
      dentroDeBloque = false;
      l = l.slice(fin + 2);
    }
    l = l.replace(/\/\*.*?\*\//g, "").replace(/^\s*\/\/.*$/, "");
    const abre = l.indexOf("/*");
    if (abre !== -1) {
      dentroDeBloque = true;
      l = l.slice(0, abre);
    }
    salida.push(l);
  }
  return salida.join("\n");
}

const leer = (rel: string) => sinComentarios(readFileSync(path.join(process.cwd(), rel), "utf8"));

describe("el contador de la home cuenta incendios, no detecciones", () => {
  const page = leer("src/app/(main)/page.tsx");
  const enVivo = leer("src/components/hero-auto-refresh.tsx");

  it("el servidor calcula los incendios con la función compartida", () => {
    expect(page).toContain("countForestFireEvents(fires)");
  });

  it("el número grande muestra esos incendios", () => {
    expect(page).toContain("<FireCounter count={forestEvents} />");
    expect(page).toContain("<HeroAutoRefresh initialCount={forestEvents} />");
  });

  it("el refresco en vivo usa la misma función, no su propia cuenta", () => {
    expect(enVivo).toContain("countForestFireEvents(fires)");
    expect(enVivo).not.toContain("function countForestActive");
  });

  it("el texto dice incendios y acota la ventana de tiempo", () => {
    expect(page).toContain("incendios activos en las últimas 24 h");
    expect(page).not.toContain("focos activos ahora mismo");
  });
});
