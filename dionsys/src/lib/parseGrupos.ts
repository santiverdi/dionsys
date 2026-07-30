// Grupos que paga el dueño POR FUERA de la caja de recepción.
//
// El dueño cobra los grupos él mismo (seña + saldo) y lo lleva en un Excel
// propio ("GRUPOS hotel DION 2026.xlsx"). Esa plata NUNCA pasa por la caja del
// PMS, así que el sistema no la veía: ni el ingreso comprometido, ni lo que
// falta cobrar. Además, cuando el grupo se aloja, sus habitaciones aparecen en
// el parte sin cobro en ninguna caja → falsos "check-out sin cobro".
//
// Se IMPORTA el Excel tal cual (misma regla que la caja: no se recarga a mano).
//
// Forma real de la planilla (fila 1 = encabezados, datos desde la 2):
//   GRUPOS | FACTURA | INGRESO | EGRESO | NOCHES |
//   PLAZAS BASE DOBLE | PRECIO BASE DOBLE | SUBTOTAL |
//   PLAZAS BASE SINGLE | PRECIO BASE SINGLE | SUBTOTAL |
//   TOTAL | PAGO | PAGO | PAGO | SALDO
//
// SUBTOTAL = plazas × precio × noches (verificado contra las 7 filas reales).
// SALDO = TOTAL − suma de los PAGO.

import * as XLSX from 'xlsx'
import type { Grupo } from '../types'

// Con `cellDates` la librería devuelve Date en vez del número de serie: el tipo
// tiene que admitir las dos formas.
type Cell = string | number | boolean | Date | null | undefined
type Aoa = Cell[][]

// Índices de columna de la planilla del dueño.
const COL = {
  nombre: 0, factura: 1, ingreso: 2, egreso: 3, noches: 4,
  plazasDoble: 5, precioDoble: 6,
  plazasSingle: 8, precioSingle: 9,
  total: 11,
  pagos: [12, 13, 14],
  saldo: 15,
} as const

const num = (c: Cell): number => {
  if (typeof c === 'number') return c
  const s = String(c ?? '').replace(/[$\s.]/g, '').replace(',', '.')
  const n = Number(s)
  return isNaN(n) ? 0 : n
}

/**
 * Fecha de una celda de Excel a YYYY-MM-DD, SIN pasar por Date: el número de
 * serie se convierte con el parser de la propia librería. Usar `new Date()`
 * corre la fecha un día según la zona horaria del equipo.
 */
function fechaDe(c: Cell): string {
  if (typeof c === 'number') {
    const d = XLSX.SSF.parse_date_code(c)
    if (!d) return ''
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  if (c instanceof Date) {
    return `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}-${String(c.getDate()).padStart(2, '0')}`
  }
  const s = String(c ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''
}

const diasEntre = (desde: string, hasta: string): number => {
  if (!desde || !hasta) return 0
  const ms = new Date(hasta + 'T12:00:00').getTime() - new Date(desde + 'T12:00:00').getTime()
  return Math.max(0, Math.round(ms / 86_400_000))
}

export function parseGruposRows(aoa: Aoa, importedBy: string, fileName?: string): Grupo[] {
  const grupos: Grupo[] = []
  const importedAt = new Date().toISOString()

  for (let i = 0; i < aoa.length; i++) {
    const r = aoa[i] ?? []
    const nombre = String(r[COL.nombre] ?? '').trim()
    // Filas vacías o el encabezado: se saltean.
    if (!nombre || /^grupos?$/i.test(nombre) || /^hotel/i.test(nombre)) continue

    const ingreso = fechaDe(r[COL.ingreso])
    const egreso = fechaDe(r[COL.egreso])
    if (!ingreso || !egreso) continue

    // Las noches del Excel mandan; si no vienen, se derivan de las fechas.
    const noches = num(r[COL.noches]) || diasEntre(ingreso, egreso)
    const plazasDoble = num(r[COL.plazasDoble])
    const plazasSingle = num(r[COL.plazasSingle])
    const precioDoble = num(r[COL.precioDoble])
    const precioSingle = num(r[COL.precioSingle])

    const pagos = COL.pagos.map(c => num(r[c])).filter(p => p > 0)
    // El total del Excel manda (puede tener ajustes a mano); si falta se calcula.
    const total = num(r[COL.total])
      || plazasDoble * precioDoble * noches + plazasSingle * precioSingle * noches

    grupos.push({
      id: `grupo-${ingreso}-${nombre.toLowerCase().replace(/\s+/g, '-')}`,
      nombre,
      facturaPct: Math.round(num(r[COL.factura]) * 100),
      ingreso, egreso, noches,
      plazasDoble, precioDoble,
      plazasSingle, precioSingle,
      total,
      pagos,
      // El saldo se RECALCULA (total − pagos) en vez de leer la columna: si el
      // Excel quedó con una fórmula vieja, manda la cuenta.
      saldo: total - pagos.reduce((a, b) => a + b, 0),
      importedBy,
      importedAt,
      ...(fileName ? { sourceFileName: fileName } : {}),
    })
  }

  return grupos.sort((a, b) => a.ingreso.localeCompare(b.ingreso))
}

export async function parseGruposExcel(file: File, importedBy: string): Promise<Grupo[]> {
  const data = new Uint8Array(await file.arrayBuffer())
  const workbook = XLSX.read(data)
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!sheet) throw new Error('El archivo no tiene ninguna hoja.')
  const aoa = XLSX.utils.sheet_to_json<Cell[]>(sheet, { header: 1, raw: true, defval: null })
  const grupos = parseGruposRows(aoa, importedBy, file.name)
  if (!grupos.length) {
    throw new Error('No se encontró ningún grupo. ¿Es la planilla de GRUPOS del hotel?')
  }
  return grupos
}
