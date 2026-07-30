// Cruces automáticos del control de caja (Fase 1). A partir de una CajaParte
// (y opcionalmente la caja anterior) devuelve las "imperfecciones" a revisar y
// un resumen por medio de pago. Pura función, sin estado.

import type { CajaParte, CajaMovimiento } from '../types'

export type FlagLevel = 'error' | 'warn' | 'info'

export interface CajaFlag {
  level: FlagLevel
  tipo: string
  mensaje: string
}

export interface CajaResumen {
  efectivo: number
  tarjetas: number
  cheques: number
  transferencia: number
  otros: number
  totalCobrado: number
  cantIngresos: number
  cantFacturasB: number
  totalRetiros: number
}

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

// Un "Egreso por anulación de pago" del PMS revierte un cobro mal cargado (visto
// en caja real: cobro tipeado $5.817.583 en vez de $58.175,83, anulado al minuto
// y vuelto a cargar bien). No es gasto ni retiro: es la contracara de un ingreso
// que tampoco es cobro real.
export const esAnulacionPago = (m: CajaMovimiento): boolean =>
  /anulaci[oó]n\s+de\s+pago/i.test(m.observacion)

// Ingresos REALES de la caja: por cada anulación en egresos, descarta el cobro
// del mismo monto que fue revertido. Si el cobro anulado quedó en otra caja
// (anulación cruzada) no hay match y no se descarta nada: best-effort.
export function ingresosNetos(caja: CajaParte): CajaMovimiento[] {
  const anulados = caja.egresos.filter(esAnulacionPago).map(e => e.total)
  if (!anulados.length) return caja.ingresos
  const netos = [...caja.ingresos]
  for (const monto of anulados) {
    const i = netos.findIndex(m => Math.abs(m.total - monto) < 0.01)
    if (i >= 0) netos.splice(i, 1)
  }
  return netos
}

export function getCajaResumen(caja: CajaParte): CajaResumen {
  const i = ingresosNetos(caja)
  const efectivo = sum(i.map(m => m.efectivo))
  const tarjetas = sum(i.map(m => m.tarjetas))
  const cheques = sum(i.map(m => m.cheques))
  const transferencia = sum(i.map(m => m.transferencia))
  const otros = sum(i.map(m => m.otros))
  return {
    efectivo, tarjetas, cheques, transferencia, otros,
    totalCobrado: efectivo + tarjetas + cheques + transferencia + otros,
    cantIngresos: i.length,
    cantFacturasB: i.filter(m => m.facturaB).length,
    totalRetiros: sum(caja.egresos.filter(m => !esAnulacionPago(m)).map(m => m.total)),
  }
}

// Tolerancia de redondeo para los cuadres (centavos).
const EPS = 0.5

// La numeración del PMS es CIRCULAR: el contador llega a 100 y arranca de nuevo
// en 1. Verificado con datos reales: la caja 100 y la caja 1 son del mismo día
// (20/06/2026), y la Nº 80 existe en febrero Y en junio. O sea el Nº identifica
// el turno solo dentro del ciclo (~33 días a 3 turnos por día).
export const CICLO_NROS = 100
// Más de media vuelta de distancia = es una carga vieja / de otro ciclo, no un salto.
export const MAX_SALTO_NROS = CICLO_NROS / 2

// Distancia circular hacia adelante de `desde` a `hasta` (0 = mismo número,
// 1 = consecutivo; la 1 viene después de la 100).
export function gapCircular(desde: number, hasta: number): number {
  return ((hasta - desde) % CICLO_NROS + CICLO_NROS) % CICLO_NROS
}

// Números que quedan en el medio yendo de `desde` a `hasta` (ambos exclusivos),
// dando la vuelta si hace falta: nrosEntre(99, 2) = [100, 1].
export function nrosEntre(desde: number, hasta: number): number[] {
  const gap = gapCircular(desde, hasta)
  const res: number[] = []
  for (let i = 1; i < gap; i++) res.push(((desde + i - 1) % CICLO_NROS) + 1)
  return res
}

// El ítem "anterior" a uno dado, por Nº circular (la anterior a la Nº 1 es la
// Nº 100). No depende de fechas: las cajas/partes leídos por IA pueden venir con
// fecha vacía o rota. Compartido por cajas y partes (misma numeración del PMS).
// A más de media vuelta no hay anterior (en un contador circular TODO número
// tendría uno; tan lejos es otro ciclo o el futuro, no "el turno de antes").
export function anteriorPorNro<T extends { id: string; nroCaja: number }>(
  item: T,
  todos: T[],
): T | undefined {
  let best: T | undefined
  let bestGap = Infinity
  for (const c of todos) {
    if (c.id === item.id) continue
    const gap = gapCircular(c.nroCaja, item.nroCaja)
    if (gap > 0 && gap <= MAX_SALTO_NROS && gap < bestGap) { best = c; bestGap = gap }
  }
  return best
}

// Números que FALTAN cargar antes de poder guardar `nroCaja`. La regla del
// hotel: la numeración JAMÁS se saltea — guardar la 32 con la 31 sin cargar deja
// un hueco que después nadie reclama. Se compara contra la ÚLTIMA carga (por
// importedAt): solo bloquea si el nuevo número viene "adelante" de esa (hasta
// media vuelta). Re-importar, rellenar huecos viejos o cargar historia queda
// permitido. Los números ya cargados hace poco no cuentan como faltantes.
const CARGA_RECIENTE_MS = 25 * 24 * 3_600_000 // < un ciclo completo (~33 días)

export function faltantesAntesDe(
  nroCaja: number,
  existentes: { nroCaja: number; importedAt: string }[],
): number[] {
  if (!existentes.length) return []
  const ultima = existentes.reduce((a, b) => (b.importedAt > a.importedAt ? b : a))
  const gap = gapCircular(ultima.nroCaja, nroCaja)
  if (gap === 0 || gap > MAX_SALTO_NROS) return []
  const ref = new Date(ultima.importedAt).getTime()
  const recientes = new Set(
    existentes
      .filter(e => ref - new Date(e.importedAt).getTime() < CARGA_RECIENTE_MS)
      .map(e => e.nroCaja),
  )
  return nrosEntre(ultima.nroCaja, nroCaja).filter(n => !recientes.has(n))
}

// Fecha "confiable" de una caja/parte para ordenar en el tiempo: la del PMS si
// es plausible (las lecturas por IA traen fechas vacías o con año roto, ej.
// "2009"), si no la de importación (siempre presente y correcta).
export function fechaConfiable(fechaPms: string | undefined, importedAt: string): string {
  const f = fechaPms ?? ''
  return f && !isNaN(new Date(f).getTime()) && f >= '2020' ? f : importedAt
}

// Lista corta de números faltantes para mensajes ("Nº 31, Nº 32" o un rango si son muchos).
export function fmtFaltantes(nums: number[]): string {
  if (nums.length <= 4) return nums.map(n => `Nº ${n}`).join(', ')
  return `${nums.length} cajas (Nº ${nums[0]} a Nº ${nums[nums.length - 1]})`
}

/**
 * Lo que se cobró SIN que entrara plata al cajón: tarjeta, transferencia,
 * cheque, otros. Se usan los movimientos crudos (no `ingresosNetos`) porque es
 * la misma cuenta que hace el PMS para su saldo.
 *
 * Verificado sobre las 128 cajas reales: el PMS calcula
 *     saldoFinal = apertura + TODOS los ingresos − egresos − retiros
 * o sea que la tarjeta ENTRA al saldo aunque no sea efectivo en mano.
 */
export function ingresosNoEfectivo(caja: CajaParte): number {
  return caja.ingresos.reduce((s, m) => s + ((m.total || 0) - (m.efectivo || 0)), 0)
}

/**
 * ¿La "diferencia" de apertura es en realidad porque la caja anterior quedó SIN
 * CERRAR, y por eso su saldo todavía arrastra la tarjeta y la transferencia?
 *
 * CÓMO FUNCIONA EL PMS (visto en el Excel de arqueo real): mientras la caja está
 * abierta, la tarjeta y la transferencia suman al saldo aunque no sean plata en
 * el cajón. **Al cerrarla**, el PMS agrega solo un egreso automático llamado
 * "Egreso al cerrar Caja" que descuenta exactamente esos montos, y el saldo
 * final queda en efectivo puro (la hoja "Arqueo" del mismo archivo lo confirma:
 * el efectivo contado coincide con el saldo total).
 *
 * Caso real (caja 8 del 26/07/2026): Santiago dejó la caja 7 sin cerrar, así que
 * nunca se generó ese egreso y su saldo quedó $59.528,37 por encima del efectivo
 * real — justo lo que había cobrado con tarjeta. Gastón abrió la 8 con el
 * efectivo verdadero: **la apertura estaba bien y el saldo de la 7 es el que
 * está incompleto**. No hay descuadre que reclamarle a nadie; lo que falta es
 * cerrar la caja anterior.
 */
export function aperturaPorCierrePendiente(caja: CajaParte, cajaAnterior: CajaParte): boolean {
  if (cajaAnterior.cierreAt) return false
  const diff = caja.aperturaMonto - cajaAnterior.saldoFinal
  const noEfectivo = ingresosNoEfectivo(cajaAnterior)
  return noEfectivo > EPS && Math.abs(diff + noEfectivo) <= EPS
}

export function getCajaFlags(caja: CajaParte, cajaAnterior?: CajaParte): CajaFlag[] {
  const flags: CajaFlag[] = []

  // 1) Numeración + continuidad contra la caja anterior (por Nº circular). Si la
  // anterior no es la consecutiva, el problema real es que FALTA una caja en el
  // medio: se avisa eso y NO se compara la plata (comparar la apertura contra el
  // cierre de una caja más vieja daría un descuadre falso y confuso).
  if (cajaAnterior) {
    const gap = gapCircular(cajaAnterior.nroCaja, caja.nroCaja)
    if (gap === 1) {
      const diff = caja.aperturaMonto - cajaAnterior.saldoFinal
      if (Math.abs(diff) > EPS) {
        // La caja anterior sin cerrar todavía arrastra la tarjeta y la
        // transferencia en su saldo: la apertura de ESTA (el efectivo real) es
        // la correcta. No es un descuadre — no se le reclama a este conserje.
        if (aperturaPorCierrePendiente(caja, cajaAnterior)) {
          flags.push({
            level: 'warn',
            tipo: 'cierre_pendiente_anterior',
            mensaje: `La apertura (${fmt(caja.aperturaMonto)}) no coincide con el saldo de la caja ${cajaAnterior.nroCaja} (${fmt(cajaAnterior.saldoFinal)}) porque esa caja quedó SIN CERRAR: su saldo todavía incluye ${fmt(ingresosNoEfectivo(cajaAnterior))} cobrados con tarjeta o transferencia, que el PMS descuenta recién al cerrarla. Esta apertura es el efectivo real y está bien: lo que falta es cerrar la caja ${cajaAnterior.nroCaja}.`,
          })
        } else {
          flags.push({
            level: 'error',
            tipo: 'continuidad',
            mensaje: `La apertura (${fmt(caja.aperturaMonto)}) no coincide con el cierre de la caja ${cajaAnterior.nroCaja} (${fmt(cajaAnterior.saldoFinal)}). Diferencia ${fmt(diff)}.`,
          })
        }
      }
    } else if (gap > 1 && gap <= MAX_SALTO_NROS) {
      flags.push({
        level: 'error',
        tipo: 'falta_caja',
        mensaje: `Entre la caja ${cajaAnterior.nroCaja} y esta falta cargar: ${fmtFaltantes(nrosEntre(cajaAnterior.nroCaja, caja.nroCaja))}. La numeración jamás se saltea — sin esa caja no se puede conciliar la continuidad de la plata.`,
      })
    }
    // Más de media vuelta: es de otro ciclo / carga vieja, no se concilia.
  }

  // 2) Caja sin cerrar.
  if (!caja.cierreAt) {
    flags.push({ level: 'warn', tipo: 'sin_cierre', mensaje: 'La caja todavía no está cerrada.' })
  }

  // 3) Cobros con tarjeta sin Factura B asociada (los cobros anulados no cuentan).
  const tarjetaSinFB = ingresosNetos(caja).filter(m => m.tarjetas > 0 && !m.facturaB)
  if (tarjetaSinFB.length) {
    flags.push({
      level: 'warn',
      tipo: 'tarjeta_sin_fb',
      mensaje: `${tarjetaSinFB.length} cobro(s) con tarjeta sin Factura B: ${tarjetaSinFB.map(m => m.habitacion || m.reserva || '?').join(', ')}.`,
    })
  }

  // Los egresos que no son "RETIRO EFECTIVO" son gastos de caja (no alertas): se
  // muestran como gasto en el análisis, no como imperfección a revisar.

  return flags
}

function fmt(n: number): string {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 })
}
