import type * as LeafletNS from "leaflet";

/**
 * El mapa base de todos los mapas del sitio, en un solo lugar.
 *
 * POR QUÉ EXISTE ESTE ARCHIVO. Hasta el 2026-08-26 los cuatro mapas armaban su
 * propia capa de mosaicos, con la misma URL de CARTO copiada cuatro veces. CARTO
 * empezó a exigir clave y —en vez de fallar— pasó a servir el mosaico **con
 * "API KEY REQUIRED" dibujado encima**.
 *
 * Eso lo hizo invisible a cualquier chequeo automático: la respuesta es HTTP
 * 200, `image/png`, un PNG válido de 256×256. El error está en los PÍXELES. Se
 * vio porque alguien miró la portada, no porque el sistema avisara.
 *
 * Se reemplaza por Esri World Light Gray, que no pide clave y conserva el gris
 * claro: en un mapa de incendios el fondo tiene que desaparecer para que los
 * focos naranjas se lean. (OpenStreetMap estándar también es gratis y sin clave,
 * pero es colorido y se come los focos.)
 *
 * Esri sirve la base y las etiquetas por separado —CARTO las traía juntas en
 * `light_all`— así que son DOS capas, y las etiquetas van arriba.
 *
 * ⚠️ OJO CON EL ORDEN DE LAS COORDENADAS: Esri usa `{z}/{y}/{x}`, al revés que
 * casi todos. Con `{z}/{x}/{y}` responde igual —otro 200 con una imagen
 * válida— pero muestra el pedazo equivocado del planeta. Mismo modo de falla
 * que la marca de agua: correcto para la máquina, absurdo para el ojo.
 *
 * `L` entra por parámetro y NO se importa acá a propósito: Leaflet necesita
 * `window` al cargarse y rompe cualquier test que importe este módulo. Misma
 * razón por la que existe `firms-key.ts` separado de `firms.ts`.
 */

export const BASEMAP_BASE_URL =
  "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}";

export const BASEMAP_LABELS_URL =
  "https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}";

export const BASEMAP_ATTRIBUTION = "&copy; Esri";

/** Esri Light Gray no publica mosaicos más allá de este zoom. */
export const BASEMAP_MAX_ZOOM = 16;

/** Agrega el fondo (relieve + etiquetas) a un mapa de Leaflet ya creado. */
export function addBasemap(L: typeof LeafletNS, map: LeafletNS.Map): void {
  const opciones = { maxZoom: BASEMAP_MAX_ZOOM, attribution: BASEMAP_ATTRIBUTION };
  L.tileLayer(BASEMAP_BASE_URL, opciones).addTo(map);
  L.tileLayer(BASEMAP_LABELS_URL, opciones).addTo(map);
}
