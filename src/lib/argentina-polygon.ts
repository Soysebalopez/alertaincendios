/**
 * Polígono aproximado del territorio continental argentino, usado para
 * descartar focos FIRMS que caen dentro de la bbox del request pero
 * pertenecen a países limítrofes (mayormente Chile sobre el flanco oeste).
 *
 * FIRMS solo soporta consultas por bbox rectangular; el recorte fino se
 * hace en cliente. Mismo polígono y mismo algoritmo de ray casting que usa
 * el pipeline GOES en api/goes-sync.py para mantener consistencia entre
 * ambas fuentes.
 *
 * Vértices en (longitud, latitud), ring cerrado.
 */
const ARGENTINA_VERTICES: Array<[number, number]> = [
  [-67.0, -22.0], [-65.5, -22.0], [-62.0, -22.0], [-58.0, -22.0],
  [-55.0, -25.0], [-53.5, -27.0],
  [-55.5, -28.0], [-58.0, -32.5], [-58.4, -34.0],
  [-56.5, -38.0], [-62.5, -42.0], [-65.0, -45.0], [-68.0, -50.0],
  [-68.5, -53.0],
  [-69.5, -55.0], [-71.0, -55.0],
  [-71.5, -52.0], [-72.0, -48.0], [-71.5, -45.0], [-71.5, -40.0],
  [-70.5, -36.0], [-70.0, -33.0], [-69.5, -30.0], [-69.0, -27.0],
  [-68.0, -25.0], [-67.0, -22.0],
];

export function isInArgentina(lat: number, lng: number): boolean {
  const poly = ARGENTINA_VERTICES;
  const n = poly.length;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}
