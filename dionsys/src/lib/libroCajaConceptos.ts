// Qué conceptos del libro de Charo cuentan como SALIDA de plata del mes.
//
// El libro mezcla tres cosas distintas y solo una es gasto del hotel:
//   - plata que ENTRA (el efectivo y las tarjetas que vienen de la caja del
//     conserje, las señas de los grupos): no es salida
//   - plata que se MUEVE de un lado a otro (cambio, dinero en guarda, retiros):
//     tampoco, sigue siendo del hotel
//   - lo que se PAGA de verdad (proveedores, publicidad, honorarios…)
//
// Y de lo que se paga, una parte ya se carga en su propia pantalla (sueldos,
// impuestos, servicios): si eso además contara acá, se contaría dos veces.
//
// Nada cuenta como salida hasta que alguien lo marca: el default es NO. Lo que
// falta decidir queda a la vista con su monto, en vez de entrar callado a un
// total. Las marcas son por concepto y valen para todos los meses.

import { useState, useCallback } from 'react'
import type { LibroCajaMes } from '../types'
import { persist, useCloudSync } from './cloudStore'

const KEY = 'dionsys_libro_caja_conceptos'

/** Conceptos que NO son una salida de plata, con el motivo para mostrarlo. */
const MOTIVO_NO: Record<string, string> = {
  '001': 'es el efectivo que entra de la caja del conserje',
  '002': 'son las tarjetas que entran de la caja del conserje',
  '003': 'es un movimiento entre cuentas del hotel',
  '014': 'es un cobro (seña), no un gasto',
  '024': 'es un ajuste de caja, no un gasto',
  '028': 'es plata guardada, sigue siendo del hotel',
  '029': 'es cambio, no sale plata',
  '032': 'es un retiro, la plata sigue siendo del hotel',
}

/**
 * Conceptos que SÍ son un gasto pero que además tienen su propia pantalla en el
 * sistema. Marcarlos acá cuando allá ya está cargado lo cuenta dos veces — pero
 * si ese mes allá no se cargó nada, este libro es el único que lo tiene.
 *
 * Por eso no se decide de fábrica: la pantalla muestra cuánto hay cargado del
 * otro lado ESE mes y ahí se ve solo cuál de los dos casos es.
 */
export type RubroSistema =
  | 'sueldos' | 'impuestos' | 'servicios' | 'profesionales' | 'mantenimiento' | 'compras'

const YA_EN_SISTEMA: Record<string, { rubro: RubroSistema; pantalla: string }> = {
  '010': { rubro: 'sueldos', pantalla: 'Sueldos' },
  '011': { rubro: 'sueldos', pantalla: 'Sueldos' },
  '006': { rubro: 'impuestos', pantalla: 'Impuestos y Servicios' },
  '008': { rubro: 'impuestos', pantalla: 'Impuestos y Servicios' },
  '007': { rubro: 'servicios', pantalla: 'Impuestos y Servicios' },
  '023': { rubro: 'profesionales', pantalla: 'Impuestos y Servicios' },
  '020': { rubro: 'mantenimiento', pantalla: 'Mantenimiento' },
  '012': { rubro: 'compras', pantalla: 'Pedidos y facturas' },
  '013': { rubro: 'compras', pantalla: 'Pedidos y facturas' },
}

/** En qué pantalla del sistema puede estar cargado el mismo gasto (o null). */
export function yaEnSistema(conceptoCod: string): { rubro: RubroSistema; pantalla: string } | null {
  return YA_EN_SISTEMA[conceptoCod] ?? null
}

/** Conceptos que hay que mirar con atención antes de contarlos como gasto. */
const OJO: Record<string, string> = {
  '025': '¿es un retiro de los dueños o un gasto del hotel?',
  '026': '¿es un retiro de los dueños o un gasto del hotel?',
  '027': '¿es un retiro de los dueños o un gasto del hotel?',
}

/** Por qué se sugiere no contarlo (vacío = no hay sugerencia). */
export function motivoNoContar(conceptoCod: string): string {
  return MOTIVO_NO[conceptoCod] ?? ''
}

/** Aviso para los conceptos ambiguos (vacío = no hay nada que aclarar). */
export function avisoConcepto(conceptoCod: string): string {
  return OJO[conceptoCod] ?? ''
}

/**
 * Cuánto sale de plata en cada mes, contando SOLO los conceptos marcados como
 * salida. Es lo que el Dashboard suma a los egresos: sin marcas da 0 y el
 * resultado del mes queda igual que antes.
 *
 * Solo se suman los montos negativos: si un concepto marcado además tuvo una
 * entrada, esa entrada no es una salida y no se compensa con nada.
 */
export function salidasMarcadasPorMes(
  meses: LibroCajaMes[],
  marcas: Record<string, boolean>,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const m of meses) {
    for (const mov of m.movimientos) {
      if (mov.monto >= 0) continue
      if (marcas[mov.conceptoCod] !== true) continue
      // Manda la fecha del movimiento, no el archivo: una fila con fecha de otro
      // mes suma en el mes que dice su fecha.
      const mesMov = mov.fecha.slice(0, 7)
      out.set(mesMov, (out.get(mesMov) ?? 0) + -mov.monto)
    }
  }
  for (const [k, v] of out) out.set(k, Math.round(v * 100) / 100)
  return out
}

function load(): Record<string, boolean> {
  const saved = localStorage.getItem(KEY)
  if (!saved) return {}
  try {
    const v = JSON.parse(saved)
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

export function useConceptosSalida() {
  const [marcas, setMarcas] = useState<Record<string, boolean>>(load)

  useCloudSync<Record<string, boolean>>(KEY, v => setMarcas(v && typeof v === 'object' ? v : {}))

  /** Marca (o desmarca) un concepto como salida del mes. */
  const marcar = useCallback((conceptoCod: string, cuenta: boolean) => {
    setMarcas(prev => {
      const next = { ...prev, [conceptoCod]: cuenta }
      persist(KEY, next)
      return next
    })
  }, [])

  /** Vuelve a dejarlo sin decidir. */
  const olvidar = useCallback((conceptoCod: string) => {
    setMarcas(prev => {
      const next = { ...prev }
      delete next[conceptoCod]
      persist(KEY, next)
      return next
    })
  }, [])

  return { marcas, marcar, olvidar }
}
