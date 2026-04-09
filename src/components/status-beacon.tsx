"use client";

/**
 * A pulsing status beacon that indicates live monitoring.
 * Uses pure CSS animation — no JS runtime cost.
 */
export function StatusBeacon({ active = true }: { active?: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      {active && (
        <span className="absolute inset-0 rounded-full bg-accent opacity-60 thermal-pulse" />
      )}
      <span
        className={`relative inline-flex h-2.5 w-2.5 rounded-full ${active ? "bg-accent" : "bg-muted"}`}
      />
    </span>
  );
}
