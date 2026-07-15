// Conciliación mensual de tarjetas: lo cobrado por tarjeta según las cajas del
// PMS vs el total del resumen de Prisma (lo carga el admin a mano, un número
// por mes). Función pura, sin estado ni red.

import type { CajaParte } from '../types'
import { ingresosNetos } from './cajaControl'

// Total mensual según el resumen de Prisma, cargado a mano por el admin.
export interface PrismaResumenMes {
  mes: string        // YYYY-MM
  total: number
  cargadoBy: string
  cargadoAt: string  // ISO
}

// Mes local (YYYY-MM) de un ISO, para agrupar sin que la medianoche UTC corra el mes.
function mesLocal(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export interface ConciliacionMes {
  mes: string            // YYYY-MM
  sistema: number        // cobrado por tarjeta según las cajas del sistema
  cobros: number         // cantidad de cobros con tarjeta
  prisma: number | null  // total según el resumen Prisma (null = todavía sin cargar)
  dif: number | null     // prisma - sistema
}

// Con centavos de por medio, hasta $1 de diferencia se considera que coincide.
export const TOLERANCIA_CONCILIACION = 1

export function conciliacionTarjetas(cajas: CajaParte[], resumenes: PrismaResumenMes[]): ConciliacionMes[] {
  const map = new Map<string, { sistema: number; cobros: number }>()
  for (const c of cajas) {
    // ingresosNetos: los cobros anulados por el PMS no cuentan como plata cobrada.
    for (const m of ingresosNetos(c)) {
      if (m.tarjetas <= 0) continue
      const mes = mesLocal(m.fechaHora) || mesLocal(c.aperturaAt)
      if (!mes) continue
      const e = map.get(mes) ?? { sistema: 0, cobros: 0 }
      e.sistema += m.tarjetas
      e.cobros += 1
      map.set(mes, e)
    }
  }
  // Un mes con resumen Prisma cargado pero sin cobros en el sistema también se lista.
  for (const r of resumenes) if (!map.has(r.mes)) map.set(r.mes, { sistema: 0, cobros: 0 })
  const prismaPorMes = new Map(resumenes.map(r => [r.mes, r.total]))
  return [...map.entries()]
    .map(([mes, v]): ConciliacionMes => {
      const prisma = prismaPorMes.get(mes) ?? null
      return {
        mes,
        sistema: +v.sistema.toFixed(2),
        cobros: v.cobros,
        prisma,
        dif: prisma != null ? +(prisma - v.sistema).toFixed(2) : null,
      }
    })
    .sort((a, b) => b.mes.localeCompare(a.mes))
}
