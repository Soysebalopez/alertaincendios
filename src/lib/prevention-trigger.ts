import { DANGER_CLASSES, type DangerClass } from "@/lib/fire-danger";

export interface ForecastDay {
  target_date: string; // YYYY-MM-DD
  danger_class: DangerClass;
}

export type TriggerAction =
  | { action: "none" }
  | { action: "clear" }
  | { action: "alert"; peak: DangerClass; peakDate: string }
  | { action: "escalate"; peak: DangerClass; peakDate: string; from: DangerClass };

const ALTO_INDEX = DANGER_CLASSES.indexOf("alto"); // 2
const WINDOW_DAYS = 3;

export function evaluatePreventionTrigger(
  forecast: ForecastDay[],
  today: string,
  alertedClass: DangerClass | null
): TriggerAction {
  const window = forecast
    .filter((d) => d.target_date >= today)
    .sort((a, b) => a.target_date.localeCompare(b.target_date))
    .slice(0, WINDOW_DAYS);

  if (window.length === 0) return { action: "none" };

  let peakIdx = 0;
  let peak: DangerClass = "bajo";
  let peakDate = window[0].target_date;
  for (const d of window) {
    const i = DANGER_CLASSES.indexOf(d.danger_class);
    if (i > peakIdx) {
      peakIdx = i;
      peak = d.danger_class;
      peakDate = d.target_date;
    }
  }

  if (peakIdx < ALTO_INDEX) {
    return alertedClass ? { action: "clear" } : { action: "none" };
  }
  if (alertedClass === null) {
    return { action: "alert", peak, peakDate };
  }
  const prevIdx = DANGER_CLASSES.indexOf(alertedClass);
  if (peakIdx > prevIdx) {
    return { action: "escalate", peak, peakDate, from: alertedClass };
  }
  return { action: "none" };
}
