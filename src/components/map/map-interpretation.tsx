"use client";

/**
 * Sección interpretativa que va debajo del mapa /mapa. Toma los datos
 * en vivo de los tres ejes del mapa (focos, aire, viento) y los traduce
 * a párrafos en lenguaje natural — texto dinámico, no copy estático.
 *
 * Comparte semántica con el resto del producto: mismas bandas FRP que
 * usa el hero (alta ≥ 20 MW / moderada 5–20 / baja < 5), mismos umbrales
 * OMS que la página de calidad-aire.
 */

import { useEffect, useState } from "react";
import { Fire, Wind as WindIcon, Drop, ArrowRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { PROVINCES } from "@/lib/argentina-cities";
import type { AirLevel } from "@/lib/air-quality";

interface FirePoint {
  latitude: number;
  longitude: number;
  frp: number;
  type?: number;
}

interface AirSample {
  city: string;
  province: string;
  worstLevel: AirLevel;
  worstLevelLabel?: string;
}

interface WindSample {
  city: string;
  speed: number;
  directionEs: string;
}

/** Cuántas ciudades muestreamos para aire/viento. Una por provincia es ideal
 *  pero balanceamos contra el tiempo de carga: 12 puntos cubren toda
 *  Argentina razonablemente y se resuelven en ~2-3s en paralelo. */
const SAMPLE_SIZE = 12;

const AIR_LEVEL_ORDER: AirLevel[] = ["good", "moderate", "bad", "dangerous"];
const AIR_LEVEL_PUBLIC: Record<AirLevel, string> = {
  good: "buena",
  moderate: "moderada",
  bad: "regular",
  dangerous: "peligrosa",
};

function frpBucket(frp: number): "high" | "moderate" | "low" {
  if (frp >= 20) return "high";
  if (frp >= 5) return "moderate";
  return "low";
}

function latitudeBand(lat: number): "norte" | "centro" | "sur" {
  if (lat > -30) return "norte";
  if (lat > -38) return "centro";
  return "sur";
}

/** Pluraliza "foco/focos" según el conteo. */
function pluralFocos(n: number): string {
  return n === 1 ? "foco" : "focos";
}

export function MapInterpretation() {
  const [fires, setFires] = useState<FirePoint[] | null>(null);
  const [airSamples, setAirSamples] = useState<AirSample[]>([]);
  const [windSamples, setWindSamples] = useState<WindSample[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const sampleCities = PROVINCES.slice(0, SAMPLE_SIZE).map((p) => ({
      ...p.cities[0],
      provinceName: p.name,
    }));

    async function load() {
      const firesPromise = fetch("/api/fires")
        .then((r) => r.json())
        .then((d) => (d.fires || []) as FirePoint[])
        .catch(() => [] as FirePoint[]);

      const airPromise = Promise.all(
        sampleCities.map((c) =>
          fetch(`/api/air-quality?lat=${c.lat}&lng=${c.lng}`)
            .then((r) => r.json())
            .then(
              (d) =>
                ({
                  city: c.name,
                  province: c.provinceName,
                  worstLevel: (d.worstLevel || "good") as AirLevel,
                  worstLevelLabel: d.worstLevelLabel,
                }) as AirSample
            )
            .catch(() => null)
        )
      ).then((arr) => arr.filter(Boolean) as AirSample[]);

      const windPromise = Promise.all(
        sampleCities.map((c) =>
          fetch(`/api/wind?lat=${c.lat}&lng=${c.lng}`)
            .then((r) => r.json())
            .then((d) =>
              d.windSpeed != null
                ? ({
                    city: c.name,
                    speed: d.windSpeed,
                    directionEs: d.windDirectionLabelEs || "—",
                  } as WindSample)
                : null
            )
            .catch(() => null)
        )
      ).then((arr) => arr.filter(Boolean) as WindSample[]);

      const [firesData, airData, windData] = await Promise.all([
        firesPromise,
        airPromise,
        windPromise,
      ]);
      if (cancelled) return;
      setFires(firesData);
      setAirSamples(airData);
      setWindSamples(windData);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const firesText = buildFiresText(fires);
  const airText = buildAirText(airSamples);
  const windText = buildWindText(windSamples);

  return (
    <section
      className="border-t border-border"
      style={{ background: "var(--surface)" }}
    >
      <div
        className="max-w-[1400px] mx-auto"
        style={{ padding: "56px 32px 72px" }}
      >
        <div className="mb-6">
          <div className="font-mono text-[10px] text-accent tracking-[0.15em] uppercase mb-2">
            Lectura en vivo
          </div>
          <h2
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1.1,
              margin: 0,
            }}
          >
            Qué está pasando ahora en el mapa
          </h2>
          <p
            className="text-muted mt-2"
            style={{ fontSize: 14, maxWidth: "62ch" }}
          >
            Interpretación automática de las tres capas — focos, calidad del
            aire y viento — generada a partir de los datos visibles en este
            momento.
          </p>
        </div>

        <div
          className="clara-interp-grid grid gap-4"
          style={{ gridTemplateColumns: "repeat(3, 1fr)" }}
        >
          <InterpCard
            icon={<Fire size={18} weight="duotone" />}
            color="#e8622c"
            title="Focos activos"
            body={firesText}
            loading={loading}
            cta={{ label: "Ver historial", href: "/historial" }}
          />
          <InterpCard
            icon={<Drop size={18} weight="duotone" />}
            color="#22c55e"
            title="Calidad del aire"
            body={airText}
            loading={loading && airSamples.length === 0}
            cta={{ label: "Ver 78 ciudades", href: "/calidad-aire" }}
          />
          <InterpCard
            icon={<WindIcon size={18} weight="duotone" />}
            color="#3b82f6"
            title="Viento"
            body={windText}
            loading={loading && windSamples.length === 0}
          />
        </div>

        <p
          className="font-mono text-muted mt-6"
          style={{ fontSize: 11, letterSpacing: "0.02em" }}
        >
          Fuente: NASA FIRMS · Open-Meteo CAMS · Open-Meteo Forecast. La lectura
          se actualiza al recargar la página.
        </p>
      </div>
    </section>
  );
}

/* ─── Builders de texto ─── */

function buildFiresText(fires: FirePoint[] | null): React.ReactNode {
  if (fires === null) return null;
  if (fires.length === 0)
    return (
      <p>
        Sin focos de calor detectados en territorio argentino en este momento.
      </p>
    );

  const buckets = { high: 0, moderate: 0, low: 0, industrial: 0 };
  const bands = { norte: 0, centro: 0, sur: 0 };
  for (const f of fires) {
    const isWild = (f.type ?? 0) === 0 || f.type === 1;
    if (!isWild) {
      buckets.industrial++;
      continue;
    }
    buckets[frpBucket(f.frp)]++;
    bands[latitudeBand(f.latitude)]++;
  }

  const wildTotal = buckets.high + buckets.moderate + buckets.low;
  const dominantBand = (Object.entries(bands) as [keyof typeof bands, number][])
    .sort(([, a], [, b]) => b - a)[0];

  return (
    <>
      <p>
        Se detectan <strong>{wildTotal}</strong> {pluralFocos(wildTotal)} de
        calor en Argentina.{" "}
        {buckets.high > 0 ? (
          <>
            <strong>{buckets.high}</strong> de alta intensidad (FRP ≥ 20 MW —
            incendio forestal significativo)
            {buckets.moderate + buckets.low > 0 ? ", " : "."}
          </>
        ) : (
          "Ninguno alcanza el umbral de alta intensidad. "
        )}
        {buckets.moderate > 0 && (
          <>
            <strong>{buckets.moderate}</strong>{" "}
            {buckets.moderate === 1 ? "moderado" : "moderados"}
            {buckets.low > 0 ? " y " : "."}
          </>
        )}
        {buckets.low > 0 && (
          <>
            <strong>{buckets.low}</strong> de baja intensidad — probable quema
            agrícola o foco menor.
          </>
        )}
      </p>
      {dominantBand && dominantBand[1] > 0 && (
        <p>
          Mayor concentración en la región{" "}
          <strong>{dominantBand[0]}</strong> del país ({dominantBand[1]}{" "}
          {pluralFocos(dominantBand[1])}).
        </p>
      )}
      {buckets.industrial > 0 && (
        <p className="text-muted" style={{ fontSize: 13 }}>
          + {buckets.industrial} {pluralFocos(buckets.industrial)} adicional
          {buckets.industrial === 1 ? "" : "es"} clasificado
          {buckets.industrial === 1 ? "" : "s"} como flaring industrial u
          offshore (excluidos del conteo de incendios).
        </p>
      )}
    </>
  );
}

function buildAirText(samples: AirSample[]): React.ReactNode {
  if (samples.length === 0) return null;

  const total = samples.length;
  const overThreshold = samples.filter((s) => s.worstLevel !== "good");
  const worst = samples
    .slice()
    .sort(
      (a, b) =>
        AIR_LEVEL_ORDER.indexOf(b.worstLevel) -
        AIR_LEVEL_ORDER.indexOf(a.worstLevel)
    )[0];

  if (overThreshold.length === 0)
    return (
      <p>
        Calidad del aire dentro de los rangos recomendados por la OMS en las{" "}
        {total} ciudades muestreadas. Sin alertas activas.
      </p>
    );

  return (
    <>
      <p>
        <strong>{overThreshold.length}</strong> de {total} ciudades muestreadas
        superan los rangos recomendados por la OMS para al menos un
        contaminante.
      </p>
      {worst && worst.worstLevel !== "good" && (
        <p>
          La situación más crítica se registra en <strong>{worst.city}</strong>{" "}
          ({worst.province}), con calidad{" "}
          <strong>{AIR_LEVEL_PUBLIC[worst.worstLevel]}</strong>.
        </p>
      )}
    </>
  );
}

function buildWindText(samples: WindSample[]): React.ReactNode {
  if (samples.length === 0) return null;

  const avgSpeed = samples.reduce((acc, s) => acc + s.speed, 0) / samples.length;
  const max = samples.slice().sort((a, b) => b.speed - a.speed)[0];

  const dirCounts: Record<string, number> = {};
  for (const s of samples) dirCounts[s.directionEs] = (dirCounts[s.directionEs] || 0) + 1;
  const predominant = Object.entries(dirCounts).sort(
    ([, a], [, b]) => b - a
  )[0];

  return (
    <>
      <p>
        Velocidad promedio de <strong>{avgSpeed.toFixed(1)} km/h</strong> sobre
        las ciudades muestreadas
        {predominant && (
          <>
            , con dirección predominante del <strong>{predominant[0]}</strong>
          </>
        )}
        .
      </p>
      {max && (
        <p>
          Pico registrado en <strong>{max.city}</strong>:{" "}
          <strong>{max.speed.toFixed(0)} km/h</strong> dirección{" "}
          {max.directionEs}.
        </p>
      )}
    </>
  );
}

/* ─── Card ─── */

function InterpCard({
  icon,
  color,
  title,
  body,
  loading,
  cta,
}: {
  icon: React.ReactNode;
  color: string;
  title: string;
  body: React.ReactNode;
  loading: boolean;
  cta?: { label: string; href: string };
}) {
  return (
    <article
      style={{
        padding: "22px 24px",
        borderRadius: 14,
        background: "var(--background)",
        border: "1px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div className="flex items-center gap-2.5">
        <span
          className="grid place-items-center"
          style={{
            width: 32,
            height: 32,
            borderRadius: 8,
            background: `${color}18`,
            color,
            border: `1px solid ${color}30`,
          }}
        >
          {icon}
        </span>
        <h3
          style={{
            fontFamily: "var(--font-sans)",
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: "-0.01em",
            margin: 0,
          }}
        >
          {title}
        </h3>
      </div>

      <div
        style={{
          fontSize: 14,
          lineHeight: 1.6,
          color: "color-mix(in oklab, var(--foreground) 85%, transparent)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
          flex: 1,
        }}
      >
        {loading ? (
          <span className="font-mono text-muted animate-pulse text-[12px]">
            Leyendo datos…
          </span>
        ) : (
          body
        )}
      </div>

      {cta && !loading && (
        <Link
          href={cta.href}
          className="inline-flex items-center gap-1.5 text-accent font-medium mt-auto"
          style={{ fontSize: 13 }}
        >
          {cta.label} <ArrowRight size={13} />
        </Link>
      )}
    </article>
  );
}
