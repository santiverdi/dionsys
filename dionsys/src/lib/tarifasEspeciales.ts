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
}

// Pactadas por el dueño para la temporada 2026/2027. Los feriados van a precio
// plano y sin descuento. Del 1/1 al 15/2: $60.000 por persona de domingo a
// jueves, $65.000 el viernes y $70.000 el sábado; la single paga lo mismo que
// la doble, y en efectivo tiene 10% de descuento todos los días.
export const TARIFAS_ESPECIALES: TarifaEspecial[] = [
  {
    nombre: 'Inmaculada', etiqueta: 'Inmaculada',
    desde: '2026-12-04', hasta: '2026-12-07',
    single: 120_000, porPersona: 70_000,
  },
  {
    nombre: 'Navidad', etiqueta: 'Navidad',
    desde: '2026-12-24', hasta: '2026-12-26',
    single: 120_000, porPersona: 70_000,
  },
  {
    nombre: 'Año Nuevo', etiqueta: 'Año Nuevo',
    desde: '2026-12-31', hasta: '2026-12-31',
    single: 130_000, porPersona: 80_000,
  },
  {
    nombre: 'Alta 2027',
    desde: '2027-01-01', hasta: '2027-02-15',
    single: 120_000, porPersona: 60_000,
    porPersonaPorDia: { 5: 65_000, 6: 70_000 },
    singleComoDoble: true,
    descuentoEfectivo: 0.10,
  },
]

/** Precio de la noche: por persona (2 a 5) o por habitación (single). */
export function precioEspecialDe(esp: TarifaEspecial, diaDeLaSemana: number, pax: number): number {
  const pp = esp.porPersonaPorDia?.[diaDeLaSemana] ?? esp.porPersona
  if (pax !== 1) return pp
  return esp.singleComoDoble ? 2 * pp : esp.single
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
    nombre: 'Ajuste', desde: fecha, hasta: fecha,
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

/** Descuento con cualquier medio de pago de esa noche (0 si no hay). */
export function descuentoGeneralDe(esp: TarifaEspecial, diaDeLaSemana: number): number {
  const d = esp.descuentoGeneral
  return d && d.dias.includes(diaDeLaSemana) ? d.pct : 0
}
