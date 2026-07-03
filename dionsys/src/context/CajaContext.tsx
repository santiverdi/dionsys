import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { CajaParte } from '../types'
import { persist, useCloudSync } from '../lib/cloudStore'
import { anteriorPorNro, fechaConfiable } from '../lib/cajaControl'

const LS_CAJAS = 'dionsys_cajas'

// Mismo Nº con fechas a menos de esto = la misma caja (re-import). El ciclo del
// contador dura ~33 días (100 números a 3 turnos/día), así que 15 días separa
// con margen un re-import de una colisión de ciclo.
const MISMO_CICLO_MS = 15 * 24 * 3_600_000

interface CajaContextType {
  cajas: CajaParte[]
  addCaja: (caja: CajaParte) => void
  deleteCaja: (id: string) => void
  // Caja inmediatamente anterior (por Nº de caja) — para el cruce de continuidad y numeración.
  getCajaAnterior: (caja: CajaParte) => CajaParte | undefined
}

const CajaContext = createContext<CajaContextType | null>(null)

export function CajaProvider({ children }: { children: ReactNode }) {
  const [cajas, setCajas] = useState<CajaParte[]>(() => {
    const saved = localStorage.getItem(LS_CAJAS)
    return saved ? JSON.parse(saved) : []
  })

  useCloudSync<CajaParte[]>(LS_CAJAS, setCajas)

  const addCaja = useCallback((caja: CajaParte) => {
    setCajas(prev => {
      // Dedup por Nro. de Caja SOLO dentro del mismo ciclo: el contador del PMS da
      // la vuelta en 100, así que la Nº 80 de hoy NO es la Nº 80 de hace dos meses
      // (borrar esa sería perder una caja vieja). Re-importar la misma caja
      // (mismo Nº, fechas cercanas) sí la reemplaza.
      const f = fechaConfiable(caja.aperturaAt, caja.importedAt)
      const rest = prev.filter(c =>
        c.nroCaja !== caja.nroCaja ||
        Math.abs(new Date(fechaConfiable(c.aperturaAt, c.importedAt)).getTime() - new Date(f).getTime()) > MISMO_CICLO_MS,
      )
      // Orden por fecha confiable desc (por Nº quedaría la 100 vieja arriba de la 37 nueva).
      const updated = [caja, ...rest].sort((a, b) =>
        fechaConfiable(b.aperturaAt, b.importedAt).localeCompare(fechaConfiable(a.aperturaAt, a.importedAt)))
      persist(LS_CAJAS, updated)
      return updated
    })
  }, [])

  const deleteCaja = useCallback((id: string) => {
    setCajas(prev => {
      const updated = prev.filter(c => c.id !== id)
      persist(LS_CAJAS, updated)
      return updated
    })
  }, [])

  const getCajaAnterior = useCallback((caja: CajaParte): CajaParte | undefined => {
    // La anterior por Nº circular (la anterior a la 1 es la 100). No depende de
    // fechas: las cajas leídas por IA pueden venir con aperturaAt vacío o mal.
    return anteriorPorNro(caja, cajas)
  }, [cajas])

  return (
    <CajaContext.Provider value={{ cajas, addCaja, deleteCaja, getCajaAnterior }}>
      {children}
    </CajaContext.Provider>
  )
}

export function useCajas() {
  const ctx = useContext(CajaContext)
  if (!ctx) throw new Error('useCajas must be used within CajaProvider')
  return ctx
}
