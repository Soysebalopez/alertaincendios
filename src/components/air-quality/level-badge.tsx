import { AIR_LEVEL_COLORS, AIR_LEVEL_LABELS, type AirLevel } from "@/lib/air-quality";

export function LevelBadge({ level }: { level: AirLevel }) {
  const color = AIR_LEVEL_COLORS[level];
  const label = AIR_LEVEL_LABELS[level];

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border"
      style={{
        borderColor: `${color}33`,
        backgroundColor: `${color}15`,
        color,
      }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: color }}
      />
      {label}
    </span>
  );
}
