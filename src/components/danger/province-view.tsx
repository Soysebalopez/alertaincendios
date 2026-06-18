"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import type { ProvinceDanger } from "@/lib/fire-danger";
import { DangerPanel } from "./danger-panel";

const ProvinceMap = dynamic(() => import("./province-map").then((m) => m.ProvinceMap), {
  ssr: false,
  loading: () => <div style={{ flex: 1, background: "var(--surface-2)" }} />,
});

// Inline SVG — avoids a phosphor import just for the drawer trigger
const MenuIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <rect x="3" y="6" width="18" height="2" rx="1" />
    <rect x="3" y="11" width="18" height="2" rx="1" />
    <rect x="3" y="16" width="18" height="2" rx="1" />
  </svg>
);

export function ProvinceView({ data, today }: { data: ProvinceDanger; today: string }) {
  const [selectedDay, setSelectedDay] = useState(0);
  const [showDetection, setShowDetection] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);

  return (
    <div className="clara-map-shell" style={{ height: "calc(100dvh - 64px)" }}>
      {/* Backdrop — only visible on mobile when panel is open */}
      <div
        className={`clara-map-backdrop ${panelOpen ? "is-open" : ""}`}
        onClick={() => setPanelOpen(false)}
      />

      <div className="clara-map-canvas">
        <ProvinceMap data={data} selectedDay={selectedDay} showDetection={showDetection} />

        {/* Drawer trigger — CSS hides this on desktop (clara-map-drawer-btn) */}
        <button
          className="clara-map-drawer-btn absolute top-4 left-4 z-[1000] items-center gap-2 rounded-lg px-3 py-2 font-mono text-[11px]"
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--foreground)",
            cursor: "pointer",
          }}
          onClick={() => setPanelOpen(true)}
          aria-label="Abrir panel de zonas"
        >
          <MenuIcon /> Zonas
        </button>
      </div>

      <DangerPanel
        data={data}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
        today={today}
        showDetection={showDetection}
        onToggleDetection={() => setShowDetection((v) => !v)}
        className={`clara-map-panel ${panelOpen ? "is-open" : ""}`}
      />
    </div>
  );
}
