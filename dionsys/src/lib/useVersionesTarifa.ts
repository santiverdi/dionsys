import { useEffect, useState } from 'react'
import { cargarVersionesAjustes, type VersionAjustes } from './historialTarifas'

// Las versiones de los precios por día (historial de tarifas), para controlar
// cada cobro contra lo que DionSys tenía marcado cuando se cobró. null mientras
// carga o si no hay nube/historial (el control usa los precios de hoy).
export function useVersionesTarifa(): VersionAjustes[] | null {
  const [versiones, setVersiones] = useState<VersionAjustes[] | null>(null)
  useEffect(() => {
    let activo = true
    void cargarVersionesAjustes().then(v => { if (activo && v) setVersiones(v) })
    return () => { activo = false }
  }, [])
  return versiones
}
