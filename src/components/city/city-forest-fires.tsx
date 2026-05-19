"use client";

import { useEffect, useState } from "react";
import { haversineKm } from "@/lib/geo";
import { cardinalToSpanish, degreesToCardinal } from "@/lib/wind";
import { forestZoneName } from "@/lib/forest-zones";

interface Fire {
  latitude: number;
  longitude: number;
  frp: number;
  acqDate: string;
  acqTime: string;
  forestZone?: string;
}

interface NearbyFire extends Fire {
  distanceKm: number;
  bearing: number;
}

const RADIUS_KM = 100;
const MAX_DISPLAY = 3;

/**
 * WHI-759 — bloque "focos forestales cerca de [ciudad]" en las 78 páginas SSG.
 *
 * Doble entry SEO: las páginas ya rankean por "calidad del aire en X", ahora
 * también por "incendios forestales cerca de X". Y para el usuario que llega
 * por cualquier vía, convierte la ausencia ("sin actividad forestal") en
 * información — eso es valor que ningún competidor genérico ofrece.
 *
 * Render client-side porque las páginas son SSG (`generateStaticParams`) pero
 * los focos cambian cada 15 min. Fetch al mount + sin auto-refresh (el usuario
 * que vuelva tiene HTML fresco).
 */
export function CityForestFires({
  lat,
  lng,
  cityName,
}: {
  lat: number;
  lng: number;
  cityName: string;
}) {
  const [fires, setFires] = useState<NearbyFire[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/fires")
      .then((r) => r.json())
      .then((data: { fires?: Fire[] }) => {
        if (cancelled) return;
        const nearby = (data.fires ?? [])
          .filter((f) => f.forestZone)
          .map((f) => {
            const distanceKm = haversineKm(lat, lng, f.latitude, f.longitude);
            const bearing = bearingDegrees(lat, lng, f.latitude, f.longitude);
            return { ...f, distanceKm, bearing };
          })
          .filter((f) => f.distanceKm <= RADIUS_KM)
          .sort((a, b) => a.distanceKm - b.distanceKm)
          .slice(0, MAX_DISPLAY);
        setFires(nearby);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lat, lng]);

  if (loading || fires === null) return null;

  if (fires.length === 0) {
    return (
      <div
        className="border border-border rounded-xl"
        style={{ padding: "20px 24px", background: "var(--surface)" }}
      >
        <div className="flex items-center gap-2">
          <span aria-hidden style={{ fontSize: 14 }}>
            🛡
          </span>
          <span className="font-mono text-[10px] text-muted tracking-[0.12em] uppercase">
            Actividad forestal · {cityName}
          </span>
        </div>
        <p
          className="mt-2 m-0"
          style={{ fontSize: 15, fontWeight: 500, color: "var(--good)" }}
        >
          Sin actividad forestal en {RADIUS_KM} km
        </p>
        <p className="mt-1 font-mono text-[11px] text-muted">
          Última verificación: NASA FIRMS VIIRS, últimas 24h
        </p>
      </div>
    );
  }

  return (
    <div
      className="border border-border rounded-xl"
      style={{ padding: "20px 24px", background: "var(--surface)" }}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span aria-hidden style={{ fontSize: 14 }}>
            🔥
          </span>
          <span className="font-mono text-[10px] text-muted tracking-[0.12em] uppercase">
            Focos forestales cerca de {cityName}
          </span>
        </div>
        <span className="font-mono text-[11px] text-muted tabular-nums">
          {fires.length} en {RADIUS_KM} km
        </span>
      </div>
      <ul className="flex flex-col gap-2 list-none p-0 m-0">
        {fires.map((f) => (
          <FireRow key={`${f.latitude}_${f.longitude}_${f.acqDate}_${f.acqTime}`} fire={f} />
        ))}
      </ul>
    </div>
  );
}

function FireRow({ fire }: { fire: NearbyFire }) {
  const cardinal = cardinalToSpanish(degreesToCardinal(fire.bearing));
  const zone = forestZoneName(fire.forestZone);
  const ageMin = minutesSinceDetection(fire.acqDate, fire.acqTime);
  const dist = Math.round(fire.distanceKm * 10) / 10;
  const tone = intensityTone(fire.frp);
  return (
    <li
      className="flex items-center gap-3 border border-border rounded-lg"
      style={{ padding: "10px 12px", background: "var(--surface-2)" }}
    >
      <span
        className="h-2 w-2 rounded-full shrink-0"
        style={{ background: tone.color }}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span style={{ fontSize: 14, fontWeight: 500 }}>{dist} km {cardinal}</span>
          <span className="font-mono text-[11px] text-muted">
            · {fire.frp.toFixed(1)} MW · {tone.label}
          </span>
        </div>
        <div className="font-mono text-[10px] text-muted mt-0.5">
          {zone ?? "Forestal"} · detectado hace {formatAge(ageMin)}
        </div>
      </div>
    </li>
  );
}

function intensityTone(frp: number): { label: string; color: string } {
  if (frp >= 20) return { label: "alta", color: "#dc2626" };
  if (frp >= 5) return { label: "moderada", color: "#ef4444" };
  return { label: "baja", color: "#f97316" };
}

// Mismo helper que /api/alerts. Inline acá porque es client-side y no quiero
// importar todo `route.ts`.
function minutesSinceDetection(acqDate: string, acqTime: string): number {
  if (!acqDate || !acqTime) return 0;
  const padded = acqTime.padStart(4, "0");
  const hh = padded.slice(0, 2);
  const mm = padded.slice(2, 4);
  const ts = Date.parse(`${acqDate}T${hh}:${mm}:00Z`);
  if (Number.isNaN(ts)) return 0;
  return Math.max(0, Math.round((Date.now() - ts) / 60000));
}

function bearingDegrees(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function formatAge(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h < 24) return m === 0 ? `${h}h` : `${h}h ${m}min`;
  return `${Math.floor(h / 24)}d`;
}
