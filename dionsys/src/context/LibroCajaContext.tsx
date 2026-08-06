// Libro de caja de Administración: los meses importados del Excel de Charo.
// Ver src/lib/parseLibroCaja.ts para la forma de la planilla.
//
// DATO SENSIBLE: el libro trae los sueldos con nombre y apellido de cada
// empleado, igual que la nómina. Por eso su almacén es ADMIN_ONLY (ver
// ADMIN_ONLY_KEYS en cloudStore): sin un admin logueado no se baja, no se sube
// y se borra de este dispositivo.

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react'
import type { LibroCajaMes } from '../types'
import { persist, useCloudSync, setAdminAccess, pullAdminOnlyKeys, purgeAdminOnlyKeys } from '../lib/cloudStore'
import { useAuth } from './AuthContext'

const KEY = 'dionsys_libro_caja'

interface LibroCajaContextType {
  meses: LibroCajaMes[]                       // del más nuevo al más viejo
  importarMes: (mes: LibroCajaMes) => void    // reemplaza el mes si ya estaba
  borrarMes: (mes: string) => void
}

function load(): LibroCajaMes[] {
  const saved = localStorage.getItem(KEY)
  if (!saved) return []
  try {
    const v = JSON.parse(saved)
    return Array.isArray(v) ? v : []
  } catch {
    return []
  }
}

const ordenar = (l: LibroCajaMes[]) => [...l].sort((a, b) => b.mes.localeCompare(a.mes))

const LibroCajaContext = createContext<LibroCajaContextType | null>(null)

export function LibroCajaProvider({ children }: { children: ReactNode }) {
  const { employee } = useAuth()
  const isAdmin = employee?.role === 'admin'
  const [meses, setMeses] = useState<LibroCajaMes[]>(load)

  useCloudSync<LibroCajaMes[]>(KEY, v => setMeses(ordenar(Array.isArray(v) ? v : [])))

  // Mismo camino que la nómina: con un admin logueado se habilita el almacén y
  // se baja de la nube; sin admin se limpia lo que haya quedado en el equipo.
  useEffect(() => {
    let active = true
    if (isAdmin) {
      setAdminAccess(true)
      void pullAdminOnlyKeys().then(() => {
        if (active) setMeses(ordenar(load()))
      })
    } else {
      setAdminAccess(false)
      purgeAdminOnlyKeys()
      setMeses([])
    }
    return () => { active = false }
  }, [isAdmin])

  // Importar el mismo mes de nuevo lo REEMPLAZA: la planilla se corrige durante
  // el mes y la última versión es la buena.
  const importarMes = useCallback((nuevo: LibroCajaMes) => {
    setMeses(prev => {
      const next = ordenar([...prev.filter(m => m.mes !== nuevo.mes), nuevo])
      persist(KEY, next)
      return next
    })
  }, [])

  const borrarMes = useCallback((mes: string) => {
    setMeses(prev => {
      const next = prev.filter(m => m.mes !== mes)
      persist(KEY, next)
      return next
    })
  }, [])

  return (
    <LibroCajaContext.Provider value={{ meses, importarMes, borrarMes }}>
      {children}
    </LibroCajaContext.Provider>
  )
}

export function useLibroCaja() {
  const ctx = useContext(LibroCajaContext)
  if (!ctx) throw new Error('useLibroCaja must be used within LibroCajaProvider')
  return ctx
}
