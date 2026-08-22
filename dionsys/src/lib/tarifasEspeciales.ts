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
   * Descuento que vale con CUALQUIER medio de pago, para los días de la semana
   * de la lista (getDay(): 0=domingo … 6=sábado). Los días que no están en la
   * lista no tienen descuento.
   */
  descuentoGeneral?: { dias: number[]; pct: number }
  /** Descuento ADICIONAL por pagar en efectivo. Sin esto, el efectivo no suma. */
  descuentoEfectivo?: number
}

const DOMINGO_A_JUEVES = [0, 1, 2, 3, 4]

// Pactadas por el dueño para la temporada 2026/2027. Los feriados van a precio
// plano y sin descuento; el tramo largo de enero/febrero lleva 10% de domingo a
// jueves con cualquier medio de pago, y viernes y sábado sin descuento.
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
    desde: '2026-12-31', hasta: '2027-01-02',
    single: 130_000, porPersona: 80_000,
  },
  {
    nombre: 'Alta 2027',
    desde: '2027-01-03', hasta: '2027-02-13',
    single: 130_000, porPersona: 80_000,
    descuentoGeneral: { dias: DOMINGO_A_JUEVES, pct: 0.10 },
  },
]

/** La tarifa fija de esa noche, si administración pactó una. */
export function tarifaEspecialDe(
  fecha: string,
  especiales: TarifaEspecial[] = TARIFAS_ESPECIALES,
): TarifaEspecial | undefined {
  return especiales.find(e => e.desde <= fecha && fecha <= e.hasta)
}

/** Descuento con cualquier medio de pago de esa noche (0 si no hay). */
export function descuentoGeneralDe(esp: TarifaEspecial, diaDeLaSemana: number): number {
  const d = esp.descuentoGeneral
  return d && d.dias.includes(diaDeLaSemana) ? d.pct : 0
}
