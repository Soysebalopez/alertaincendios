/** WHO Air Quality Guidelines (µg/m³, 24h average) */
export const AQI_THRESHOLDS = {
  NO2: { good: 25, moderate: 50, bad: 100, dangerous: 200 },
  SO2: { good: 40, moderate: 80, bad: 250, dangerous: 500 },
  CO: { good: 4000, moderate: 7000, bad: 10000, dangerous: 17000 },
  O3: { good: 60, moderate: 100, bad: 140, dangerous: 180 },
  PM25: { good: 15, moderate: 25, bad: 50, dangerous: 75 },
  PM10: { good: 45, moderate: 75, bad: 150, dangerous: 250 },
} as const;

export type AirLevel = "good" | "moderate" | "bad" | "dangerous";

export function getAirLevel(
  pollutant: keyof typeof AQI_THRESHOLDS,
  value: number,
): AirLevel {
  const t = AQI_THRESHOLDS[pollutant];
  if (value <= t.good) return "good";
  if (value <= t.moderate) return "moderate";
  if (value <= t.bad) return "bad";
  return "dangerous";
}

export const AIR_LEVEL_LABELS: Record<AirLevel, string> = {
  good: "Bueno",
  moderate: "Moderado",
  bad: "Malo",
  dangerous: "Peligroso",
};

export const AIR_LEVEL_COLORS: Record<AirLevel, string> = {
  good: "#22c55e",
  moderate: "#eab308",
  bad: "#f97316",
  dangerous: "#ef4444",
};

export const POLLUTANT_LABELS: Record<string, string> = {
  NO2: "NO₂",
  SO2: "SO₂",
  O3: "O₃",
  CO: "CO",
  PM25: "PM2.5",
  PM10: "PM10",
};

/** Open-Meteo variable names mapped from our keys */
export const POLLUTANT_VARS: Record<string, string> = {
  NO2: "nitrogen_dioxide",
  SO2: "sulphur_dioxide",
  O3: "ozone",
  CO: "carbon_monoxide",
  PM25: "pm2_5",
  PM10: "pm10",
};
