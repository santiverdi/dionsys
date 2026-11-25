import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { useCloudSync } from '../lib/cloudStore'
import { guardarTarifa } from '../lib/permisosTarifa'
import { TARIFAS_PACTADAS, type TarifaPeriodo } from '../lib/tarifas'
import type { Employee } from '../types'

const LS_TARIFAS = 'dionsys_tarifas'

interface TarifasContextType {
  tarifas: TarifaPeriodo[]
  /** Solo el dueño (lo verifica la base). Devuelve el error a mostrar, o null si se guardó. */
  saveTarifas: (tarifas: TarifaPeriodo[], employee: Employee | null) => Promise<string | null>
}

const TarifasContext = createContext<TarifasContextType | null>(null)

// Tarifas pactadas como DATO del sistema (editables por el admin, sincronizadas
// entre dispositivos). Arranca con la semilla de src/lib/tarifas.ts; después la
// fuente de verdad es lo guardado acá.
export function TarifasProvider({ children }: { children: ReactNode }) {
  const [tarifas, setTarifas] = useState<TarifaPeriodo[]>(() => {
    const saved = localStorage.getItem(LS_TARIFAS)
    return saved ? JSON.parse(saved) : TARIFAS_PACTADAS
  })

  useCloudSync<TarifaPeriodo[]>(LS_TARIFAS, setTarifas)

  const saveTarifas = useCallback(async (t: TarifaPeriodo[], employee: Employee | null) => {
    const r = await guardarTarifa(employee, LS_TARIFAS, t, { motivo: 'Tarifas pactadas (control de caja)' })
    if (!r.error) setTarifas(t)
    return r.error
  }, [])

  return (
    <TarifasContext.Provider value={{ tarifas, saveTarifas }}>
      {children}
    </TarifasContext.Provider>
  )
}

export function useTarifas() {
  const ctx = useContext(TarifasContext)
  if (!ctx) throw new Error('useTarifas must be used within TarifasProvider')
  return ctx
}
