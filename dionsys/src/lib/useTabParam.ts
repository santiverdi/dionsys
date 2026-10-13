import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

// La pestaña elegida vive en la URL (?tab=...): sobrevive a recargar la página,
// a ir y volver de otra pantalla, y se puede mandar el link. La pestaña por
// defecto no se escribe para que la URL quede limpia.
export function useTabParam<T extends string>(ids: readonly T[], fallback: T, param = 'tab'): [T, (id: T) => void] {
  const [params, setParams] = useSearchParams()
  const raw = params.get(param)
  const value = raw && (ids as readonly string[]).includes(raw) ? raw as T : fallback
  const setValue = useCallback((id: T) => {
    setParams(prev => {
      const next = new URLSearchParams(prev)
      if (id === fallback) next.delete(param)
      else next.set(param, id)
      return next
    }, { replace: true })
  }, [setParams, param, fallback])
  return [value, setValue]
}
