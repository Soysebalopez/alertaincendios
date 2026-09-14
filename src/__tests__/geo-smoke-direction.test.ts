import { describe, expect, it } from "vitest";
import {
  angleDiffDeg,
  bearingDegrees,
  smokeEtaMinutes,
  smokeHeadsTowardUser,
} from "@/lib/geo";

/**
 * WHI-908 — smoke direction.
 *
 * Wind direction follows the meteorological convention used by Open-Meteo and
 * METAR: the compass bearing the wind blows FROM (0 = north, 90 = east).
 * Smoke reaches the user when the fire sits on that side of the user.
 */

const USER = { lat: -38.72, lng: -62.27 }; // Bahía Blanca
const NORTH_20KM = { lat: USER.lat + 0.18, lng: USER.lng };
const NORTHWEST_20KM = { lat: USER.lat + 0.127, lng: USER.lng - 0.163 };

function heads(fire: { lat: number; lng: number }, windFromDeg: number) {
  return smokeHeadsTowardUser(USER.lat, USER.lng, fire.lat, fire.lng, windFromDeg)
    .headsToward;
}

describe("smokeHeadsTowardUser — wind FROM convention", () => {
  it("fire to the north + wind from the north → smoke comes to the user", () => {
    expect(heads(NORTH_20KM, 0)).toBe(true);
  });

  it("fire to the north + wind from the south → smoke moves away", () => {
    expect(heads(NORTH_20KM, 180)).toBe(false);
  });

  it("fire to the northwest + wind from the northwest (typical in Bahía Blanca) → smoke comes", () => {
    expect(heads(NORTHWEST_20KM, 315)).toBe(true);
  });

  it("fire to the northwest + wind from the southeast → smoke moves away", () => {
    expect(heads(NORTHWEST_20KM, 135)).toBe(false);
  });

  it("crosswind (fire to the north, wind from the east) is not toward the user", () => {
    expect(heads(NORTH_20KM, 90)).toBe(false);
  });
});

describe("bearingDegrees", () => {
  it("due north is 0 and due west is 270", () => {
    expect(bearingDegrees(USER.lat, USER.lng, NORTH_20KM.lat, NORTH_20KM.lng)).toBeCloseTo(0, 5);
    expect(bearingDegrees(USER.lat, USER.lng, USER.lat, USER.lng - 0.2)).toBeCloseTo(270, 0);
  });

  it("corrects longitude by latitude: equal km north and east is ~45°, not ~52°", () => {
    const dLat = 0.1;
    const dLng = dLat / Math.cos((USER.lat * Math.PI) / 180);
    expect(bearingDegrees(USER.lat, USER.lng, USER.lat + dLat, USER.lng + dLng)).toBeCloseTo(45, 0);
  });
});

describe("angleDiffDeg", () => {
  it("wraps around north", () => {
    expect(angleDiffDeg(350, 10)).toBe(20);
    expect(angleDiffDeg(10, 350)).toBe(20);
  });

  it("never exceeds 180", () => {
    expect(angleDiffDeg(0, 180)).toBe(180);
    expect(angleDiffDeg(90, 271)).toBe(179);
  });
});

describe("smokeEtaMinutes", () => {
  it("20 km at 30 km/h toward the user → 40 min", () => {
    expect(smokeEtaMinutes(20, 30, true)).toBe(40);
  });

  it("not toward the user → -1", () => {
    expect(smokeEtaMinutes(20, 30, false)).toBe(-1);
  });

  it("calm wind → -1", () => {
    expect(smokeEtaMinutes(20, 0, true)).toBe(-1);
  });
});
