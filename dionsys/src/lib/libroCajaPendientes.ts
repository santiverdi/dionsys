// Cuánta plata del libro de Charo todavía NO está en ningún número.
//
// EL PROBLEMA QUE RESUELVE: el libro es el registro completo de lo que se pagó,
// pero nada suma hasta que alguien lo decide — marcándolo (libroCajaMarcas) o
// mandándolo a su pantalla (libroCajaSueldos / libroCajaImpuestos). Eso está
// bien: decidir a mano es lo que evita contar dos veces. Lo que estaba mal es
// que la plata NO decidida no se veía en ningún lado: el resultado del mes salía
// prolijo y de menos, y con los días nadie se acordaba de volver a mirarla.
//
// Acá se separa cada salida del libro en cuatro:
//   derivado    → se mandó a Sueldos o a Impuestos y suma allá
//   marcado     → se marcó a mano y suma como "Caja Administración (libro)"
//   yaEnSistema → aparea con un pago ya cargado en otra pantalla (pedido,
//                 mantenimiento…): ya está contado, no hay nada que hacer
//   sinDecidir  → NADIE la miró. Es el número que hay que gritar.
//
// El orden importa: lo derivado también aparea contra su propio pago, así que
// se revisa primero. `yaEnSistema` sale del apareo por monto y fecha, que es una
// corazonada — por eso no suma nada solo: solo evita alertar por plata que ya
// estaba contada.

import type { LibroCajaMes, LibroCajaMovimiento, PagoMensual, PagoSueldo } from '../types'
import { claveMovimiento } from './libroCajaMarcas'
import { cruzarLibro, pagosDelSistema, type SistemaInputs } from './libroCajaCruce'

/**
 * Las filas del libro que ya se mandaron a Sueldos o a Impuestos.
 * (Dos filas idénticas — misma fecha, concepto, medio, importe y detalle —
 * comparten clave y no se pueden distinguir: es la misma limitación que tienen
 * las marcas desde siempre.)
 */
export function clavesDerivadas(
  pagosSueldos: PagoSueldo[],
  pagosImpuestos: PagoMensual[],
): Set<string> {
  const out = new Set<string>()
  for (const p of pagosSueldos) if (p.origenLibro) out.add(p.origenLibro)
  for (const p of pagosImpuestos) if (p.origenLibro) out.add(p.origenLibro)
  return out
}

export interface ResumenLibroMes {
  mes: string                          // YYYY-MM
  derivado: number
  marcado: number
  yaEnSistema: number
  sinDecidir: number
  cantSinDecidir: number
  /** Las salidas sin decidir, de la más cara a la más barata. */
  filasSinDecidir: LibroCajaMovimiento[]
}

const round = (n: number) => Math.round(n * 100) / 100

/** En qué estado está cada salida de un mes del libro. */
export function resumenLibroMes(
  mes: LibroCajaMes,
  marcas: Record<string, boolean>,
  derivadas: Set<string>,
  sistema: SistemaInputs,
): ResumenLibroMes {
  const [y, m] = mes.mes.split('-').map(Number)
  const cruce = cruzarLibro(mes.movimientos, pagosDelSistema(y, m, sistema))
  // cruzarLibro ya se quedó solo con las salidas que son gasto de verdad: lo que
  // entra y los movimientos internos (cambio, retiros) no son plata perdida.
  const apareadas = new Set(cruce.yaCargados.map(x => x.mov))
  const salidas = cruce.yaCargados.map(x => x.mov).concat(cruce.soloLibro)

  const r: ResumenLibroMes = {
    mes: mes.mes, derivado: 0, marcado: 0, yaEnSistema: 0,
    sinDecidir: 0, cantSinDecidir: 0, filasSinDecidir: [],
  }

  for (const mov of salidas) {
    const monto = -mov.monto
    const clave = claveMovimiento(mov)
    if (derivadas.has(clave)) r.derivado += monto
    else if (marcas[clave] === true) r.marcado += monto
    else if (apareadas.has(mov)) r.yaEnSistema += monto
    else {
      r.sinDecidir += monto
      r.cantSinDecidir++
      r.filasSinDecidir.push(mov)
    }
  }

  r.derivado = round(r.derivado)
  r.marcado = round(r.marcado)
  r.yaEnSistema = round(r.yaEnSistema)
  r.sinDecidir = round(r.sinDecidir)
  r.filasSinDecidir.sort((a, b) => a.monto - b.monto)   // la más cara arriba
  return r
}

export interface PendientesLibro {
  porMes: Map<string, ResumenLibroMes>
  totalSinDecidir: number
  cantSinDecidir: number
  /** Meses con plata sin decidir, del más viejo al más nuevo. */
  mesesConPendiente: string[]
}

/** Lo mismo para todos los meses importados: lo viejo no se archiva solo. */
export function pendientesLibro(
  meses: LibroCajaMes[],
  marcas: Record<string, boolean>,
  derivadas: Set<string>,
  sistema: SistemaInputs,
): PendientesLibro {
  const porMes = new Map<string, ResumenLibroMes>()
  for (const mes of meses) porMes.set(mes.mes, resumenLibroMes(mes, marcas, derivadas, sistema))

  const conPendiente = [...porMes.values()].filter(r => r.cantSinDecidir > 0)
  return {
    porMes,
    totalSinDecidir: round(conPendiente.reduce((s, r) => s + r.sinDecidir, 0)),
    cantSinDecidir: conPendiente.reduce((s, r) => s + r.cantSinDecidir, 0),
    mesesConPendiente: conPendiente.map(r => r.mes).sort(),
  }
}
