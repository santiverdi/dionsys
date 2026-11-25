import { useCallback, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

// Avisos de las protecciones de tarifas (src/lib/proteccionesTarifa.ts) antes
// de guardar: el dueño lee qué se detectó y elige revisar o guardar igual.
//
//   const { confirmar, dialogo } = useAvisosAlGuardar()
//   if (!(await confirmar(avisos))) return   // sin avisos resuelve true enseguida
//   …guardar…
//   return <>{…}{dialogo}</>

export function useAvisosAlGuardar(): { confirmar: (avisos: string[]) => Promise<boolean>; dialogo: ReactNode } {
  const [avisos, setAvisos] = useState<string[] | null>(null)
  const resolver = useRef<((ok: boolean) => void) | null>(null)

  const confirmar = useCallback((lista: string[]) => {
    if (!lista.length) return Promise.resolve(true)
    resolver.current?.(false)
    setAvisos(lista)
    return new Promise<boolean>(res => { resolver.current = res })
  }, [])

  const cerrar = (ok: boolean) => {
    resolver.current?.(ok)
    resolver.current = null
    setAvisos(null)
  }

  const dialogo = avisos && (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => cerrar(false)}>
      <div
        className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
        role="alertdialog"
        aria-labelledby="avisos-titulo"
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} className="text-amber-700" />
          </span>
          <h3 id="avisos-titulo" className="font-bold text-navy-800">Revisá antes de guardar</h3>
        </div>
        <ul className="space-y-2 mb-5">
          {avisos.map((a, i) => (
            <li key={i} className="text-sm text-navy-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{a}</li>
          ))}
        </ul>
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button onClick={() => cerrar(false)} className="px-4 py-2 rounded-lg border border-navy-200 text-navy-700 text-sm font-medium">
            Volver y revisar
          </button>
          <button onClick={() => cerrar(true)} className="px-4 py-2 rounded-lg bg-amber-600 text-white text-sm font-medium">
            Guardar igual
          </button>
        </div>
      </div>
    </div>
  )

  return { confirmar, dialogo }
}
