/**
 * Geospatial classification of fire detections.
 *
 * VIIRS type field is unreliable for gas flaring — most Vaca Muerta
 * flares appear as type 0 (vegetation fire). This module reclassifies
 * detections that fall inside known oil/gas basins with low FRP as
 * industrial (type 2).
 */

interface BBox {
  name: string;
  north: number;
  south: number;
  west: number;
  east: number;
}

/**
 * Major oil & gas basins in Argentina.
 * Bounding boxes are intentionally generous to capture all wells.
 */
const OIL_BASINS: BBox[] = [
  {
    name: "Cuenca Neuquina (Vaca Muerta)",
    north: -36.0,
    south: -40.5,
    west: -71.0,
    east: -67.0,
  },
  {
    name: "Golfo San Jorge",
    north: -44.0,
    south: -47.5,
    west: -70.5,
    east: -65.0,
  },
  {
    name: "Cuenca Austral",
    north: -51.0,
    south: -54.5,
    west: -70.5,
    east: -67.0,
  },
  {
    name: "Cuenca Cuyana",
    north: -32.5,
    south: -35.0,
    west: -69.5,
    east: -67.0,
  },
];

/** Max FRP (MW) for a detection to be considered flaring inside a basin */
const FLARING_FRP_THRESHOLD = 7;

function isInsideBasin(lat: number, lng: number): BBox | null {
  for (const basin of OIL_BASINS) {
    if (
      lat >= basin.south &&
      lat <= basin.north &&
      lng >= basin.west &&
      lng <= basin.east
    ) {
      return basin;
    }
  }
  return null;
}

/**
 * Reclassify a fire detection based on location + FRP.
 * If inside an oil basin and FRP is low, override type to 2 (static land source).
 */
export function classifyFireType(
  viirType: number,
  lat: number,
  lng: number,
  frp: number
): number {
  // Trust VIIRS if it already says industrial/offshore/volcano
  if (viirType === 1 || viirType === 2 || viirType === 3) return viirType;

  // Check if inside an oil basin with low FRP
  if (frp <= FLARING_FRP_THRESHOLD && isInsideBasin(lat, lng)) {
    return 2; // Reclassify as static land source (flaring)
  }

  return viirType;
}
