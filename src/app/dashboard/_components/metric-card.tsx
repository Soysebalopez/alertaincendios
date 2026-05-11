export function MetricCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: "accent" | "good" | "warn" | "danger";
}) {
  const colorMap: Record<string, string> = {
    accent: "var(--accent)",
    good: "var(--good, #4ade80)",
    warn: "var(--warn, #fbbf24)",
    danger: "var(--danger, #ef4444)",
  };
  const valueColor = tone ? colorMap[tone] : "var(--foreground)";

  return (
    <div
      style={{
        padding: "20px 22px",
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
      }}
    >
      <div className="font-mono text-[10px] text-muted tracking-[0.12em] uppercase mb-2.5">
        {label}
      </div>
      <div
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 36,
          fontWeight: 800,
          letterSpacing: "-0.03em",
          color: valueColor,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {sub ? (
        <div className="font-mono text-[10px] text-muted mt-2 tracking-wider">{sub}</div>
      ) : null}
    </div>
  );
}
