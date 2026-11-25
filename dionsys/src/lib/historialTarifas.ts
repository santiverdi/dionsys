import { supabase } from './supabase'
import type { AjusteDia, AjustesTarifa } from './tarifasEspeciales'

// Historial de cambios de tarifas (tabla tarifas_historial). Lo escribe un
// trigger de la base cada vez que cambia una clave de tarifas en app_state, con
// la foto completa antes y después. Desde acá se arma el "volver atrás":
//   - revertirCambio(): deshace SOLO lo que cambió esa entrada (en precios por
//     día, solo esas noches), dejando como están los cambios posteriores.
//   - versionDe(): la foto completa tal como quedó después de esa entrada.
// Las dos se guardan como un cambio nuevo (con guardarTarifa), que también
// queda en el historial.

export interface EntradaHistorial {
  id: number
  creado_en: string
  autor_id: string | null
  autor_nombre: string
  clave: string
  fechas: string[] | null
  valor_anterior: unknown
  valor_nuevo: unknown
  motivo: string | null
  revierte_id: number | null
}

export const NOMBRE_CLAVE: Record<string, string> = {
  dionsys_tarifas_dia: 'Precios y mínimos por día',
  dionsys_estadias_minimas: 'Estadías mínimas por fechas',
  dionsys_promo_anticipada: 'Reserva anticipada',
  dionsys_tarifas_protecciones: 'Protecciones al guardar',
  dionsys_tarifas: 'Tarifas pactadas (control de caja)',
  tarifario_publico: 'Tarifario público (página web)',
}

/** Las claves que se pueden volver atrás desde la app (el tarifario público se republica desde Web). */
export const CLAVES_REVERTIBLES = [
  'dionsys_tarifas_dia', 'dionsys_estadias_minimas', 'dionsys_promo_anticipada',
  'dionsys_tarifas_protecciones', 'dionsys_tarifas',
] as const

export const esRevertible = (clave: string) => (CLAVES_REVERTIBLES as readonly string[]).includes(clave)

const esObjeto = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
// La base (jsonb) reordena las claves: comparar sin depender del orden.
function estable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(estable)
  if (esObjeto(v)) return Object.fromEntries(Object.keys(v).sort().map(k => [k, estable(v[k])]))
  return v ?? null
}
const igual = (a: unknown, b: unknown) => JSON.stringify(estable(a)) === JSON.stringify(estable(b))

export interface DiferenciaDia {
  fecha: string
  antes: AjusteDia | null
  despues: AjusteDia | null
}

/** Noche por noche, qué cambió entre dos versiones de los precios por día. */
export function diferenciasPorDia(antes: unknown, despues: unknown): DiferenciaDia[] {
  const a = (esObjeto(antes) ? antes : {}) as AjustesTarifa
  const d = (esObjeto(despues) ? despues : {}) as AjustesTarifa
  return [...new Set([...Object.keys(a), ...Object.keys(d)])]
    .filter(f => !igual(a[f], d[f]))
    .sort()
    .map(f => ({ fecha: f, antes: a[f] ?? null, despues: d[f] ?? null }))
}

export interface Reversion {
  valor: unknown
  /** Noches que cambiaron DESPUÉS de esta entrada y que revertir va a pisar. */
  pisa: string[]
}

/**
 * Deshace esta entrada sobre lo que hay hoy. En precios por día se tocan solo
 * las noches de esa entrada; en las demás claves vuelve la foto anterior.
 * null = no hay nada a qué volver (era la primera vez que se guardaba).
 */
export function revertirCambio(actual: unknown, e: EntradaHistorial): Reversion | null {
  if (e.clave === 'dionsys_tarifas_dia') {
    const hoy = { ...((esObjeto(actual) ? actual : {}) as AjustesTarifa) }
    const ant = (esObjeto(e.valor_anterior) ? e.valor_anterior : {}) as AjustesTarifa
    const nue = (esObjeto(e.valor_nuevo) ? e.valor_nuevo : {}) as AjustesTarifa
    const pisa: string[] = []
    for (const { fecha } of diferenciasPorDia(ant, nue)) {
      if (!igual(hoy[fecha], nue[fecha])) pisa.push(fecha)
      if (ant[fecha]) hoy[fecha] = ant[fecha]
      else delete hoy[fecha]
    }
    return { valor: hoy, pisa }
  }
  let anterior = e.valor_anterior
  // La primera lista de estadías mínimas se deshace dejando la lista vacía.
  if ((anterior === null || anterior === undefined) && e.clave === 'dionsys_estadias_minimas') anterior = []
  if (anterior === null || anterior === undefined) return null
  return { valor: anterior, pisa: igual(actual, e.valor_nuevo) ? [] : ['(cambió después)'] }
}

/** La foto completa tal como quedó después de esta entrada. */
export function versionDe(e: EntradaHistorial): unknown {
  return e.valor_nuevo
}

const dm = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`
const k = (n: number | undefined) => (n ? `${Math.round(n / 100) / 10}k`.replace('.', ',') : '—')

/** "pp 42k → 45k · single 78k → 80k · mín 1 → 2" */
export function textoDiferencia(d: DiferenciaDia): string {
  const a = d.antes ?? {}, b = d.despues ?? {}
  const partes: string[] = []
  if (a.porPersona !== b.porPersona) partes.push(`pp ${k(a.porPersona)} → ${k(b.porPersona)}`)
  if (a.single !== b.single) partes.push(`single ${k(a.single)} → ${k(b.single)}`)
  if (a.descEfectivo !== b.descEfectivo) {
    const p = (x?: number) => (x ? `${Math.round(x * 100)}%` : '—')
    partes.push(`efectivo ${p(a.descEfectivo)} → ${p(b.descEfectivo)}`)
  }
  if (a.minNoches !== b.minNoches) partes.push(`mín ${a.minNoches ?? '—'} → ${b.minNoches ?? '—'}`)
  return `${dm(d.fecha)}: ${partes.join(' · ') || 'sin cambios'}`
}

/** "1/12 al 3/12, 8/12" — las noches agrupadas en tramos seguidos. */
export function resumenFechas(fechas: string[]): string {
  const ord = [...fechas].sort()
  const tramos: [string, string][] = []
  for (const f of ord) {
    const ult = tramos[tramos.length - 1]
    const sig = ult && new Date(Date.parse(ult[1] + 'T00:00:00Z') + 86_400_000).toISOString().slice(0, 10)
    if (ult && sig === f) ult[1] = f
    else tramos.push([f, f])
  }
  return tramos.map(([a, b]) => (a === b ? dm(a) : `${dm(a)} al ${dm(b)}`)).join(', ')
}

export async function cargarHistorial(limite = 50): Promise<{ entradas: EntradaHistorial[]; error: string | null }> {
  if (!supabase) return { entradas: [], error: 'La nube no está configurada.' }
  const { data, error } = await supabase
    .from('tarifas_historial')
    .select('*')
    .order('id', { ascending: false })
    .limit(limite)
  if (error) {
    return {
      entradas: [],
      error: error.code === '42P01' || error.code === 'PGRST205'
        ? 'Falta crear el historial en Supabase (supabase/etapa1_tarifas.sql).'
        : `No se pudo leer el historial: ${error.message}`,
    }
  }
  return { entradas: (data ?? []) as EntradaHistorial[], error: null }
}
