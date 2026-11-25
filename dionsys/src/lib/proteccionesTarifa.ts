import type { TarifarioPublico } from './landing'
import { cotizarEstadia, estadiaMinimaDe, minNochesDia, promosDeCotizacion, type PromoAnticipada } from './tarifaDiaria'
import type { Promo } from './promos'
import {
  especialesConAjustes, tienePrecio, type AjustesTarifa, type EstadiaMinima, type TarifaEspecial,
} from './tarifasEspeciales'

// Avisos ANTES de guardar precios, mínimos o estadías mínimas. No bloquean: el
// dueño puede confirmar igual. Los parámetros son configuración en la nube
// (almacén 'dionsys_tarifas_protecciones'), editable solo por el dueño.

export const KEY_PROTECCIONES = 'dionsys_tarifas_protecciones'

export interface ProteccionesTarifa {
  /** Precio por persona mínimo (2 a 5 personas). 0 = sin piso. */
  pisoPorPersona: number
  /** Descuento máximo sobre la lista que puede llevarse un huésped (fracción). */
  topeDescuento: number
  /** Relación de referencia single / por persona (solo para el texto del aviso). */
  relacionSingle: number
}

export const PROTECCIONES_DEFECTO: ProteccionesTarifa = { pisoPorPersona: 0, topeDescuento: 0.25, relacionSingle: 1.85 }

/** Lo guardado si está bien formado; si falta algo, completa con lo de por defecto. */
export function validarProtecciones(v: unknown): ProteccionesTarifa {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<ProteccionesTarifa>
  const num = (x: unknown, ok: (n: number) => boolean, def: number) => (typeof x === 'number' && ok(x) ? x : def)
  return {
    pisoPorPersona: num(o.pisoPorPersona, n => n >= 0, PROTECCIONES_DEFECTO.pisoPorPersona),
    topeDescuento: num(o.topeDescuento, n => n > 0 && n < 1, PROTECCIONES_DEFECTO.topeDescuento),
    relacionSingle: num(o.relacionSingle, n => n >= 1 && n <= 2, PROTECCIONES_DEFECTO.relacionSingle),
  }
}

export function leerProtecciones(): ProteccionesTarifa {
  try {
    return validarProtecciones(JSON.parse(globalThis.localStorage?.getItem(KEY_PROTECCIONES) ?? 'null'))
  } catch {
    return { ...PROTECCIONES_DEFECTO }
  }
}

const money = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
const pct = (f: number) => `${Math.round(f * 1000) / 10}%`.replace('.', ',')
const dm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`
const DIA = 86_400_000
const sumar = (f: string, n: number) => new Date(Date.parse(f + 'T00:00:00Z') + n * DIA).toISOString().slice(0, 10)

/** Noches cuyo ajuste cambió entre dos versiones. */
export function fechasCambiadas(antes: AjustesTarifa, despues: AjustesTarifa): string[] {
  const todas = new Set([...Object.keys(antes), ...Object.keys(despues)])
  return [...todas].filter(f => !mismoAjuste(antes[f], despues[f])).sort()
}

// Por campo: el orden en que quedaron guardadas las claves no es un cambio.
const CAMPOS = ['porPersona', 'single', 'descEfectivo', 'minNoches'] as const
function mismoAjuste(a: AjustesTarifa[string] | undefined, b: AjustesTarifa[string] | undefined): boolean {
  if (!a || !b) return !a && !b
  return CAMPOS.every(c => (a[c] ?? null) === (b[c] ?? null))
}

/** Single igual o más cara que la doble, y por persona debajo del piso. */
export function avisosDePrecio(ajustes: AjustesTarifa, fechas: string[], cfg: ProteccionesTarifa): string[] {
  const avisos: string[] = []
  for (const f of fechas) {
    const a = ajustes[f]
    if (!tienePrecio(a)) continue
    const pp = a.porPersona!, single = a.single!
    if (single >= 2 * pp) {
      avisos.push(
        `${dm(f)}: la single (${money(single)}) cuesta igual o más que la doble (2 × ${money(pp)} = ${money(2 * pp)}). `
        + `Referencia: ${String(cfg.relacionSingle).replace('.', ',')} × ${money(pp)} = ${money(cfg.relacionSingle * pp)}.`,
      )
    }
    if (cfg.pisoPorPersona > 0 && pp < cfg.pisoPorPersona) {
      avisos.push(`${dm(f)}: el precio por persona (${money(pp)}) queda debajo del piso de ${money(cfg.pisoPorPersona)}.`)
    }
  }
  return agrupar(avisos)
}

// Muchas noches con el mismo problema: se muestran las primeras y cuántas más.
function agrupar(avisos: string[], max = 6): string[] {
  return avisos.length <= max ? avisos : [...avisos.slice(0, max), `…y ${avisos.length - max} avisos más del mismo tipo.`]
}

export interface PeorDescuento {
  descuento: number
  llegada: string
  salida: string
  pax: number
  total: number
  cobrado: number
}

/**
 * El mayor descuento sobre la lista que puede llevarse un huésped en alguna
 * estadía de 1 a 14 noches que toque esas fechas, con 1 y 2 personas. Usa el
 * cálculo real (cotizarEstadia): efectivo, descuentos con cualquier medio,
 * y las promos: las que piden anticipación como si se reservara con mucha, y
 * las de último momento como si se reservara el mismo día de la llegada.
 * `promos` = todas las promos vigentes; si no se pasan, las por noches de
 * siempre más `anticipada`.
 */
export function peorDescuento(
  fechas: string[],
  t: TarifarioPublico,
  especiales: TarifaEspecial[],
  estadias: EstadiaMinima[],
  anticipada: PromoAnticipada | null,
  promos?: readonly Promo[],
): PeorDescuento | null {
  const lista = promosDeCotizacion({ promos, anticipada })
  // Sin promos de último momento alcanza con cotizar como si se reservara con mucha anticipación.
  const ultimoMomento = lista.some(p => p.activa && p.tipo === 'ultimo_momento')
  let peor: PeorDescuento | null = null
  const vistas = new Set<string>()
  for (const f of fechas) {
    for (let n = 1; n <= 14; n++) {
      for (let k = 0; k < n; k++) {
        const llegada = sumar(f, -k), salida = sumar(llegada, n)
        if (vistas.has(llegada + salida)) continue
        vistas.add(llegada + salida)
        for (const pax of [1, 2]) {
          for (const hoy of ultimoMomento ? ['2000-01-01', llegada] : ['2000-01-01']) {
            const c = cotizarEstadia(llegada, salida, pax, t, especiales, estadias, { promos: lista, hoy })
            if (c.incompleta || c.total <= 0) continue
            const cobrado = Math.min(c.efectivo, c.conDescuento, c.promo?.total ?? Infinity)
            const descuento = 1 - cobrado / c.total
            if (!peor || descuento > peor.descuento + 1e-9) peor = { descuento, llegada, salida, pax, total: c.total, cobrado }
          }
        }
      }
    }
  }
  return peor
}

/** Mínimo exigido por cada noche (temporada/ajuste y estadía mínima por fechas, el mayor). */
function minimoDeNoche(f: string, t: TarifarioPublico, especiales: TarifaEspecial[], estadias: EstadiaMinima[]): number {
  return Math.max(minNochesDia(f, t, especiales), estadiaMinimaDe(f, estadias)?.minNoches ?? 1)
}

/**
 * Findes largos del tarifario publicado (los tramos pegados se toman como uno:
 * "Inmaculada" + "Inmaculada DOM LUN") cuyo mínimo de noches no es parejo.
 * Solo los que tocan `fechas` (sin fechas: todos).
 */
export function avisosFindeLargo(
  t: TarifarioPublico,
  especiales: TarifaEspecial[],
  estadias: EstadiaMinima[],
  fechas?: string[],
): string[] {
  const tramos = [...t.findesLargos].sort((a, b) => a.desde.localeCompare(b.desde))
  const bloques: { nombre: string; desde: string; hasta: string }[] = []
  for (const fl of tramos) {
    const ult = bloques[bloques.length - 1]
    if (ult && fl.desde <= sumar(ult.hasta, 1)) {
      if (fl.hasta > ult.hasta) ult.hasta = fl.hasta
    } else {
      bloques.push({ nombre: fl.n, desde: fl.desde, hasta: fl.hasta })
    }
  }
  const avisos: string[] = []
  for (const b of bloques) {
    if (fechas && !fechas.some(f => b.desde <= f && f <= b.hasta)) continue
    const porNoche: [string, number][] = []
    for (let f = b.desde; f <= b.hasta; f = sumar(f, 1)) porNoche.push([f, minimoDeNoche(f, t, especiales, estadias)])
    const distintos = new Set(porNoche.map(([, m]) => m))
    if (distintos.size > 1) {
      const detalle = porNoche.map(([f, m]) => `${dm(f)}: ${m}`).join(', ')
      avisos.push(`Finde largo ${b.nombre} (${dm(b.desde)} al ${dm(b.hasta)}): el mínimo de noches no es parejo (${detalle}).`)
    }
  }
  return avisos
}

export interface ContextoAvisos {
  tarifario: TarifarioPublico
  estadias: EstadiaMinima[]
  anticipada?: PromoAnticipada | null
  /** Todas las promos vigentes (si se pasan, mandan sobre `anticipada`). */
  promos?: readonly Promo[]
  config: ProteccionesTarifa
}

/** Todos los avisos al guardar ajustes por día. Vacío = se guarda sin preguntar. */
export function avisosAlGuardarAjustes(antes: AjustesTarifa, despues: AjustesTarifa, ctx: ContextoAvisos): string[] {
  const fechas = fechasCambiadas(antes, despues)
  if (!fechas.length) return []
  const especiales = especialesConAjustes(despues)
  const avisos = avisosDePrecio(despues, fechas, ctx.config)
  const conPrecio = fechas.filter(f => tienePrecio(despues[f]))
  const peor = conPrecio.length ? peorDescuento(conPrecio, ctx.tarifario, especiales, ctx.estadias, ctx.anticipada ?? null, ctx.promos) : null
  if (peor && peor.descuento > ctx.config.topeDescuento + 1e-9) {
    avisos.push(
      `El descuento combinado llega a ${pct(peor.descuento)} (tope ${pct(ctx.config.topeDescuento)}): `
      + `${dm(peor.llegada)} al ${dm(peor.salida)}, ${peor.pax} ${peor.pax === 1 ? 'persona' : 'personas'}, `
      + `lista ${money(peor.total)} → ${money(peor.cobrado)}.`,
    )
  }
  avisos.push(...avisosFindeLargo(ctx.tarifario, especiales, ctx.estadias, fechas))
  return avisos
}

/** Avisos al guardar estadías mínimas por fechas. */
export function avisosAlGuardarEstadias(
  nuevas: EstadiaMinima[],
  t: TarifarioPublico,
  especiales: TarifaEspecial[],
): string[] {
  const fechas: string[] = []
  for (const e of nuevas) {
    if (!e.activo) continue
    for (let f = e.desde; f <= e.hasta && fechas.length < 400; f = sumar(f, 1)) fechas.push(f)
  }
  return avisosFindeLargo(t, especiales, nuevas, fechas)
}
