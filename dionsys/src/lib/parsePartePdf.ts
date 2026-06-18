// Lee el "Parte Diario" que exporta el PMS (Todoalojamiento) en PDF y lo
// convierte en un ParteHabitaciones. El PDF tiene capa de texto, así que el
// parseo es 100% local, determinístico (sin red, sin IA).
//
// El PDF está rotado 90° y maquetado en columnas; por eso trabajamos con la
// posición visual (x,y) de cada ítem de texto (ya transformada por el viewport
// en el loader del browser, o provista por el fixture en los tests).
//
// Estructura:
//   - Encabezado: "Parte Diario  Caja 80  Usuario: …  Fecha caja: dd/mm/yyyy hh:mm".
//   - Habitaciones OCUPADAS agrupadas por canal de reserva (Booking.com, WhatsApp,
//     Walk In, agencias…). Cada fila: Habitación · Reserva · Plazas · Check-in ·
//     Check-in Actual. Las columnas reparten la página de izquierda a derecha.
//   - "Habitaciones libres" con su estado (Sucia / Limpia / Mantenimiento).
//   - Totales: ocupadas, plazas, libres, y conteo por estado de limpieza.
//
// Best-effort: si falta algo, devuelve lo que pudo y no rompe.

import { generateId } from '../utils/imageCompressor'
import { turnoFromHour, conserjeFrom } from './parseCaja'
import type { ParteHabitaciones, HabitacionOcupada, HabitacionLibre, EstadoHabitacion } from '../types'

// Un ítem de texto ya posicionado en coordenadas visuales (x crece a la derecha,
// y crece hacia abajo). El loader del browser lo arma con la transformada del viewport.
export interface PdfTextItem { x: number; y: number; str: string }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()

const isHab = (s: string) => /^\d{3,4}$/.test(s)
const isReserva = (s: string) => /^\d{2,6}$/.test(s)
const isPlazas = (s: string) => /^\d{1,2}$/.test(s)
const isDate = (s: string) => /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)
const isDateTime = (s: string) => /^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}/.test(s)

const ESTADOS: Record<string, EstadoHabitacion> = {
  sucia: 'sucia', limpia: 'limpia', mantenimiento: 'mantenimiento',
}
const estadoOf = (s: string): EstadoHabitacion | undefined => ESTADOS[norm(s)]

// Textos que NO son nombres de canal aunque aparezcan como texto suelto.
const LABELS = new Set([
  'habitacion', 'reserva', 'plazas', 'check-in', 'check-in actual', 'check in', 'check in actual',
  'habitaciones libres', 'observaciones', 'observaciones:', 'parte diario', 'hotel dion',
  'fecha/hora emision', 'usuario', 'usuario:', 'fecha caja', 'fecha caja:', 'caja',
  'total habitaciones ocupadas', 'total plazas ocupadas', 'total habitaciones libres',
])
const isChannelText = (s: string) => {
  const n = norm(s)
  if (!n || n.length < 3) return false
  if (LABELS.has(n) || n.startsWith('total ')) return false
  if (estadoOf(s)) return false
  if (isDate(s) || isDateTime(s) || /^\d+$/.test(s)) return false
  return true
}

function toISO(s: string): string {
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/)
  if (!m) return ''
  const [, d, mo, y, hh, mi] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh ?? 0), Number(mi ?? 0))
  return isNaN(date.getTime()) ? '' : date.toISOString()
}

// Agrupa ítems en filas por coordenada y (tolerancia en px); cada fila ordenada por x.
interface Row { y: number; items: PdfTextItem[] }
function toRows(items: PdfTextItem[], tol = 3): Row[] {
  const rows: Row[] = []
  for (const it of items) {
    let row = rows.find(r => Math.abs(r.y - it.y) <= tol)
    if (!row) { row = { y: it.y, items: [] }; rows.push(row) }
    row.items.push(it)
  }
  rows.sort((a, b) => a.y - b.y)
  for (const r of rows) r.items.sort((a, b) => a.x - b.x)
  return rows
}

// Primer ítem numérico a la derecha de una etiqueta (misma fila).
function numberRightOf(rows: Row[], label: string): number | undefined {
  for (const r of rows) {
    const li = r.items.find(i => norm(i.str) === norm(label))
    if (!li) continue
    const v = r.items.find(i => i.x > li.x && /^\d{1,4}$/.test(i.str.trim()))
    if (v) return Number(v.str.trim())
  }
  return undefined
}

// Texto a la derecha de una etiqueta, cortando antes de otra etiqueta si se pasa su x.
function textRightOf(rows: Row[], label: string, beforeX = Infinity): string {
  for (const r of rows) {
    const li = r.items.find(i => norm(i.str) === norm(label))
    if (!li) continue
    return r.items
      .filter(i => i.x > li.x && i.x < beforeX && i.str.trim())
      .map(i => i.str.trim())
      .join(' ')
      .trim()
  }
  return ''
}

// El nº de caja del encabezado "Parte Diario  Caja 93", tolerante al layout:
// token combinado "Caja 93", "Caja" + número a la derecha, o en cualquier parte
// del texto. Evita "Fecha caja:" (no tiene un número pegado con espacio).
function findNroCaja(items: PdfTextItem[], rows: Row[]): number {
  for (const it of items) {
    const m = norm(it.str).match(/^caja\s+(\d{1,5})$/)
    if (m) return Number(m[1])
  }
  const byLabel = numberRightOf(rows, 'Caja')
  if (byLabel) return byLabel
  // Texto en orden visual (filas por y, ítems por x). "Fecha caja: 17/06" no
  // matchea porque entre "caja" y el número hay ":" (no un espacio).
  const visual = rows.map(r => r.items.map(i => i.str).join(' ')).join('  ')
  const m = visual.match(/\bcaja\s+(\d{1,5})\b/i)
  if (m) return Number(m[1])
  return 0
}

function xOfLabel(rows: Row[], label: string): number | undefined {
  for (const r of rows) {
    const li = r.items.find(i => norm(i.str) === norm(label))
    if (li) return li.x
  }
  return undefined
}

// Núcleo del parseo (ítems posicionados → ParteHabitaciones), testeable sin pdfjs.
export function parseParteItems(items: PdfTextItem[], importedBy: string, fileName?: string): ParteHabitaciones {
  const rows = toRows(items)

  // --- Encabezado ---
  // PDF sin capa de texto (foto/escaneo): no hay nada que leer determinísticamente.
  if (items.length < 10) {
    throw new Error('Este PDF no tiene texto (parece una foto o escaneo). Descargá el "Parte Diario" desde el PMS como PDF, no como imagen.')
  }
  // Texto en ORDEN VISUAL (no el orden interno del PDF, que mezcla) para reconocer
  // el documento sin depender de que los títulos queden adyacentes en el stream.
  const visualText = rows.map(r => norm(r.items.map(i => i.str).join(' '))).join('  ')
  if (visualText.includes('informe de caja')) {
    throw new Error('Ese PDF es el "Informe de caja", no el "Parte Diario" de habitaciones. Subí el PDF del Parte Diario.')
  }
  const MARCADORES = ['parte diario', 'habitaciones libres', 'total habitaciones ocupadas', 'check-in actual']
  if (!MARCADORES.some(k => visualText.includes(k))) {
    throw new Error('No parece el "Parte Diario" de habitaciones. Revisá que sea el PDF correcto.')
  }
  const nroCaja = findNroCaja(items, rows)
  if (!nroCaja) {
    throw new Error('No se pudo leer el Nro. de Caja del Parte Diario. Revisá el PDF.')
  }
  const fechaCajaLabelX = xOfLabel(rows, 'Fecha caja:') ?? xOfLabel(rows, 'Fecha caja') ?? Infinity
  const usuario = textRightOf(rows, 'Usuario:', fechaCajaLabelX) || textRightOf(rows, 'Usuario', fechaCajaLabelX)
  const fechaCajaStr = textRightOf(rows, 'Fecha caja:') || textRightOf(rows, 'Fecha caja')
  const fechaCaja = toISO(fechaCajaStr)

  // --- Columnas: detecto los inicios por los encabezados "Habitación" ---
  const habHeaderXs = items
    .filter(i => norm(i.str) === 'habitacion')
    .map(i => i.x)
    .sort((a, b) => a - b)
  // Frontera col1/col2 = punto medio entre los dos primeros encabezados (las habitaciones
  // ocupadas viven solo en las dos primeras columnas; la tercera son libres).
  const col1End = habHeaderXs.length >= 2 ? (habHeaderXs[0] + habHeaderXs[1]) / 2 : Infinity
  const colOf = (x: number) => (x < col1End ? 0 : 1)

  // --- Canales (texto suelto cerca del inicio de una columna, en el cuerpo de la tabla) ---
  const yHeader = (() => {
    for (const r of rows) if (r.items.some(i => norm(i.str) === 'habitacion')) return r.y
    return 55
  })()
  interface Canal { x: number; y: number; col: number; name: string }
  const canales: Canal[] = []
  for (const r of rows) {
    if (r.y < yHeader) continue
    for (const it of r.items) {
      if (isChannelText(it.str)) canales.push({ x: it.x, y: it.y, col: colOf(it.x), name: it.str.trim() })
    }
  }
  const canalFor = (col: number, y: number): string => {
    const prev = canales.filter(c => c.col === col && c.y <= y + 1).sort((a, b) => b.y - a.y)
    return prev[0]?.name ?? ''
  }

  // --- Habitaciones ocupadas (patrón hab·reserva·plazas[·fecha·fecha-hora]) ---
  const ocupadas: HabitacionOcupada[] = []
  for (const r of rows) {
    const s = r.items
    for (let i = 0; i < s.length; i++) {
      if (isHab(s[i].str) && i + 2 < s.length && isReserva(s[i + 1].str) && isPlazas(s[i + 2].str)) {
        const habX = s[i].x
        const hab: HabitacionOcupada = {
          habitacion: s[i].str.trim(),
          reserva: s[i + 1].str.trim(),
          plazas: Number(s[i + 2].str.trim()),
          canal: canalFor(colOf(habX), r.y),
        }
        let j = i + 3
        if (j < s.length && isDate(s[j].str) && !isDateTime(s[j].str)) { hab.checkIn = toISO(s[j].str); j++ }
        if (j < s.length && isDateTime(s[j].str)) { hab.checkInActual = toISO(s[j].str); j++ }
        ocupadas.push(hab)
        i = j - 1
      }
    }
  }

  // --- Habitaciones libres ---
  // Cada libre = un estado de limpieza con su nº de habitación inmediatamente a la
  // izquierda en la misma columna. Cuidado: una fila puede mezclar columnas (una
  // ocupada de la col. 1 cae en la misma y que una libre de la col. 3), y los
  // totales "Sucia/Limpia/Mantenimiento" también son estados — pero esos tienen un
  // número a su derecha, mientras que el estado de una libre es lo último de su fila.
  const MAX_GAP = 250
  const libres: HabitacionLibre[] = []
  for (const r of rows) {
    for (const est of r.items) {
      const estado = estadoOf(est.str)
      if (!estado) continue
      // Si hay un número a la derecha, es la fila de totales, no una libre.
      if (r.items.some(i => i.x > est.x && /^\d+$/.test(i.str.trim()))) continue
      // Habitación más cercana a la izquierda, dentro de la misma columna.
      const hab = r.items
        .filter(i => i.x < est.x && est.x - i.x < MAX_GAP && isHab(i.str))
        .sort((a, b) => b.x - a.x)[0]
      if (hab) libres.push({ habitacion: hab.str.trim(), estado })
    }
  }

  // --- Totales: los del PDF si están; si no, calculados de lo parseado ---
  const totalOcupadas = numberRightOf(rows, 'Total habitaciones ocupadas') ?? ocupadas.length
  const totalPlazas = numberRightOf(rows, 'Total plazas ocupadas') ?? ocupadas.reduce((a, h) => a + h.plazas, 0)
  const totalLibres = numberRightOf(rows, 'Total habitaciones libres') ?? libres.length
  const sucias = libres.filter(l => l.estado === 'sucia').length
  const limpias = libres.filter(l => l.estado === 'limpia').length
  const mantenimiento = libres.filter(l => l.estado === 'mantenimiento').length

  return {
    id: generateId(),
    nroCaja,
    usuario,
    fechaCaja,
    ...(turnoFromHour(fechaCaja) ? { turno: turnoFromHour(fechaCaja) } : {}),
    ...(conserjeFrom(usuario) ? { conserje: conserjeFrom(usuario) } : {}),
    ocupadas,
    libres,
    totalOcupadas,
    totalPlazas,
    totalLibres,
    sucias,
    limpias,
    mantenimiento,
    importedBy,
    importedAt: new Date().toISOString(),
    ...(fileName ? { sourceFileName: fileName } : {}),
  }
}

// --- Loader del browser: PDF → ítems posicionados → parseParteItems ---
export async function parsePartePdf(file: File, importedBy: string): Promise<ParteHabitaciones> {
  const pdfjs = await import('pdfjs-dist')
  const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc

  const data = new Uint8Array(await file.arrayBuffer())
  const doc = await pdfjs.getDocument({ data }).promise
  const items: PdfTextItem[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const vp = page.getViewport({ scale: 1 })
    const tc = await page.getTextContent()
    for (const it of tc.items) {
      if (!('str' in it)) continue
      const s = it.str.replace(/\s+/g, ' ').trim()
      if (!s) continue
      const m = pdfjs.Util.transform(vp.transform, it.transform)
      // Offset por página para que las filas no se mezclen entre páginas.
      items.push({ x: Number(m[4].toFixed(1)), y: Number(m[5].toFixed(1)) + (p - 1) * 100000, str: s })
    }
  }
  return parseParteItems(items, importedBy, file.name)
}
