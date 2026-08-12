import { useEffect, useState } from 'react'
import { fetchTarifarioPublicadoCached, type TarifarioPublico } from './landing'

// El tarifario publicado de la landing, para las pantallas de control que lo
// cruzan contra los cobros de caja. null mientras carga o si la nube no está.
export function useTarifarioPublico(): TarifarioPublico | null {
  const [tarifario, setTarifario] = useState<TarifarioPublico | null>(null)
  useEffect(() => {
    let activo = true
    void fetchTarifarioPublicadoCached().then(t => { if (activo && t) setTarifario(t) })
    return () => { activo = false }
  }, [])
  return tarifario
}
