import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import { persist, useCloudSync } from '../lib/cloudStore'
import type { PrismaResumenMes } from '../lib/prismaTarjetas'

const LS_PRISMA = 'dionsys_prisma_tarjetas'

interface PrismaContextType {
  resumenes: PrismaResumenMes[]
  setResumenMes: (mes: string, total: number | null, by: string) => void
}

const PrismaContext = createContext<PrismaContextType | null>(null)

// Totales mensuales del resumen de tarjetas de Prisma, cargados a mano por el
// admin y sincronizados entre dispositivos. La conciliación los cruza contra
// lo cobrado por tarjeta en las cajas del sistema.
export function PrismaProvider({ children }: { children: ReactNode }) {
  const [resumenes, setResumenes] = useState<PrismaResumenMes[]>(() => {
    const saved = localStorage.getItem(LS_PRISMA)
    return saved ? JSON.parse(saved) : []
  })

  useCloudSync<PrismaResumenMes[]>(LS_PRISMA, setResumenes)

  // total null = borrar el mes (volver a "sin cargar").
  const setResumenMes = useCallback((mes: string, total: number | null, by: string) => {
    setResumenes(prev => {
      const next = total == null
        ? prev.filter(r => r.mes !== mes)
        : [...prev.filter(r => r.mes !== mes), { mes, total, cargadoBy: by, cargadoAt: new Date().toISOString() }]
            .sort((a, b) => a.mes.localeCompare(b.mes))
      persist(LS_PRISMA, next)
      return next
    })
  }, [])

  return (
    <PrismaContext.Provider value={{ resumenes, setResumenMes }}>
      {children}
    </PrismaContext.Provider>
  )
}

export function usePrisma() {
  const ctx = useContext(PrismaContext)
  if (!ctx) throw new Error('usePrisma must be used within PrismaProvider')
  return ctx
}
