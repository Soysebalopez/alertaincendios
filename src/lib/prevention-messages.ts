import { DANGER_CLASSES, DANGER_COPY, type DangerClass } from "@/lib/fire-danger";
import type { ForecastDay } from "@/lib/prevention-trigger";

const EMOJI: Record<DangerClass, string> = {
  bajo: "🟢",
  moderado: "🟡",
  alto: "🟠",
  "muy alto": "🔴",
  extremo: "🔴",
};

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function spanishDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12)); // noon UTC avoids tz drift
  return `${WEEKDAYS[dt.getUTCDay()]} ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

const FOOTER = "\n\nAjustá tus avisos: /preferencias";

export function formatPreventionAlert(
  zoneName: string,
  peak: DangerClass,
  peakDate: string,
  fromClass: DangerClass | null
): string {
  const copy = DANGER_COPY[peak];
  const head =
    fromClass !== null
      ? `🔥 <b>Aviso de prevención — ${zoneName}</b>\n\nEl peligro de incendio <b>SUBE de ${fromClass} a ${peak.toUpperCase()}</b> ${EMOJI[peak]} el ${spanishDate(peakDate)}.`
      : `🔥 <b>Aviso de prevención — ${zoneName}</b>\n\nEl peligro de incendio sube a <b>${peak.toUpperCase()}</b> ${EMOJI[peak]} el ${spanishDate(peakDate)}.`;
  return (
    `${head}\n\n${copy.summary}\n${copy.action}\n\n` +
    `Es un pronóstico — todavía no hay foco. Te aviso para prevenir.` +
    FOOTER
  );
}

export function formatDailyBriefing(
  zoneName: string,
  today: string,
  forecast: ForecastDay[]
): string {
  const sorted = [...forecast].sort((a, b) => a.target_date.localeCompare(b.target_date));
  const todayDay = sorted.find((d) => d.target_date === today) ?? sorted[0];
  const todayClass = todayDay.danger_class;
  const copy = DANGER_COPY[todayClass];
  const todayIdx = DANGER_CLASSES.indexOf(todayClass);

  const rise = sorted.find(
    (d) => d.target_date > today && DANGER_CLASSES.indexOf(d.danger_class) > todayIdx
  );

  const header = `🌲 <b>Resumen — ${zoneName} · ${spanishDate(today).split(" ")[1]}</b>`;

  if (todayIdx < DANGER_CLASSES.indexOf("alto") && !rise) {
    return `${header}\n\nHoy: ${todayClass.toUpperCase()} ${EMOJI[todayClass]} — sin novedades. Outlook estable.${FOOTER}`;
  }

  const outlook = rise
    ? `\nPróximos días: sube a ${rise.danger_class} el ${spanishDate(rise.target_date)}.`
    : "";
  return `${header}\n\nHoy: ${todayClass.toUpperCase()} ${EMOJI[todayClass]} — ${copy.summary}${outlook}${FOOTER}`;
}
