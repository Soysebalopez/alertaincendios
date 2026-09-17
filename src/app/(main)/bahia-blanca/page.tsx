import type { Metadata } from "next";
import { Suspense } from "react";
import { Bell, ClockCounterClockwise, MapPin } from "@phosphor-icons/react/dist/ssr";
import { BahiaAirportWind } from "@/components/bahia/bahia-airport-wind";
import { BahiaLightning } from "@/components/bahia/bahia-lightning";
import { CityDashboard } from "@/components/city/city-dashboard";
import { CityForestFires } from "@/components/city/city-forest-fires";
import { CitySatelliteCoverage } from "@/components/city/city-satellite-coverage";
import { CityContext } from "@/components/city/city-context";
import { Pill } from "@/components/clara-ui";
import { CityJsonLd } from "@/components/jsonld";
import { BAHIA_BLANCA, BAHIA_BOT_URL, BAHIA_PAGE_PATH, parseFocus } from "@/lib/bahia-blanca";
import { SITE_URL as SITE_URL_CANONICO } from "@/lib/site-url";

/**
 * WHI-907 part 9 — Bahía Blanca's own page, with everything we have for the
 * city. /ciudad/buenos-aires/bahia-blanca redirects here (next.config.ts), so
 * there is only one Bahía page.
 *
 * ?foco=<lat>,<lng> (from a fire alert) centers the map on that fire.
 */
const DESCRIPTION =
  "Focos de incendio cerca de Bahía Blanca, hacia dónde va el humo, viento medido en el aeropuerto, rayos y calidad del aire. Alertas gratis por Telegram.";

export const metadata: Metadata = {
  title: "Incendios forestales en Bahía Blanca — focos activos, viento y rayos",
  description: DESCRIPTION,
  alternates: { canonical: BAHIA_PAGE_PATH },
  openGraph: { title: "Incendios forestales en Bahía Blanca — AlertaForestal", description: DESCRIPTION },
  twitter: {
    card: "summary_large_image",
    title: "Incendios forestales en Bahía Blanca — AlertaForestal",
    description: DESCRIPTION,
  },
};

export default async function BahiaBlancaPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { foco } = await searchParams;
  const focus = parseFocus(foco);
  const siteUrl = SITE_URL_CANONICO;

  return (
    <>
      <CityJsonLd
        cityName={BAHIA_BLANCA.name}
        provinceName={BAHIA_BLANCA.province}
        lat={BAHIA_BLANCA.lat}
        lng={BAHIA_BLANCA.lng}
        url={`${siteUrl}${BAHIA_PAGE_PATH}`}
      />

      {/* Hero */}
      <section
        className="clara-section-padded border-b border-border"
        style={{ padding: "48px 32px 32px" }}
      >
        <div className="max-w-[1400px] mx-auto">
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div>
              <Pill>
                <MapPin size={10} weight="duotone" /> {BAHIA_BLANCA.name}, {BAHIA_BLANCA.province} ·{" "}
                {BAHIA_BLANCA.lat.toFixed(2)}° {BAHIA_BLANCA.lng.toFixed(2)}°
              </Pill>
              <h1
                style={{
                  fontFamily: "var(--font-sans)",
                  fontSize: "clamp(40px, 6vw, 80px)",
                  fontWeight: 800,
                  letterSpacing: "-0.035em",
                  lineHeight: 1,
                  margin: "14px 0 0",
                }}
              >
                {/* Mismo criterio que las páginas de `/ciudad/`: el H1 decía sólo
                    el nombre de la ciudad, sin «incendios» ni «focos» ni nada que
                    dijera de qué trata la página. */}
                Incendios forestales en Bahía Blanca
              </h1>
              <p className="text-muted m-0 mt-3 max-w-[640px]" style={{ fontSize: 15, lineHeight: 1.6 }}>
                Focos de incendio, hacia dónde va el humo, viento y rayos alrededor de la ciudad, en un
                solo lugar.
              </p>
            </div>
            <SubscribeButton />
          </div>
        </div>
      </section>

      {/* Dashboard */}
      <section className="clara-section-padded" style={{ padding: "32px" }}>
        <div className="max-w-[1400px] mx-auto flex flex-col gap-6">
          <CityForestFires
            cityName={BAHIA_BLANCA.name}
            lat={BAHIA_BLANCA.lat}
            lng={BAHIA_BLANCA.lng}
            fireFilter="vegetation"
          />
          <div className="clara-two-col grid" style={{ gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <Suspense fallback={null}>
              <BahiaAirportWind />
            </Suspense>
            <Suspense fallback={null}>
              <BahiaLightning />
            </Suspense>
          </div>
          <CityDashboard
            cityName={BAHIA_BLANCA.name}
            provinceName={BAHIA_BLANCA.province}
            lat={BAHIA_BLANCA.lat}
            lng={BAHIA_BLANCA.lng}
            focus={focus}
            fireFilter="vegetation"
            mapHeight={560}
          />
          <HistoryCard />
          <div className="mt-6">
            <CitySatelliteCoverage
              lat={BAHIA_BLANCA.lat}
              lng={BAHIA_BLANCA.lng}
              cityName={BAHIA_BLANCA.name}
            />
          </div>
        </div>
      </section>

      {/* Subscribe */}
      {/* WHI-919: el mismo contenido servido en el HTML inicial que llevan las
          páginas de `/ciudad/`. Bahía Blanca tiene página propia (WHI-907) y
          quedó afuera de ese cambio por estar fuera del patrón de rutas. */}
      <CityContext
        cityName={BAHIA_BLANCA.name}
        provinceName={BAHIA_BLANCA.province}
        provinceId="buenos-aires"
      />

      <section
        className="clara-section-padded border-t border-border"
        style={{ padding: "48px 32px" }}
      >
        <div className="max-w-[1400px] mx-auto flex flex-col gap-4 items-start">
          <h2
            className="m-0"
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: "-0.02em",
            }}
          >
            Recibí las alertas de Bahía Blanca
          </h2>
          <p className="text-muted m-0" style={{ fontSize: 14 }}>
            Gratis, por Telegram.
          </p>
          <SubscribeButton />
          <p className="font-mono text-[10px] text-muted m-0" style={{ letterSpacing: "0.06em" }}>
            Datos: NASA FIRMS · NOAA GOES-19 · SMN WRF 4 km (CC BY 2.5 AR) · METAR SAZB (aviationweather.gov) ·
            Open-Meteo / CAMS
          </p>
        </div>
      </section>
    </>
  );
}

function SubscribeButton() {
  return (
    <a
      href={BAHIA_BOT_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="clara-tap inline-flex items-center gap-2.5 text-white font-semibold transition-transform active:scale-[0.98]"
      style={{
        padding: "12px 18px",
        borderRadius: 10,
        background: "var(--accent)",
        fontSize: 13,
        textDecoration: "none",
        boxShadow: "0 10px 30px -14px var(--accent)",
      }}
    >
      <Bell size={14} weight="duotone" /> Recibí las alertas de Bahía Blanca
    </a>
  );
}

// Measured in WHI-903 (3.905 vegetation fires, ~100 km box, flares removed)
// and in the municipal pricing analysis (29 per year within 50 km, FRP > 10 MW).
function HistoryCard() {
  return (
    <div
      className="border border-border rounded-xl"
      style={{ padding: "20px 24px", background: "var(--surface)" }}
    >
      <div className="flex items-center gap-2">
        <ClockCounterClockwise size={14} weight="duotone" />
        <span className="font-mono text-[10px] text-muted tracking-[0.12em] uppercase">
          Historial · 2023–2025
        </span>
      </div>
      <div
        className="grid gap-4 mt-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}
      >
        <HistoryStat
          value="3.905"
          label="focos de vegetación detectados en unos 100 km alrededor de la ciudad"
        />
        <HistoryStat
          value="29 por año"
          label="fuegos a menos de 50 km con más de 10 MW de potencia"
        />
      </div>
      <p className="mt-3 m-0 font-mono text-[11px] text-muted">
        NASA FIRMS (VIIRS) · sin las antorchas del polo petroquímico de Ingeniero White
      </p>
    </div>
  );
}

function HistoryStat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ paddingLeft: 12, borderLeft: "2px solid var(--accent)" }}>
      <div
        className="font-mono text-foreground font-medium"
        style={{ fontSize: 26, letterSpacing: "-0.02em" }}
      >
        {value}
      </div>
      <div className="text-[12px] text-muted mt-1 leading-snug">{label}</div>
    </div>
  );
}
