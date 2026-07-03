import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import type { CajaParte } from '../types'
import { persist, useCloudSync } from '../lib/cloudStore'

const LS_CAJAS = 'dionsys_cajas'

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
      // Dedup por Nro. de Caja: re-importar la misma caja la reemplaza.
      const rest = prev.filter(c => c.nroCaja !== caja.nroCaja)
      // Orden por nroCaja desc (el aperturaAt de las cajas por IA puede venir vacío/mal).
      const updated = [caja, ...rest].sort((a, b) => b.nroCaja - a.nroCaja)
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
    // La anterior por NÚMERO (mismo criterio que parteAnteriorDe): el nroCaja del
    // PMS es secuencial y confiable; el aperturaAt de las cajas leídas por IA puede
    // venir vacío o mal, y ordenar por fecha dejaba esas cajas sin anterior → sin
    // detección de huecos ni descuadres de continuidad.
    return cajas
      .filter(c => c.id !== caja.id && c.nroCaja < caja.nroCaja)
      .sort((a, b) => b.nroCaja - a.nroCaja)[0]
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
