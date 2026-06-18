"use client";
import { useState } from "react";
import type { ProvinceDanger } from "@/lib/fire-danger";
import { DangerPanel } from "./danger-panel";

export function ProvinceView({ data, today }: { data: ProvinceDanger; today: string }) {
  const [selectedDay, setSelectedDay] = useState(0);
  // Map comes in Task 5; for now the panel sits next to a placeholder.
  return (
    <div style={{ display: "flex", height: "calc(100dvh - 64px)" }}>
      <div style={{ flex: 1, background: "var(--surface-2)" }} aria-hidden />
      <DangerPanel data={data} selectedDay={selectedDay} onSelectDay={setSelectedDay} today={today} />
    </div>
  );
}
