"use client";

import { useEffect, useRef, useState } from "react";
import {
  findLastVIIRSCoverage,
  findNextVIIRSCoverage,
  formatCountdown,
  formatTimeAgo,
  type CoverageEvent,
  type SatelliteTLE,
} from "@/lib/satellites";

interface Props {
  lat: number;
  lng: number;
  cityName: string;
}

type Coverage = {
  last: CoverageEvent | null;
  next: CoverageEvent | null;
};

const REFRESH_MS = 5 * 60_000; // re-compute every 5min

/**
 * WHI-755 — Card de cobertura satelital por ciudad.
 *
 * Render client-side porque las páginas de ciudad son SSG (`generateStaticParams`)
 * pero el cálculo es time-dependent. Fetcha los TLEs de un endpoint público
 * cacheado (1h en CDN) y propaga SGP4 localmente — ~16ms por ciudad.
 *
 * Tono visual:
 *  - Pase reciente (<12h): tono neutral, mensaje "VIIRS escaneó hace X — sin alertas"
 *  - Pase viejo (>12h): tono cauteloso, "última pasada hace X — esperando próxima"
 *  - Sin TLEs / falla: no renderiza
 */
type ComputedCoverage = Coverage & { computedAt: number };

export function CitySatelliteCoverage({ lat, lng, cityName }: Props) {
  // Guardamos el `computedAt` junto al cómputo para que el render derive
  // `lastMsAgo` / `nextMs` desde state puro (la regla react-hooks/purity de
  // React 19 prohíbe Date.now() en el render). Cada recompute actualiza
  // ambos valores juntos.
  const [coverage, setCoverage] = useState<ComputedCoverage | null>(null);
  const [loading, setLoading] = useState(true);
  // Hold the interval id in a ref so the effect cleanup can clear it
  // synchronously — avoids the orphaned-interval window of awaiting the promise.
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch("/api/satellites/tles");
        if (!res.ok) {
          if (!cancelled) setLoading(false);
          return;
        }
        const { tles } = (await res.json()) as { tles: SatelliteTLE[] };
        if (cancelled || tles.length === 0) {
          if (!cancelled) setLoading(false);
          return;
        }
        const compute = () => {
          const now = new Date();
          setCoverage({
            last: findLastVIIRSCoverage(lat, lng, tles, now),
            next: findNextVIIRSCoverage(lat, lng, tles, now),
            computedAt: now.getTime(),
          });
          setLoading(false);
        };
        compute();
        intervalRef.current = setInterval(compute, REFRESH_MS);
      } catch {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [lat, lng]);

  if (loading || !coverage || (!coverage.last && !coverage.next)) return null;

  const lastMsAgo = coverage.last ? coverage.computedAt - coverage.last.at.getTime() : null;
  const nextMs = coverage.next ? coverage.next.at.getTime() - coverage.computedAt : null;
  const isStale = lastMsAgo !== null && lastMsAgo > 12 * 60 * 60_000;

  return (
    <div
      className="border border-border rounded-xl"
      style={{
        padding: "20px 24px",
        background: "var(--surface)",
      }}
    >
      <div className="flex items-center gap-2 mb-3">
        <span aria-hidden style={{ fontSize: 14 }}>
          🛰
        </span>
        <span className="font-mono text-[10px] text-muted tracking-[0.12em] uppercase">
          Cobertura satelital · {cityName}
        </span>
      </div>
      <div className="grid gap-2.5" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {coverage.last && lastMsAgo !== null && (
          <CoverageRow
            label="Última pasada VIIRS"
            primary={`${coverage.last.name} ${formatTimeAgo(lastMsAgo)}`}
            sub={isStale ? "esperando próxima" : "sin alertas en tu zona"}
            tone={isStale ? "warn" : "neutral"}
          />
        )}
        {coverage.next && nextMs !== null && (
          <CoverageRow
            label="Próxima pasada VIIRS"
            primary={`${coverage.next.name} en ${formatCountdown(nextMs)}`}
            sub={`${coverage.next.at.toLocaleTimeString("es-AR", {
              timeZone: "America/Argentina/Buenos_Aires",
              hour: "2-digit",
              minute: "2-digit",
            })} ART`}
            tone="neutral"
          />
        )}
      </div>
    </div>
  );
}

function CoverageRow({
  label,
  primary,
  sub,
  tone,
}: {
  label: string;
  primary: string;
  sub: string;
  tone: "neutral" | "warn";
}) {
  return (
    <div>
      <div
        className="font-mono text-[9px] text-muted tracking-[0.15em] uppercase mb-1"
      >
        {label}
      </div>
      <div
        className="text-foreground font-medium"
        style={{
          fontSize: 14,
          color: tone === "warn" ? "var(--warn)" : "var(--foreground)",
        }}
      >
        {primary}
      </div>
      <div className="font-mono text-[11px] text-muted mt-0.5">{sub}</div>
    </div>
  );
}
