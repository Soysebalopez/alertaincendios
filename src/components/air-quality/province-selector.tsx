"use client";

import { PROVINCES, type Province } from "@/lib/argentina-cities";

export function ProvinceSelector({
  selected,
  onSelect,
}: {
  selected: string | null;
  onSelect: (province: Province) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {PROVINCES.map((prov) => (
        <button
          key={prov.id}
          onClick={() => onSelect(prov)}
          className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-150 active:scale-[0.97] ${
            selected === prov.id
              ? "bg-accent text-white"
              : "bg-surface-2 text-muted hover:text-foreground/80 border border-border"
          }`}
        >
          {prov.name}
        </button>
      ))}
    </div>
  );
}
