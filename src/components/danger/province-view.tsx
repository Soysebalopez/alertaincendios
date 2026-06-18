"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import type { ProvinceDanger } from "@/lib/fire-danger";
import { DangerPanel } from "./danger-panel";

const ProvinceMap = dynamic(() => import("./province-map").then((m) => m.ProvinceMap), {
  ssr: false,
  loading: () => <div style={{ flex: 1, background: "var(--surface-2)" }} />,
});

export function ProvinceView({ data, today }: { data: ProvinceDanger; today: string }) {
  const [selectedDay, setSelectedDay] = useState(0);
  const [showDetection, setShowDetection] = useState(false);
  return (
    <div style={{ display: "flex", height: "calc(100dvh - 64px)" }}>
      <div style={{ flex: 1 }}>
        <ProvinceMap data={data} selectedDay={selectedDay} showDetection={showDetection} />
      </div>
      <DangerPanel
        data={data}
        selectedDay={selectedDay}
        onSelectDay={setSelectedDay}
        today={today}
        showDetection={showDetection}
        onToggleDetection={() => setShowDetection((v) => !v)}
      />
    </div>
  );
}
