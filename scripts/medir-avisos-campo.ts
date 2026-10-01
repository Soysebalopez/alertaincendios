/**
 * ¿Cuántos avisos de CAMPO recibiría un suscriptor por año? (2026-10-01)
 *
 * Rehace la medición con la que Seba eligió la capa de campo el 28/9 (archivo
 * NASA FIRMS 2023–2024, 79 ciudades, un aviso por incendio), ahora sumando los
 * tres satélites con VIIRS. Aquella medición no quedó en el repo; ésta sí.
 *
 * Primero mide con Suomi-NPP SOLO, que tiene que dar los números del 28/9
 * (ciudad típica / peor): 135 / 2.097 a 100 km, 8,5 / 360 a 20 km, 1,5 / 72 a
 * 20 km con FRP > 10. Si no da eso, el método no es el mismo y la comparación
 * con tres satélites no vale nada. Después mide con los tres.
 *
 * Mismas reglas que la capa de campo en producción (src/lib/campo-alerts.ts):
 * fuera de las zonas de bosque, sin fuentes fijas (type ≠ 0 en el archivo, o
 * en la lista por posición), y un aviso por incendio: no se repite si esa
 * ciudad ya recibió uno a ≤ 2 km en las 24 h anteriores.
 *
 * ⚠️ NASA bloquea los servidores de datacenter: correrlo desde una conexión
 * común (la compu de Seba), no desde la nube.
 *
 * Uso:
 *   NODE_OPTIONS=--conditions=react-server npx tsx --tsconfig tsconfig.json \
 *     scripts/medir-avisos-campo.ts 2023 2024
 */
import { isInArgentina } from '@/lib/argentina-polygon'
import { haversineKm } from '@/lib/geo'
import { findForestZone } from '@/lib/forest-zones-geo'
import { isStaticHeatSource } from '@/lib/static-heat-sources'
import { PROVINCES } from '@/lib/argentina-cities'
import { INCIDENT_HOURS, INCIDENT_KM } from '@/lib/fire-incident'

type Foco = { lat: number; lng: number; t: number; frp: number; sat: string }

const SATELITES = [
  { sat: 'N', carpeta: 'viirs-snpp' },
  { sat: 'N20', carpeta: 'viirs-noaa20' },
  { sat: 'N21', carpeta: 'viirs-noaa21' },
] as const

const ESCENARIOS = [
  { nombre: 'todo, 100 km', radioKm: 100, frpMin: -1, el28: '135 / 2.097' },
  { nombre: 'todo, 20 km', radioKm: 20, frpMin: -1, el28: '8,5 / 360' },
  { nombre: 'FRP > 10, 20 km (HOY)', radioKm: 20, frpMin: 10, el28: '1,5 / 72' },
]

async function descargar(carpeta: string, anio: string, sat: string): Promise<Foco[] | null> {
  const url = `https://firms.modaps.eosdis.nasa.gov/data/country/${carpeta}/${anio}/${carpeta}_${anio}_Argentina.csv`
  const res = await fetch(url)
  if (!res.ok) {
    console.warn(`  ${carpeta} ${anio}: HTTP ${res.status} — no está ese archivo`)
    return null
  }
  const lines = (await res.text()).trim().split('\n')
  const h = lines[0].split(',')
  const ix = (k: string) => h.indexOf(k)
  if (ix('type') < 0) throw new Error(`${carpeta} ${anio}: el archivo no trae la columna type`)
  const out: Foco[] = []
  for (const l of lines.slice(1)) {
    const c = l.split(',')
    if (c[ix('confidence')] === 'l') continue // el sync descarta confianza baja
    if (+c[ix('type')] !== 0) continue // fuente fija según NASA
    const lat = +c[ix('latitude')], lng = +c[ix('longitude')]
    if (!isInArgentina(lat, lng)) continue
    const hhmm = c[ix('acq_time')].padStart(4, '0')
    const t = Date.parse(`${c[ix('acq_date')]}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}:00Z`)
    out.push({ lat, lng, t, frp: +c[ix('frp')], sat })
  }
  console.log(`  ${carpeta} ${anio}: ${out.length} detecciones de vegetación`)
  return out
}

/** Avisos que recibiría una ciudad: un aviso por incendio (≤ 2 km, ≤ 24 h). */
function avisos(focos: Foco[], lat: number, lng: number, radioKm: number, frpMin: number): number {
  const cerca = focos
    .filter((f) => f.frp > frpMin && Math.abs(f.lat - lat) < radioKm / 100 + 0.1 &&
      haversineKm(lat, lng, f.lat, f.lng) <= radioKm)
    .sort((a, b) => a.t - b.t)
  const avisados: Foco[] = []
  for (const f of cerca) {
    const desde = f.t - INCIDENT_HOURS * 3600e3
    const repetido = avisados.some((a) => a.t >= desde && haversineKm(a.lat, a.lng, f.lat, f.lng) <= INCIDENT_KM)
    if (!repetido) avisados.push(f)
  }
  return avisados.length
}

const mediana = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2
}

async function main() {
  const anios = process.argv.slice(2)
  if (anios.length === 0) throw new Error('Pasá los años del archivo, por ejemplo: 2023 2024')

  console.log('Descargando el archivo de NASA…')
  const porSat = new Map<string, Foco[]>()
  const aniosPorSat = new Map<string, number>()
  for (const s of SATELITES) {
    const partes = (await Promise.all(anios.map((a) => descargar(s.carpeta, a, s.sat)))).filter(
      (p): p is Foco[] => p !== null,
    )
    porSat.set(s.sat, partes.flat())
    aniosPorSat.set(s.sat, partes.length)
  }

  // Capa de campo: fuera de bosque y sin fuentes fijas por posición.
  const deCampo = (fs: Foco[]) =>
    fs.filter((f) => !findForestZone(f.lat, f.lng) && !isStaticHeatSource(f.lat, f.lng))

  const ciudades = PROVINCES.flatMap((p) => p.cities.map((c) => ({ ...c, provincia: p.name })))
  console.log(`\n${ciudades.length} ciudades, años ${anios.join(', ')}\n`)

  const combinaciones = [
    { nombre: 'Suomi-NPP solo (debe dar lo del 28/9)', sats: ['N'] },
    { nombre: 'Los tres satélites', sats: ['N', 'N20', 'N21'] },
  ]
  for (const comb of combinaciones) {
    const faltan = comb.sats.filter((s) => aniosPorSat.get(s) !== anios.length)
    if (faltan.length) {
      console.log(`⚠️  ${comb.nombre}: faltan años de ${faltan.join(', ')}; el promedio por año no es comparable.`)
    }
    const focos = deCampo(comb.sats.flatMap((s) => porSat.get(s) ?? []))
    console.log(`== ${comb.nombre} (${focos.length} detecciones de campo)`)
    for (const e of ESCENARIOS) {
      const porCiudad = ciudades.map((c) => ({
        ciudad: `${c.name} (${c.provincia})`,
        n: avisos(focos, c.lat, c.lng, e.radioKm, e.frpMin) / anios.length,
      }))
      const peor = porCiudad.reduce((a, b) => (b.n > a.n ? b : a))
      const prom = porCiudad.reduce((s, c) => s + c.n, 0) / porCiudad.length
      console.log(
        `  ${e.nombre.padEnd(24)} mediana ${mediana(porCiudad.map((c) => c.n)).toFixed(1).padStart(6)}` +
          ` · promedio ${prom.toFixed(1).padStart(6)} · peor ${peor.n.toFixed(0).padStart(5)} ${peor.ciudad}` +
          `   [28/9, Suomi-NPP: ${e.el28}]`,
      )
    }
    console.log('')
  }
}
main().catch((e) => { console.error(e); process.exit(1) })
