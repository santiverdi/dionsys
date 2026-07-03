import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { persist, useCloudSync } from '../lib/cloudStore'
import { TARIFAS_PACTADAS, type TarifaPeriodo } from '../lib/tarifas'

const LS_TARIFAS = 'dionsys_tarifas'

interface TarifasContextType {
  tarifas: TarifaPeriodo[]
  saveTarifas: (tarifas: TarifaPeriodo[]) => void
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

  const saveTarifas = useCallback((t: TarifaPeriodo[]) => {
    setTarifas(t)
    persist(LS_TARIFAS, t)
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
