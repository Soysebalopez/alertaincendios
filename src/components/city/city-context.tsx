import Link from "next/link";
import {
  AQI_THRESHOLDS,
  AIR_LEVEL_LABELS,
  POLLUTANT_LABELS,
} from "@/lib/air-quality";

/**
 * EL CONTENIDO DE UNA PÁGINA DE CIUDAD QUE VIENE EN EL HTML INICIAL (WHI-919).
 *
 * 🔴 ESTE ARCHIVO NO TIENE `"use client"` A PROPÓSITO, Y ES TODO EL PUNTO.
 *
 * Las 77 páginas de ciudad medían 168 palabras, sin un solo H2, y todo lo que
 * tenían de contenido —calidad del aire, viento, contaminantes, resumen— decía
 * «Cargando» y «—» hasta que el navegador ejecutaba JavaScript. Para un buscador
 * eso son 77 URLs casi idénticas con el nombre de ciudad cambiado: el patrón que
 * trata como página puerta, y que puede decidir no indexar.
 *
 * El problema nunca fue la estrategia —una página por ciudad está bien—, sino
 * que no hubiera nada que leer al llegar. Lo que va acá es lo que se puede
 * afirmar de cualquier ciudad sin inventar nada, servido de entrada.
 *
 * ⚠️ LO QUE FALTA, Y NO SE PUEDE AUTOMATIZAR SIN MENTIR: el contexto real por
 * zona —qué vegetación hay, cuándo es la temporada local, qué pasó
 * históricamente ahí—. `argentina-cities.ts` sólo guarda nombre y coordenadas,
 * así que ese texto hay que escribirlo con una fuente en la mano, provincia por
 * provincia. Prioridad por temporada: Córdoba, Corrientes, Patagonia (Chubut,
 * Río Negro, Neuquén), Salta y La Pampa.
 */

const H2 = {
  fontFamily: "var(--font-sans)",
  fontSize: "clamp(20px, 2.4vw, 28px)",
  fontWeight: 700,
  letterSpacing: "-0.02em",
  margin: "0 0 12px",
} as const;

const P = {
  fontSize: 15,
  lineHeight: 1.65,
  color: "var(--muted)",
  margin: "0 0 12px",
} as const;

/** Los contaminantes que el tablero de arriba muestra, en el mismo orden. */
const CONTAMINANTES = ["PM25", "PM10", "NO2", "O3"] as const;

export function CityContext({
  cityName,
  provinceName,
  provinceId,
}: {
  cityName: string;
  provinceName: string;
  provinceId: string;
}) {
  return (
    <section
      className="clara-section-padded border-t border-border"
      style={{ padding: "48px 32px" }}
    >
      <div
        className="max-w-[1400px] mx-auto flex flex-col"
        style={{ gap: 48, maxWidth: 820 }}
      >
        <div>
          <h2 style={H2}>Qué hacer si hay un foco cerca de {cityName}</h2>
          <p style={P}>
            Un foco detectado a decenas de kilómetros no es una emergencia por sí
            solo. Lo que decide si te afecta son dos cosas: la{" "}
            <strong>distancia</strong> y, sobre todo, la{" "}
            <strong>dirección del viento</strong>. El humo llega mucho antes que
            el fuego, y llega sólo si el viento apunta hacia donde estás.
          </p>
          <ol style={{ ...P, paddingLeft: 20 }}>
            <li>
              Fijate hacia dónde sopla el viento. Si va desde el foco hacia{" "}
              {cityName}, es cuestión de horas.
            </li>
            <li>
              Cerrá puertas y ventanas antes de que se sienta el olor, no después.
              Una vez que el humo entró, tarda en salir.
            </li>
            <li>
              Si hay personas con asma, EPOC o problemas cardíacos en la casa, o
              bebés, ese es el momento de actuar, no cuando el aire ya está
              cargado.
            </li>
            <li>
              Ante fuego visible o riesgo para viviendas, llamá al{" "}
              <strong>100</strong> (bomberos) o al <strong>911</strong>. Esta
              página informa; no reemplaza a la línea de emergencias.
            </li>
          </ol>
          <p style={P}>
            Si querés que te avisemos en vez de venir a mirar, el bot de Telegram
            te manda un mensaje cuando aparece un foco cerca de {cityName} y el
            viento va hacia tu lado. Es gratis y no pide ningún dato.
          </p>
        </div>

        <div>
          <h2 style={H2}>Por qué un foco de calor no siempre es un incendio</h2>
          <p style={P}>
            Lo que los satélites detectan no es fuego: es{" "}
            <strong>calor</strong>. El sensor VIIRS, a bordo de los satélites
            Suomi-NPP y NOAA-20, mide la temperatura de la superficie y marca los
            puntos anormalmente calientes. Eso incluye incendios forestales, pero
            también quemas agrícolas controladas, antorchas industriales,
            volcanes y plantas de energía.
          </p>
          <p style={P}>
            Por eso acá los focos se muestran separando los que caen en zona
            forestal de los que no. Un punto sobre un campo en época de quema
            planificada y otro sobre un bosque en enero no son la misma noticia,
            aunque el satélite los vea igual.
          </p>
          <p style={P}>
            La otra limitación es el horario: un satélite de órbita polar pasa
            unas pocas veces por día. Entre dos pasadas puede empezar un incendio
            y no aparecer todavía. La página muestra cuándo fue la última pasada
            sobre {cityName} y cuándo es la próxima, justamente para que se pueda
            leer «no hay focos» con la cautela que corresponde.
          </p>
        </div>

        <div>
          <h2 style={H2}>Calidad del aire y humo: cuándo preocuparse</h2>
          <p style={P}>
            El humo de un incendio se mide sobre todo por{" "}
            <strong>PM2.5</strong>: partículas tan chicas que entran hasta lo
            profundo del pulmón. Estos son los valores de referencia de la OMS
            (guías de 2021) que usa el tablero de arriba, en microgramos por metro
            cúbico.
          </p>
          {/*
            En tabla HTML y no en imagen: es la forma en que un buscador —y hoy
            también un modelo— puede leer el umbral y citarlo. En una captura,
            esto mismo es invisible.
          */}
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 14,
              }}
            >
              <caption className="sr-only">
                Valores de referencia de calidad del aire usados en esta página,
                en microgramos por metro cúbico
              </caption>
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  <th
                    scope="col"
                    style={{ textAlign: "left", padding: "8px 12px 8px 0" }}
                  >
                    Contaminante
                  </th>
                  {(["good", "moderate", "bad", "dangerous"] as const).map(
                    (nivel) => (
                      <th
                        key={nivel}
                        scope="col"
                        style={{ textAlign: "left", padding: "8px 12px 8px 0" }}
                      >
                        {AIR_LEVEL_LABELS[nivel]}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {CONTAMINANTES.map((c) => {
                  const t = AQI_THRESHOLDS[c];
                  return (
                    <tr
                      key={c}
                      style={{ borderBottom: "1px solid var(--border)" }}
                    >
                      <th
                        scope="row"
                        style={{
                          textAlign: "left",
                          padding: "10px 12px 10px 0",
                          fontWeight: 600,
                        }}
                      >
                        {POLLUTANT_LABELS[c]}
                      </th>
                      <td style={{ padding: "10px 12px 10px 0", color: "var(--muted)" }}>
                        hasta {t.good}
                      </td>
                      <td style={{ padding: "10px 12px 10px 0", color: "var(--muted)" }}>
                        {t.good}–{t.moderate}
                      </td>
                      <td style={{ padding: "10px 12px 10px 0", color: "var(--muted)" }}>
                        {t.moderate}–{t.bad}
                      </td>
                      <td style={{ padding: "10px 12px 10px 0", color: "var(--muted)" }}>
                        más de {t.bad}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p style={{ ...P, marginTop: 12 }}>
            Con PM2.5 en «malo» conviene no hacer ejercicio al aire libre y
            mantener la casa cerrada. En «peligroso», las personas con problemas
            respiratorios o cardíacos deberían quedarse adentro. Los valores del
            ozono son una aproximación: la OMS lo define sobre 8 horas, no sobre
            24, así que se leen como exposición corta.
          </p>
        </div>

        <div>
          <h2 style={H2}>De dónde salen estos datos</h2>
          <p style={P}>
            Todo lo que ves en esta página tiene una fuente declarada, y ninguna
            es nuestra:
          </p>
          <ul style={{ ...P, paddingLeft: 20 }}>
            <li>
              <strong>Focos de calor:</strong> NASA FIRMS, sensor VIIRS, últimas
              24 horas.
            </li>
            <li>
              <strong>Vigilancia continua:</strong> el satélite geoestacionario
              GOES-19, que mira siempre el mismo hemisferio.
            </li>
            <li>
              <strong>Calidad del aire:</strong> modelo CAMS y satélite
              Sentinel-5P, vía Open-Meteo, con los umbrales de la OMS 2021.
            </li>
            <li>
              <strong>Viento:</strong> Open-Meteo, y en algunas zonas la
              estación meteorológica del aeropuerto.
            </li>
          </ul>
          <p style={P}>
            Lo que hacemos nosotros es cruzarlo y avisarte. La diferencia con un
            mapa de focos es esa:{" "}
            <strong>
              un mapa hay que ir a mirarlo; una alerta te busca.
            </strong>
          </p>
        </div>

        <div>
          <h2 style={H2}>
            Incendios forestales en {provinceName}
          </h2>
          <p style={P}>
            {cityName} es una de las localidades de {provinceName} que
            monitoreamos.{" "}
            <Link
              href={`/provincia/${provinceId}`}
              style={{ color: "var(--accent)" }}
            >
              En la página de {provinceName}
            </Link>{" "}
            están todos los focos de la provincia juntos, que es la vista que
            sirve cuando el fuego está lejos de la ciudad pero dentro de la misma
            zona.
          </p>
        </div>
      </div>
    </section>
  );
}
