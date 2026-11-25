import type { TarifarioPublico } from './landing'
import { cotizarEstadia, type Cotizacion } from './tarifaDiaria'
import { tienePrecio, type AjustesTarifa, type EstadiaMinima, type TarifaEspecial } from './tarifasEspeciales'
import {
  TEXTO_NOCHES, TEXTO_PARCIAL_ANTICIPADA, type Promo, type TipoPromoConfig,
} from './promos'

// Cálculos de la pantalla Promos (solo el dueño): el efectivo por rango de
// fechas, la vista previa antes de guardar y "qué te cuesta" cada promo.

const DIA = 86_400_000
const aDia = (s: string) => Date.parse(s + 'T00:00:00Z')
export const sumarDias = (f: string, n: number) => new Date(aDia(f) + n * DIA).toISOString().slice(0, 10)
export const dm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`
/** 0.176 → "17,6%" */
export const pct = (f: number) => `${(Math.round(f * 1000) / 10).toLocaleString('es-AR')}%`

/** Todas las fechas de [desde, hasta], inclusive. */
export function fechasEntre(desde: string, hasta: string): string[] {
  const out: string[] = []
  for (let d = aDia(desde); d <= aDia(hasta); d += DIA) out.push(new Date(d).toISOString().slice(0, 10))
  return out
}

// ── Efectivo por rango de fechas ────────────────────────────────────────────
// La fuente de verdad es dionsys_tarifas_dia.descEfectivo de cada noche. Solo
// vale en las noches con precio cargado en DionSys: en una noche sin precio el
// efectivo sale del tarifario viejo, que esta pantalla no toca.

export interface RangoEfectivo {
  desde: string
  hasta: string
  porcentaje: number   // fracción; 0 = sin descuento en efectivo
  noches: number
}

/** Las noches con precio agrupadas en tramos seguidos con el mismo % de efectivo. */
export function rangosEfectivo(ajustes: AjustesTarifa): RangoEfectivo[] {
  const fechas = Object.keys(ajustes).filter(f => tienePrecio(ajustes[f])).sort()
  const out: RangoEfectivo[] = []
  for (const f of fechas) {
    const p = ajustes[f].descEfectivo ?? 0
    const ult = out[out.length - 1]
    if (ult && ult.porcentaje === p && sumarDias(ult.hasta, 1) === f) {
      ult.hasta = f
      ult.noches++
    } else {
      out.push({ desde: f, hasta: f, porcentaje: p, noches: 1 })
    }
  }
  return out
}

export interface CambioEfectivo {
  ajustes: AjustesTarifa
  cambiadas: string[]   // noches cuyo % cambió
  sinPrecio: string[]   // noches del rango sin precio en DionSys: el % no se aplica ahí
}

/** Escribe el % de efectivo en descEfectivo de cada noche CON PRECIO del rango. */
export function aplicarEfectivo(ajustes: AjustesTarifa, desde: string, hasta: string, porcentaje: number): CambioEfectivo {
  const nuevos: AjustesTarifa = { ...ajustes }
  const cambiadas: string[] = []
  const sinPrecio: string[] = []
  for (const f of fechasEntre(desde, hasta)) {
    const a = ajustes[f]
    if (!tienePrecio(a)) {
      sinPrecio.push(f)
      continue
    }
    if ((a.descEfectivo ?? 0) === porcentaje) continue
    nuevos[f] = { ...a, descEfectivo: porcentaje }
    cambiadas.push(f)
  }
  return { ajustes: nuevos, cambiadas, sinPrecio }
}

// ── Contexto de cálculo ─────────────────────────────────────────────────────

export interface Contexto {
  tarifario: TarifarioPublico
  especiales: TarifaEspecial[]
  estadias: EstadiaMinima[]
  hoy: string
}

function cotizar(ctx: Contexto, llegada: string, noches: number, pax: number, promos: readonly Promo[], hoy = ctx.hoy): Cotizacion {
  return cotizarEstadia(llegada, sumarDias(llegada, noches), pax, ctx.tarifario, ctx.especiales, ctx.estadias, { promos, hoy })
}

/** ¿Todas las noches de la estadía tienen precio? */
function cotizable(ctx: Contexto, llegada: string, noches: number): boolean {
  const v = ctx.tarifario.config.vigencia
  const salida = sumarDias(llegada, noches)
  return llegada >= v.desde && sumarDias(salida, -1) <= v.hasta && !cotizar(ctx, llegada, noches, 2, []).incompleta
}

// ── Reserva tipo y "qué te cuesta" ──────────────────────────────────────────

export interface ReservaTipo {
  llegada: string
  noches: number
  pax: number
  hoy: string          // fecha de cotización que hace entrar la promo (anticipada / último momento)
}

/** Noches de la reserva tipo: 3, o el mínimo de la promo si pide más. */
export const nochesTipo = (p: Promo) => Math.max(3, p.minNoches)

/**
 * La primera estadía de 2 personas que cumple las condiciones de la promo y se
 * puede cotizar entera, desde hoy. null si no hay ninguna (rango vencido…).
 */
export function reservaTipo(p: Promo, ctx: Contexto): ReservaTipo | null {
  const noches = nochesTipo(p)
  if (p.maxNoches !== null && noches > p.maxNoches) return null
  const manana = sumarDias(ctx.hoy, 1)
  let desde: string
  let hoy = ctx.hoy
  if (p.tipo === 'noches') desde = p.desde > manana ? p.desde : manana
  else if (p.tipo === 'anticipada') {
    const min = sumarDias(ctx.hoy, p.diasAnticipacion)
    desde = p.desde > min ? p.desde : min
  } else {
    // Último momento: se cotiza un día antes de la llegada.
    desde = p.desde > manana ? p.desde : manana
  }
  for (let f = desde; f <= p.hasta; f = sumarDias(f, 1)) {
    if (p.tipo === 'ultimo_momento') hoy = sumarDias(f, -1)
    if (cotizable(ctx, f, noches)) return { llegada: f, noches, pax: 2, hoy }
  }
  return null
}

export interface CostoPromo {
  reserva: ReservaTipo
  lista: number
  conPromo: number
  descuento: number      // $ que se descuenta en la reserva tipo
  fraccion: number       // d = descuento / lista
  reservasMas: number    // d / (1 − d): cuántas reservas más (fracción) para cobrar lo mismo
}

/** Cuánto descuenta la promo en la reserva tipo, sola (como si fuera la única y estuviera activa). */
export function costoPromo(p: Promo, ctx: Contexto): CostoPromo | null {
  const sola: Promo = { ...p, activa: true, seSuma: false }
  const r = reservaTipo(sola, ctx)
  if (!r) return null
  const c = cotizar(ctx, r.llegada, r.noches, r.pax, [sola], r.hoy)
  // Sin el descuento general de la noche, para que la cuenta sea solo la promo.
  const conPromo = c.promo ? c.promo.total : c.total
  const descuento = c.total - conPromo
  const fraccion = c.total > 0 ? descuento / c.total : 0
  return { reserva: r, lista: c.total, conPromo, descuento, fraccion, reservasMas: fraccion < 1 ? fraccion / (1 - fraccion) : Infinity }
}

/** Lo mismo para un % en efectivo (vale sobre toda la estadía). */
export function costoEfectivo(porcentaje: number): { fraccion: number; reservasMas: number } {
  return { fraccion: porcentaje, reservasMas: porcentaje < 1 ? porcentaje / (1 - porcentaje) : Infinity }
}

/** "Por cada 100 reservas necesitás 18 más". */
export function textoReservasMas(reservasMas: number): string {
  if (!Number.isFinite(reservasMas)) return 'no se recupera con más reservas'
  const n = Math.round(reservasMas * 100)
  return n === 0 ? 'prácticamente nada' : `${n} reservas más cada 100 (${pct(reservasMas)})`
}

// ── Vista previa ────────────────────────────────────────────────────────────

export interface EjemploVistaPrevia {
  titulo: string
  llegada: string
  salida: string
  pax: number
  hoy: string
}

/**
 * 5 cotizaciones de ejemplo para la promo que se está cambiando (o un rango
 * de fechas, para el efectivo): la reserva tipo, single, más larga, de 4 y una
 * que NO cumple la condición, para ver que ahí no cambia nada.
 */
export function ejemplosVistaPrevia(p: Promo | null, ctx: Contexto, rango?: { desde: string; hasta: string }): EjemploVistaPrevia[] {
  const ej = (titulo: string, llegada: string, noches: number, pax: number, hoy = ctx.hoy): EjemploVistaPrevia | null =>
    cotizable(ctx, llegada, noches) ? { titulo, llegada, salida: sumarDias(llegada, noches), pax, hoy } : null

  let base: ReservaTipo | null = null
  if (p) base = reservaTipo({ ...p, activa: true }, ctx)
  else if (rango) {
    const manana = sumarDias(ctx.hoy, 1)
    for (let f = rango.desde > manana ? rango.desde : manana; f <= rango.hasta && !base; f = sumarDias(f, 1)) {
      if (cotizable(ctx, f, 3)) base = { llegada: f, noches: 3, pax: 2, hoy: ctx.hoy }
    }
  }
  if (!base) return []

  const { llegada, noches, hoy } = base
  const out = [
    ej(`Reserva tipo: 2 personas, ${noches} noches`, llegada, noches, 2, hoy),
    ej(`Single, ${noches} noches`, llegada, noches, 1, hoy),
    ej(`2 personas, ${noches + 2} noches`, llegada, noches + 2, 2, hoy),
    ej(`4 personas, ${noches} noches`, llegada, noches, 4, hoy),
  ]
  // Un caso que no cumple: menos noches, sin la anticipación, o fuera del rango.
  if (p && p.minNoches > 1) out.push(ej(`${p.minNoches - 1} noches (no llega al mínimo)`, llegada, p.minNoches - 1, 2, hoy))
  else if (p?.tipo === 'anticipada') {
    out.push(ej(`Cotizado con ${Math.max(p.diasAnticipacion - 1, 0)} días (sin la anticipación)`, llegada, noches, 2, sumarDias(llegada, -Math.max(p.diasAnticipacion - 1, 0))))
  } else if (p?.tipo === 'ultimo_momento') {
    out.push(ej(`Cotizado con ${p.diasMaximos} días (ya no es último momento)`, llegada, noches, 2, sumarDias(llegada, -p.diasMaximos)))
  } else {
    const hasta = p?.hasta ?? rango?.hasta
    if (hasta) out.push(ej('Fuera de las fechas', sumarDias(hasta, 1), noches, 2, hoy))
  }
  return out.filter((e): e is EjemploVistaPrevia => e !== null).slice(0, 5)
}

// ── Edición ─────────────────────────────────────────────────────────────────

export const NOMBRE_TIPO: Record<TipoPromoConfig, string> = {
  noches: 'Por cantidad de noches',
  anticipada: 'Reserva anticipada',
  ultimo_momento: 'Último momento',
}

const nuevoId = (tipo: string) => `${tipo}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** Una promo nueva de ese tipo, pausada, con valores de ejemplo. */
export function nuevaPromo(tipo: TipoPromoConfig, hoy: string): Promo {
  const base = {
    id: nuevoId(tipo), nombre: '', activa: false, desde: hoy, hasta: sumarDias(hoy, 30),
    minNoches: 1, maxNoches: null, seSuma: false,
  }
  if (tipo === 'noches') return { ...base, tipo, minNoches: 5, ultima: 'mitad', texto: TEXTO_NOCHES.mitad }
  if (tipo === 'anticipada') {
    return {
      ...base, tipo, porcentaje: 0.1, diasAnticipacion: 20,
      texto: 'Reserva anticipada: {porcentaje}% de descuento ya aplicado en tu tarifa',
      validez: 'Válido reservando con seña hasta el {fecha}.', textoParcial: TEXTO_PARCIAL_ANTICIPADA,
    }
  }
  return { ...base, tipo, porcentaje: 0.1, diasMaximos: 7, texto: 'Último momento: {porcentaje}% de descuento' }
}

/** Copia pausada, con otro id y "(copia)" en el nombre. */
export function duplicarPromo(p: Promo): Promo {
  return { ...p, id: nuevoId(p.tipo), nombre: `${p.nombre} (copia)`, activa: false }
}

/** La condición y el valor en una línea: "5 a 6 noches · llegada 01/12 al 28/02 · última a mitad". */
export function resumenPromo(p: Promo): string {
  const noches = p.maxNoches === null
    ? `${p.minNoches}+ ${p.minNoches === 1 ? 'noche' : 'noches'}`
    : `${p.minNoches} a ${p.maxNoches} noches`
  if (p.tipo === 'noches') {
    return `${noches} · llegada del ${dm(p.desde)} al ${dm(p.hasta)} · última noche ${p.ultima === 'gratis' ? 'gratis' : 'a mitad'}`
  }
  const valor = `${pct(p.porcentaje)} en las noches del ${dm(p.desde)} al ${dm(p.hasta)}`
  if (p.tipo === 'anticipada') return `${noches} · reservando con ${p.diasAnticipacion}+ días · ${valor}`
  return `${noches} · faltando menos de ${p.diasMaximos} días · ${valor}`
}
