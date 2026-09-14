/**
 * The city map's request for one fire's projection (WHI-907 part 11).
 *
 * A fire listed by FIRMS is confirmed; a focus from an alert that nothing lists
 * anymore is not, and gets smoke only. The fire front is a grassland rule, so
 * it is only asked for outside every forest zone.
 */
export function fireProjectionPath(fire: {
  lat: number;
  lng: number;
  confirmed: boolean;
  forestZone?: string;
}): string {
  const params = new URLSearchParams({ lat: fire.lat.toFixed(4), lng: fire.lng.toFixed(4) });
  if (fire.confirmed) {
    params.set("confirmed", "1");
    if (!fire.forestZone) params.set("grass", "1");
  }
  return `/api/fire-projection?${params}`;
}
