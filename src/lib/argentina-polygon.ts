/**
 * Recorte del territorio argentino, usado para descartar focos FIRMS que caen
 * dentro de la bbox del request pero pertenecen a países limítrofes, y para
 * decidir si podemos cubrir a un suscriptor.
 *
 * 🔴 HASTA EL 2026-09-17 ESTO ERA UNA SILUETA DIBUJADA A MANO, DE 21 PUNTOS, Y
 * FALLABA PARA LOS DOS LADOS. Su borde norte iba derecho de Salta a Misiones,
 * así que se tragaba el Chaco paraguayo: ese día, 856 de los 2.065 focos que el
 * mapa mostraba como argentinos (41%) estaban en Paraguay, en plena temporada
 * de quemas. Y al mismo tiempo dejaba afuera pueblos reales —Puerto Iguazú y
 * El Calafate— que el bot rechazaba como "fuera de cobertura".
 *
 * Ahora el dato es el límite real (Natural Earth 10m, dominio público),
 * simplificado a ~110 m y sin islotes de menos de 5 km²: 8 polígonos, 4.243
 * puntos. `argentina_geo/polygon.py` es su gemelo para el pipeline GOES, porque
 * `vercel.json` excluye `src/**` del paquete de las funciones Python; un test
 * de paridad compara los dos punto por punto.
 *
 * El margen de borde no es un detalle: el trazo mundial deja a Ushuaia 0,6 km
 * mar adentro. Aceptamos lo que esté a menos de ARGENTINA_BORDER_BUFFER_KM del
 * límite, igual que hacen las zonas forestales. A esa distancia no entra
 * ningún foco de Paraguay: el más cercano de ese día estaba a 50 km.
 */
import polygonData from "./argentina-polygon.json";

/** Tolerancia del límite: el dato es de escala mundial y la costa se recorta. */
export const ARGENTINA_BORDER_BUFFER_KM = 3;

type Ring = Array<[number, number]>; // [lng, lat]
type Poly = Ring[]; // [exterior, ...huecos]

const POLYGONS = polygonData as unknown as Poly[];

type BBox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

const BBOXES: BBox[] = POLYGONS.map((poly) => {
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const [lng, lat] of poly[0]) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return { minLng, minLat, maxLng, maxLat };
});

// ~3 km en grados, con margen: sirve sólo para descartar rápido.
const BBOX_BUFFER_DEG = 0.05;

function pointInRing(lng: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    // +1e-12 evita dividir por cero en tramos horizontales, igual que el
    // ray-casting de forest-zones-geo.ts (los dos clasificadores tienen que
    // coincidir en el borde).
    const intersect =
      yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/** Distancia punto→segmento en km, con proyección local plana (exacta a esta escala). */
function distanceToSegmentKm(
  lng: number,
  lat: number,
  a: [number, number],
  b: [number, number],
): number {
  const kx = 111.32 * Math.cos((lat * Math.PI) / 180);
  const ky = 110.57;
  const px = lng * kx, py = lat * ky;
  const ax = a[0] * kx, ay = a[1] * ky;
  const bx = b[0] * kx, by = b[1] * ky;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function withinBufferKm(lng: number, lat: number, km: number): boolean {
  for (let p = 0; p < POLYGONS.length; p++) {
    const b = BBOXES[p];
    if (
      lng < b.minLng - BBOX_BUFFER_DEG ||
      lng > b.maxLng + BBOX_BUFFER_DEG ||
      lat < b.minLat - BBOX_BUFFER_DEG ||
      lat > b.maxLat + BBOX_BUFFER_DEG
    ) {
      continue;
    }
    for (const ring of POLYGONS[p]) {
      for (let i = 0; i < ring.length - 1; i++) {
        if (distanceToSegmentKm(lng, lat, ring[i], ring[i + 1]) <= km) return true;
      }
    }
  }
  return false;
}

/** True si (lat, lng) está en Argentina, o a menos de 3 km de su límite. */
export function isInArgentina(lat: number, lng: number): boolean {
  for (let p = 0; p < POLYGONS.length; p++) {
    const b = BBOXES[p];
    if (lng < b.minLng || lng > b.maxLng || lat < b.minLat || lat > b.maxLat) continue;
    const poly = POLYGONS[p];
    if (!pointInRing(lng, lat, poly[0])) continue;
    let inHole = false;
    for (let i = 1; i < poly.length; i++) {
      if (pointInRing(lng, lat, poly[i])) {
        inHole = true;
        break;
      }
    }
    if (!inHole) return true;
  }
  return withinBufferKm(lng, lat, ARGENTINA_BORDER_BUFFER_KM);
}
