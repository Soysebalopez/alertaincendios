/**
 * Genera src/lib/static-heat-sources-archivo.ts: las fuentes FIJAS de calor de
 * toda Argentina (antorchas, acerías, refinerías, volcanes, plataformas), para
 * que la capa de campo y pastizal no las avise como incendios (28/9).
 *
 * DE DÓNDE SALEN. El archivo histórico de NASA FIRMS (VIIRS S-NPP, el mismo
 * satélite que usa el bot) clasifica cada detección con `type`: 0 vegetación,
 * 1 volcán, 2 fuente terrestre estática, 3 costa afuera. El feed en tiempo real
 * NO trae esa columna — por eso el bot las recibe como "vegetación" y hay que
 * reconocerlas por POSICIÓN. Este script junta las detecciones 1/2/3 que caen a
 * ≤1,5 km entre sí y guarda cada sitio con un radio que cubre todas sus celdas
 * más medio kilómetro (píxel de 375 m + error de ubicación).
 *
 * Uso (regenerar una vez por año con el archivo nuevo):
 *   NODE_OPTIONS=--conditions=react-server npx tsx --tsconfig tsconfig.json \
 *     scripts/generar-fuentes-fijas.ts 2023 2024
 */
import { writeFileSync } from 'node:fs'
import { isInArgentina } from '@/lib/argentina-polygon'
import { haversineKm } from '@/lib/geo'

type P = { lat: number; lng: number; day: string; type: number }

async function descargar(anio: string): Promise<P[]> {
  const url = `https://firms.modaps.eosdis.nasa.gov/data/country/viirs-snpp/${anio}/viirs-snpp_${anio}_Argentina.csv`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`FIRMS ${anio}: HTTP ${res.status}`)
  const lines = (await res.text()).trim().split('\n')
  const h = lines[0].split(',')
  const ix = (k: string) => h.indexOf(k)
  if (ix('type') < 0) throw new Error(`FIRMS ${anio}: el archivo no trae la columna type`)
  return lines.slice(1).map((l) => {
    const c = l.split(',')
    return { lat: +c[ix('latitude')], lng: +c[ix('longitude')], day: c[ix('acq_date')], type: +c[ix('type')] }
  })
}

function agrupar(pts: P[], maxKm: number): P[][] {
  const parent = pts.map((_, i) => i)
  const f = (i: number): number => (parent[i] === i ? i : (parent[i] = f(parent[i])))
  const cell = 0.03
  const grid = new Map<string, number[]>()
  pts.forEach((p, i) => {
    const k = `${Math.floor(p.lat / cell)},${Math.floor(p.lng / cell)}`
    ;(grid.get(k) ?? grid.set(k, []).get(k)!).push(i)
  })
  pts.forEach((p, i) => {
    const a = Math.floor(p.lat / cell), b = Math.floor(p.lng / cell)
    for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++)
      for (const j of grid.get(`${a + da},${b + db}`) ?? [])
        if (j > i && haversineKm(p.lat, p.lng, pts[j].lat, pts[j].lng) <= maxKm) parent[f(i)] = f(j)
  })
  const g = new Map<number, P[]>()
  pts.forEach((p, i) => (g.get(f(i)) ?? g.set(f(i), []).get(f(i))!).push(p))
  return [...g.values()]
}

async function main() {
  const anios = process.argv.slice(2)
  if (anios.length === 0) throw new Error('Pasá los años del archivo, por ejemplo: 2023 2024')
  const todos = (await Promise.all(anios.map(descargar))).flat()
  const fijos = todos.filter((p) => p.type >= 1 && p.type <= 3 && isInArgentina(p.lat, p.lng))
  const sitios = agrupar(fijos, 1.5)
    .map((g) => {
      const lat = g.reduce((s, p) => s + p.lat, 0) / g.length
      const lng = g.reduce((s, p) => s + p.lng, 0) / g.length
      const r = Math.max(...g.map((p) => haversineKm(lat, lng, p.lat, p.lng))) + 0.5
      return { lat: +lat.toFixed(4), lng: +lng.toFixed(4), radiusKm: Math.round(r * 10) / 10, detecciones: g.length }
    })
    .sort((a, b) => b.detecciones - a.detecciones)
  const cuerpo = sitios.map((s) => `  [${s.lat}, ${s.lng}, ${s.radiusKm}], // ${s.detecciones} detecciones`).join('\n')
  writeFileSync(
    'src/lib/static-heat-sources-archivo.ts',
    `/**
 * GENERADO por scripts/generar-fuentes-fijas.ts — no editar a mano.
 * Fuentes fijas de calor de Argentina según el archivo NASA FIRMS VIIRS S-NPP
 * ${anios.join('–')} (type 1 volcán, 2 estática, 3 costa afuera): ${sitios.length} sitios.
 * Cada fila: [lat, lng, radio en km].
 */
export const FUENTES_FIJAS_ARCHIVO: readonly (readonly [number, number, number])[] = [
${cuerpo}
]
`
  )
  console.log(`${sitios.length} sitios de ${fijos.length} detecciones fijas (${todos.length} en total)`)
}
main().catch((e) => { console.error(e); process.exit(1) })
