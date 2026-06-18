// Lee el Excel "Informe de caja" que exporta el PMS (Todoalojamiento) y lo
// convierte en un CajaParte. El parseo es 100% local (sin red, sin IA).
//
// Estructura del Excel (filas, columnas A..K):
//   - Metadatos arriba: Pto.Vta, Nro.Caja, Moneda, Usuario apertura/cierre, fechas.
//   - Secciones "Apertura" / "Ingresos" / "Egresos" / "Retiros": cada una con una
//     fila de título, una fila de encabezado (Fecha/Hora · Usuario · Comp · ...),
//     filas de movimiento, y una fila "Totales".
//   - Una fila final "Saldo total en caja".
//
// Best-effort: si falta algo, devuelve lo que pudo y no rompe.

import * as XLSX from 'xlsx'
import { generateId } from '../utils/imageCompressor'
import type { CajaParte, CajaMovimiento, Turno } from '../types'

// Columnas fijas del informe (0-indexadas).
const COL = { fecha: 0, usuario: 1, comp: 2, habitacion: 3, obs: 4, efectivo: 5, tarjetas: 6, cheques: 7, transf: 8, otros: 9, total: 10 } as const

const SECCIONES = ['Apertura', 'Ingresos', 'Egresos', 'Retiros'] as const
type Seccion = (typeof SECCIONES)[number]

export type Cell = string | number | boolean | null | undefined
export type Aoa = Cell[][]

const str = (v: Cell): string => (v == null ? '' : String(v)).trim()

// Acepta números nativos del Excel y también strings tipo "1.234,56".
function num(v: Cell): number {
  if (typeof v === 'number') return isFinite(v) ? v : 0
  const s = str(v)
  if (!s) return 0
  let n: string
  if (s.includes(',')) n = s.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) n = s.replace(/\./g, '')
  else n = s
  const r = parseFloat(n.replace(/[^\d.-]/g, ''))
  return isNaN(r) ? 0 : r
}

// "13/06/2026 06:58" → ISO. Si no matchea, devuelve '' (no rompe).
function toISO(v: Cell): string {
  const s = str(v)
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/)
  if (!m) return ''
  const [, d, mo, y, hh, mi] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(hh ?? 0), Number(mi ?? 0))
  return isNaN(date.getTime()) ? '' : date.toISOString()
}

function isDateCell(v: Cell): boolean {
  return /^\d{1,2}\/\d{1,2}\/\d{4}/.test(str(v))
}

// Próxima celda no vacía a la derecha en la misma fila.
function valueRight(row: Cell[], fromCol: number): string {
  for (let c = fromCol + 1; c < row.length; c++) {
    const s = str(row[c])
    if (s) return s
  }
  return ''
}

// Busca {r,c} de la primera celda cuyo texto coincide (case-insensitive, sin acentos).
function findLabel(aoa: Aoa, label: string): { r: number; c: number } | null {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const target = norm(label)
  for (let r = 0; r < aoa.length; r++) {
    for (let c = 0; c < aoa[r].length; c++) {
      if (norm(str(aoa[r][c])) === target) return { r, c }
    }
  }
  return null
}

export function turnoFromHour(iso: string): Turno | undefined {
  if (!iso) return undefined
  const h = new Date(iso).getHours()
  if (h >= 5 && h < 15) return 'manana'
  if (h >= 15 && h < 23) return 'tarde'
  return 'noche'
}

const CONSERJE_NAMES = ['Leandro', 'Santiago', 'Gaston', 'Valentin', 'Franquero']
export function conserjeFrom(usuario: string): string | undefined {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const u = norm(usuario)
  return CONSERJE_NAMES.find(n => u.includes(norm(n)))
}

function parseMovimiento(row: Cell[]): CajaMovimiento {
  const observacion = str(row[COL.obs])
  const comp = str(row[COL.comp])
  const reserva = observacion.match(/reserva\s+(\d+)/i)?.[1]
  // "Reserva 389 - Yamila Inzaurraldez" → "Yamila Inzaurraldez"
  const pasajero = observacion.includes(' - ') ? observacion.split(' - ').slice(1).join(' - ').trim() : undefined
  const facturaB = comp.match(/FB\s*([\d-]+)/i)?.[1]
  return {
    fechaHora: toISO(row[COL.fecha]),
    usuario: str(row[COL.usuario]),
    comp,
    habitacion: str(row[COL.habitacion]),
    observacion,
    efectivo: num(row[COL.efectivo]),
    tarjetas: num(row[COL.tarjetas]),
    cheques: num(row[COL.cheques]),
    transferencia: num(row[COL.transf]),
    otros: num(row[COL.otros]),
    total: num(row[COL.total]),
    ...(reserva ? { reserva } : {}),
    ...(pasajero ? { pasajero } : {}),
    ...(facturaB ? { facturaB } : {}),
  }
}

export async function parseCajaExcel(file: File, importedBy: string): Promise<CajaParte> {
  const data = await file.arrayBuffer()
  const workbook = XLSX.read(data)
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('El Excel está vacío.')
  const aoa = XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, raw: true, defval: '' })
  return parseCajaRows(aoa, importedBy, file.name)
}

// Núcleo del parseo (AOA → CajaParte), separado para poder testearlo sin un File.
export function parseCajaRows(aoa: Aoa, importedBy: string, fileName?: string): CajaParte {
  // --- Metadatos ---
  const nroLabel = findLabel(aoa, 'Nro. Caja') ?? findLabel(aoa, 'Nro Caja')
  const nroCaja = nroLabel ? num(valueRight(aoa[nroLabel.r], nroLabel.c)) : 0
  if (!nroCaja) {
    throw new Error('No parece un Informe de caja (no se encontró el Nro. de Caja). Revisá el archivo.')
  }
  const ptoLabel = findLabel(aoa, 'Pto. Vta.') ?? findLabel(aoa, 'Pto. Vta')
  const puntoVenta = ptoLabel ? valueRight(aoa[ptoLabel.r], ptoLabel.c) : ''
  const monedaLabel = findLabel(aoa, 'Moneda de la caja')
  const moneda = monedaLabel ? valueRight(aoa[monedaLabel.r], monedaLabel.c) : 'AR$'

  // Bloque etiqueta/valor: fila con "Usuario apertura" y la fila siguiente con los valores alineados por columna.
  const uaLabel = findLabel(aoa, 'Usuario apertura')
  let usuarioApertura = '', usuarioCierre = '', aperturaAt = '', cierreAt = ''
  if (uaLabel) {
    const labelRow = aoa[uaLabel.r]
    const valueRow = aoa[uaLabel.r + 1] ?? []
    const colOf = (label: string) => {
      const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      return labelRow.findIndex(c => norm(str(c)) === norm(label))
    }
    const cUA = colOf('Usuario apertura'), cUC = colOf('Usuario cierre'), cAp = colOf('Apertura'), cCi = colOf('Cierre')
    if (cUA >= 0) usuarioApertura = str(valueRow[cUA])
    if (cUC >= 0) usuarioCierre = str(valueRow[cUC])
    if (cAp >= 0) aperturaAt = toISO(valueRow[cAp])
    if (cCi >= 0) cierreAt = toISO(valueRow[cCi])
  }

  // --- Secciones ---
  const ingresos: CajaMovimiento[] = []
  const egresos: CajaMovimiento[] = []
  const retiros: CajaMovimiento[] = []
  let aperturaMonto = 0
  let saldoFinal = 0
  let seccion: Seccion | null = null

  for (const row of aoa) {
    const c0 = str(row[COL.fecha])

    if ((SECCIONES as readonly string[]).includes(c0)) { seccion = c0 as Seccion; continue }
    if (/^saldo total en caja/i.test(c0) || row.some(c => /^saldo total en caja/i.test(str(c)))) {
      // El saldo es el último número de la fila.
      const nums = row.map(num).filter(n => n !== 0)
      if (nums.length) saldoFinal = nums[nums.length - 1]
      continue
    }
    if (!isDateCell(row[COL.fecha])) continue // encabezados, "Totales", vacías, etc.

    const mov = parseMovimiento(row)
    switch (seccion) {
      case 'Apertura': aperturaMonto += mov.total; break
      case 'Ingresos': ingresos.push(mov); break
      case 'Egresos': egresos.push(mov); break
      case 'Retiros': retiros.push(mov); break
      default: break
    }
  }

  return {
    id: generateId(),
    nroCaja,
    puntoVenta,
    moneda,
    usuarioApertura,
    ...(usuarioCierre ? { usuarioCierre } : {}),
    aperturaAt,
    ...(cierreAt ? { cierreAt } : {}),
    ...(turnoFromHour(aperturaAt) ? { turno: turnoFromHour(aperturaAt) } : {}),
    ...(conserjeFrom(usuarioApertura) ? { conserje: conserjeFrom(usuarioApertura) } : {}),
    aperturaMonto,
    saldoFinal,
    ingresos,
    egresos,
    retiros,
    importedBy,
    importedAt: new Date().toISOString(),
    ...(fileName ? { sourceFileName: fileName } : {}),
  }
}
