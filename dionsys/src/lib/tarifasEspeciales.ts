// Precios FIJOS por fecha que administración pasa aparte del tarifario de la
// landing. El tarifario publicado solo sabe expresar recargos PORCENTUALES
// sobre la temporada (findes largos) y un tope por persona: con eso no se
// llega a un número redondo pactado —el finde de la Inmaculada, por ejemplo,
// daba 69.300 y 68.000 según el día, y el pactado es 70.000 parejo—, ni se
// puede expresar un descuento que valga con CUALQUIER medio de pago (el
// tarifario solo tiene descuento por efectivo).
//
// Por eso estas tarifas viven acá, en el código, y mandan sobre el cálculo del
// tarifario publicado: sin recargo de finde largo, sin tope por persona, el
// precio es el que dice la fila. Aplican en Recepción → Tarifas y, por venir
// del mismo cálculo, también en el control de tarifas de Control de Caja.
//
// OJO: esto NO cambia la página de reservas. La landing sigue cotizando lo que
// está publicado en Supabase hasta que se publique el tarifario nuevo.

import { fechaValida } from './landing'

export interface TarifaEspecial {
  /** Nombre interno del período (para leerlo acá). */
  nombre: string
  /** Cartelito en el calendario. Sin etiqueta, la noche se ve como una normal. */
  etiqueta?: string
  desde: string        // primera NOCHE (YYYY-MM-DD, inclusive)
  hasta: string        // última NOCHE (inclusive)
  single: number       // 1 persona: precio por HABITACIÓN por noche
  porPersona: number   // 2 a 5 personas: precio POR PERSONA por noche
  /**
   * Precio por persona distinto según el día de la semana (getDay(): 0=domingo
   * … 6=sábado). Los días que no están usan porPersona.
   */
  porPersonaPorDia?: Partial<Record<number, number>>
  /** Lo mismo para la single (precio por habitación). Los días que no están usan single. */
  singlePorDia?: Partial<Record<number, number>>
  /** La single paga la habitación doble entera (2 × el por persona de esa noche). */
  singleComoDoble?: boolean
  /**
   * Descuento que vale con CUALQUIER medio de pago, para los días de la semana
   * de la lista (getDay(): 0=domingo … 6=sábado). Los días que no están en la
   * lista no tienen descuento.
   */
  descuentoGeneral?: { dias: number[]; pct: number }
  /** Descuento ADICIONAL por pagar en efectivo. Sin esto, el efectivo no suma. */
  descuentoEfectivo?: number
  /** Estadía mínima para las noches del período (pisa la de la temporada). */
  minNoches?: number
  /** Solo trae el mínimo de noches: el precio sigue saliendo de lo demás. */
  soloMinNoches?: boolean
  /** Viene de un ajuste por día del admin: cambia el precio, no qué fecha es. */
  esAjuste?: boolean
}

// Temporada 2026/2027: los MISMOS precios que el admin cargó a mano en
// 'dionsys_tarifas_dia' (Recepción → Tarifas), para que un equipo que todavía no
// bajó los ajustes de la nube cotice igual. Todas las noches tienen 10% en
// efectivo y su estadía mínima. Si se cambia un precio allá, hay que cambiarlo
// acá: tests/lib/tarifasEspeciales.test.ts compara las dos tablas noche a noche.
// Días de la semana como getDay(): 0=domingo … 5=viernes, 6=sábado.
const EF = { descuentoEfectivo: 0.10 }
export const TARIFAS_ESPECIALES: TarifaEspecial[] = [
  // Diciembre
  { nombre: 'Diciembre', desde: '2026-12-01', hasta: '2026-12-03', single: 90_000, porPersona: 48_000, minNoches: 1, ...EF },
  {
    nombre: 'Inmaculada', etiqueta: 'Inmaculada', desde: '2026-12-04', hasta: '2026-12-07',
    single: 103_000, porPersona: 56_000, minNoches: 2, ...EF,
  },
  {
    nombre: 'Diciembre', desde: '2026-12-08', hasta: '2026-12-23',
    single: 90_000, porPersona: 48_000, minNoches: 1, ...EF,
    porPersonaPorDia: { 5: 53_000, 6: 53_000 }, singlePorDia: { 5: 95_000, 6: 95_000 },
  },
  {
    nombre: 'Navidad', etiqueta: 'Navidad', desde: '2026-12-24', hasta: '2026-12-26',
    single: 103_000, porPersona: 56_000, minNoches: 2, ...EF,
    porPersonaPorDia: { 4: 54_000 }, singlePorDia: { 4: 86_000 },   // jue 24
  },
  { nombre: 'Fin de año', desde: '2026-12-27', hasta: '2026-12-27', single: 103_000, porPersona: 55_000, minNoches: 3, ...EF },
  { nombre: 'Fin de año', desde: '2026-12-28', hasta: '2026-12-30', single: 111_000, porPersona: 59_000, minNoches: 3, ...EF },
  {
    nombre: 'Año Nuevo', etiqueta: 'Año Nuevo', desde: '2026-12-31', hasta: '2026-12-31',
    single: 129_000, porPersona: 70_000, minNoches: 3, ...EF,
  },
  // Enero
  {
    nombre: 'Enero', desde: '2027-01-01', hasta: '2027-01-31',
    single: 135_000, porPersona: 80_000, minNoches: 3, ...EF,
    porPersonaPorDia: { 5: 84_000, 6: 88_000 }, singlePorDia: { 5: 168_000, 6: 176_000 },
  },
  // Febrero. Carnaval va primero: tarifaEspecialDe se queda con la primera que coincide.
  {
    nombre: 'Carnaval', desde: '2027-02-05', hasta: '2027-02-08',
    single: 156_000, porPersona: 78_000, minNoches: 3, ...EF,
    porPersonaPorDia: { 6: 82_000, 0: 82_000 }, singlePorDia: { 6: 164_000, 0: 164_000 },
  },
  {
    nombre: 'Febrero', desde: '2027-02-01', hasta: '2027-02-15',
    single: 136_000, porPersona: 74_000, minNoches: 3, ...EF,
    porPersonaPorDia: { 5: 76_000, 6: 78_000 }, singlePorDia: { 5: 152_000, 6: 156_000 },
  },
  {
    nombre: 'Febrero', desde: '2027-02-16', hasta: '2027-02-21',
    single: 123_000, porPersona: 69_000, minNoches: 2, ...EF,
    porPersonaPorDia: { 5: 72_000, 6: 73_000 }, singlePorDia: { 5: 128_000, 6: 130_000 },
  },
  {
    nombre: 'Febrero', desde: '2027-02-22', hasta: '2027-02-28',
    single: 119_000, porPersona: 67_000, minNoches: 2, ...EF,
    porPersonaPorDia: { 5: 70_000, 6: 71_000 }, singlePorDia: { 5: 124_000, 6: 126_000 },
  },
]

/** Precio de la noche: por persona (2 a 5) o por habitación (single). */
export function precioEspecialDe(esp: TarifaEspecial, diaDeLaSemana: number, pax: number): number {
  const pp = esp.porPersonaPorDia?.[diaDeLaSemana] ?? esp.porPersona
  if (pax !== 1) return pp
  return esp.singleComoDoble ? 2 * pp : esp.singlePorDia?.[diaDeLaSemana] ?? esp.single
}

// ── Ajustes por día cargados por el admin desde Recepción → Tarifas ─────────
// Precio fijo para una fecha suelta. Manda sobre todo lo de arriba y sobre el
// tarifario publicado. Viven en la nube (almacén 'dionsys_tarifas_dia') para
// que todos los equipos coticen igual.

export const KEY_AJUSTES_TARIFA = 'dionsys_tarifas_dia'

// El precio y el mínimo de noches se cargan por separado: una noche puede
// tener solo uno de los dos y lo otro sigue saliendo de lo publicado/pactado.
export interface AjusteDia {
  porPersona?: number    // 2 a 5 personas, por persona por noche
  single?: number        // 1 persona, por habitación por noche
  descEfectivo?: number  // fracción (0.1 = 10%) pagando en efectivo
  minNoches?: number     // estadía mínima si la estadía toca esta noche
}

/** fecha (YYYY-MM-DD) → precio y/o mínimo de esa noche. */
export type AjustesTarifa = Record<string, AjusteDia>

export const tienePrecio = (a: AjusteDia | undefined): boolean =>
  !!a && (a.porPersona ?? 0) > 0 && (a.single ?? 0) > 0

export function ajustesComoEspeciales(ajustes: AjustesTarifa): TarifaEspecial[] {
  return Object.entries(ajustes).map(([fecha, a]) => ({
    nombre: 'Ajuste', esAjuste: true, desde: fecha, hasta: fecha,
    single: a.single ?? 0, porPersona: a.porPersona ?? 0,
    ...((a.descEfectivo ?? 0) > 0 ? { descuentoEfectivo: a.descEfectivo } : {}),
    ...(a.minNoches ? { minNoches: a.minNoches } : {}),
    ...(tienePrecio(a) ? {} : { soloMinNoches: true }),
  }))
}

/** Los ajustes van primero: tarifaEspecialDe se queda con el primero que coincide. */
export function especialesConAjustes(ajustes: AjustesTarifa): TarifaEspecial[] {
  return [...ajustesComoEspeciales(ajustes), ...TARIFAS_ESPECIALES]
}

export function leerAjustes(): AjustesTarifa {
  try {
    const v = JSON.parse(globalThis.localStorage?.getItem(KEY_AJUSTES_TARIFA) ?? '{}')
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

// Cacheado por el texto guardado: el cuadre de caja llama esto miles de veces.
let cacheRaw: string | null | undefined
let cacheLista: TarifaEspecial[] = TARIFAS_ESPECIALES
/** Las tarifas fijas vigentes en este equipo (pactadas + ajustes del admin). */
export function especialesVigentes(): TarifaEspecial[] {
  let raw: string | null = null
  try { raw = globalThis.localStorage?.getItem(KEY_AJUSTES_TARIFA) ?? null } catch { /* sin storage */ }
  if (raw !== cacheRaw) {
    cacheRaw = raw
    cacheLista = raw ? especialesConAjustes(leerAjustes()) : TARIFAS_ESPECIALES
  }
  return cacheLista
}

/** La tarifa fija de esa noche, si administración pactó una. */
export function tarifaEspecialDe(
  fecha: string,
  especiales: TarifaEspecial[] = TARIFAS_ESPECIALES,
): TarifaEspecial | undefined {
  return especiales.find(e => !e.soloMinNoches && e.desde <= fecha && fecha <= e.hasta)
}

/** Mínimo de noches fijado para esa noche, si alguno lo fija. */
export function minNochesEspecialDe(fecha: string, especiales: TarifaEspecial[]): number | undefined {
  return especiales.find(e => e.minNoches && e.desde <= fecha && fecha <= e.hasta)?.minNoches
}

// ── Estadías mínimas por fechas, cargadas por el admin en Recepción → Tarifas ─
// Año Nuevo, Carnaval…: si la estadía toca alguna noche del rango, se exige el
// MAYOR entre este mínimo y el de la noche (temporada o ajuste por día). Ver
// minimoEstadia() en tarifaDiaria.ts. Viven en la nube interna (almacén
// 'dionsys_estadias_minimas'), igual que los ajustes por día. No llegan a la
// página de reservas.

export const KEY_ESTADIAS_MINIMAS = 'dionsys_estadias_minimas'

export interface EstadiaMinima {
  id: string
  nombre: string
  desde: string      // primera NOCHE (YYYY-MM-DD, inclusive)
  hasta: string      // última NOCHE (inclusive)
  minNoches: number
  activo: boolean
}

// Cacheado por el texto guardado, como especialesVigentes(): el cuadre de caja
// cotiza miles de ventanas.
let cacheEstadiasRaw: string | null | undefined
let cacheEstadias: EstadiaMinima[] = []
export function leerEstadiasMinimas(): EstadiaMinima[] {
  let raw: string | null = null
  try { raw = globalThis.localStorage?.getItem(KEY_ESTADIAS_MINIMAS) ?? null } catch { /* sin storage */ }
  if (raw !== cacheEstadiasRaw) {
    cacheEstadiasRaw = raw
    try {
      const v = JSON.parse(raw ?? '[]')
      cacheEstadias = Array.isArray(v) ? v : []
    } catch {
      cacheEstadias = []
    }
  }
  return cacheEstadias
}

/** Problemas de una estadía mínima antes de guardarla. */
export function validarEstadiaMinima(e: EstadiaMinima): string[] {
  const errores: string[] = []
  if (!e.nombre?.trim()) errores.push('Falta el nombre (ej: "Año Nuevo").')
  if (!fechaValida(e.desde) || !fechaValida(e.hasta)) errores.push('Faltan las fechas desde y hasta.')
  else if (e.hasta < e.desde) errores.push('La fecha "hasta" no puede ser anterior a "desde".')
  if (!Number.isInteger(e.minNoches) || e.minNoches < 1) errores.push('El mínimo debe ser de 1 noche o más.')
  return errores
}

/** Descuento con cualquier medio de pago de esa noche (0 si no hay). */
export function descuentoGeneralDe(esp: TarifaEspecial, diaDeLaSemana: number): number {
  const d = esp.descuentoGeneral
  return d && d.dias.includes(diaDeLaSemana) ? d.pct : 0
}
