"use client";
import { Pill } from "@/components/clara-ui";
import {
  dangerPillTone,
  worstClass,
  forecastDateLabel,
  type ProvinceDanger,
} from "@/lib/fire-danger";
import { DangerTrend } from "./danger-trend";

export function DangerPanel({
  data,
  selectedDay,
  onSelectDay,
  today,
  showDetection,
  onToggleDetection,
  className,
}: {
  data: ProvinceDanger;
  selectedDay: number;
  onSelectDay: (i: number) => void;
  today: string;
  showDetection?: boolean;
  onToggleDetection?: () => void;
  className?: string;
}) {
  const dayClasses = data.zones.map((z) => z.forecast[selectedDay]?.danger_class ?? "bajo");
  const overall = worstClass(dayClasses);
  const dateStr = data.dates[selectedDay];

  return (
    <div className={`clp-panel${className ? ` ${className}` : ""}`}>
      <div className="clp-block">
        <div className="clp-title">{data.provinceName}</div>
        <div className="clp-sub">Peligro de incendio · {forecastDateLabel(dateStr, today)}</div>
        <div style={{ marginTop: 8 }}>
          <Pill tone={dangerPillTone(overall)}>{overall}</Pill>
        </div>
      </div>

      <div className="clp-block">
        <div className="clp-label">Pronóstico</div>
        <input
          type="range"
          min={0}
          max={data.dates.length - 1}
          value={selectedDay}
          onChange={(e) => onSelectDay(Number(e.target.value))}
          style={{ width: "100%" }}
          aria-label="Día de pronóstico"
        />
        <div className="clp-sub">{forecastDateLabel(dateStr, today)}</div>
      </div>

      <div className="clp-block clp-block--scroll">
        <div className="clp-label">Zonas</div>
        {data.zones.map((z) => {
          const d = z.forecast[selectedDay];
          return (
            <div key={z.id} className="clp-fire">
              <div>
                <strong>{z.name}</strong>
                <div className="clp-sub">
                  FWI {d?.fwi ?? "—"} · {d?.temp ?? "—"}°C · HR {d?.rh ?? "—"}% · viento {d?.wind ?? "—"}
                </div>
              </div>
              <Pill tone={dangerPillTone(d?.danger_class ?? "bajo")}>{d?.danger_class ?? "—"}</Pill>
            </div>
          );
        })}
      </div>

      <div className="clp-block">
        <div className="clp-label">Tendencia · 16 días</div>
        <DangerTrend zones={data.zones} />
      </div>

      <div className="clp-block">
        <label className="clp-sub" style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
          <input type="checkbox" checked={!!showDetection} onChange={() => onToggleDetection?.()} />
          Mostrar focos activos (detección)
        </label>
        <div className="clp-sub" style={{ marginTop: 6 }}>Fuentes: Open-Meteo · FWI canadiense (SNMF)</div>
      </div>
    </div>
  );
}
