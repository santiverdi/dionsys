import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Eye } from 'lucide-react'
import { dm, type EjemploVistaPrevia } from '../../lib/promosPantalla'

// Vista previa antes de guardar un cambio de promos o de efectivo: 5
// cotizaciones de ejemplo con el mensaje completo al huésped, antes y después.
//
//   const { mostrar, dialogo } = useVistaPrevia()
//   if (!(await mostrar(filas))) return   // sin ejemplos resuelve true enseguida

export interface FilaVistaPrevia {
  ejemplo: EjemploVistaPrevia
  antes: string
  despues: string
}

export function useVistaPrevia(): { mostrar: (filas: FilaVistaPrevia[], titulo: string) => Promise<boolean>; dialogo: ReactNode } {
  const [estado, setEstado] = useState<{ filas: FilaVistaPrevia[]; titulo: string } | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const mostrar = useCallback((filas: FilaVistaPrevia[], titulo: string) => {
    resolver.current?.(false)
    setEstado({ filas, titulo })
    return new Promise<boolean>(res => { resolver.current = res })
  }, [])

  const cerrar = (ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setEstado(null)
  }

  const cambian = estado ? estado.filas.filter(f => f.antes !== f.despues).length : 0

  const dialogo = estado && (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => cerrar(false)}>
      <div
        className="bg-white w-full sm:max-w-4xl rounded-t-2xl sm:rounded-2xl p-5 max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-labelledby="vista-previa-titulo"
      >
        <div className="flex items-center gap-2 mb-1">
          <Eye size={18} className="text-navy-600" />
          <h3 id="vista-previa-titulo" className="font-bold text-navy-800">Vista previa: {estado.titulo}</h3>
        </div>
        <p className="text-sm text-navy-500 mb-4">
          {estado.filas.length
            ? `${cambian} de ${estado.filas.length} cotizaciones de ejemplo cambian con este guardado.`
            : 'No hay fechas cotizables para mostrar un ejemplo (¿el rango ya pasó o no tiene precios?).'}
        </p>
        <div className="space-y-4 mb-5">
          {estado.filas.map((f, i) => {
            const igual = f.antes === f.despues
            return (
              <div key={i} className="border border-navy-100 rounded-xl p-3">
                <p className="text-sm font-semibold text-navy-800">
                  {f.ejemplo.titulo}
                  <span className="font-normal text-navy-500"> · {dm(f.ejemplo.llegada)} al {dm(f.ejemplo.salida)}, cotizado el {dm(f.ejemplo.hoy)}</span>
                  {igual && <span className="ml-2 text-xs font-medium text-navy-400">sin cambios</span>}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                  <div>
                    <p className="text-xs font-medium text-navy-400 mb-1">Antes</p>
                    <pre className="whitespace-pre-wrap font-sans text-xs text-navy-700 bg-navy-50/60 rounded-lg p-2">{f.antes}</pre>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-navy-400 mb-1">Después</p>
                    <pre className={`whitespace-pre-wrap font-sans text-xs rounded-lg p-2 ${igual ? 'text-navy-700 bg-navy-50/60' : 'text-navy-800 bg-amber-50 border border-amber-200'}`}>{f.despues}</pre>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button onClick={() => cerrar(false)} className="px-4 py-2 rounded-lg border border-navy-200 text-navy-700 text-sm font-medium">
            Volver
          </button>
          <button onClick={() => cerrar(true)} className="px-4 py-2 rounded-lg bg-navy-800 text-cream text-sm font-medium">
            Guardar
          </button>
        </div>
      </div>
    </div>
  )

  return { mostrar, dialogo }
}
