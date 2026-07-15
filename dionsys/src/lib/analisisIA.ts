// Cliente de /api/analyze-month: manda el resumen numérico del mes (armado por
// analisisMes.ts) y recibe el análisis en lenguaje natural escrito por Gemini.
//
// IMPORTANTE: el endpoint solo existe en el sitio publicado en Vercel (o con
// `vercel dev`). Con `npm run dev` normal no está disponible.

import type { AnalisisMesData } from './analisisMes'

export async function analizarMesIA(resumen: AnalisisMesData): Promise<string> {
  let res: Response
  try {
    res = await fetch('/api/analyze-month', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resumen }),
    })
  } catch {
    throw new Error('No se pudo conectar con el analista IA. ¿Estás en el sitio publicado?')
  }
  if (!res.ok) {
    let msg = 'No se pudo generar el análisis.'
    try {
      const j = await res.json()
      if (j?.error) msg = j.error
    } catch { /* ignore */ }
    throw new Error(msg)
  }
  const j = await res.json()
  if (!j?.analisis) throw new Error('La IA no devolvió el análisis. Probá de nuevo.')
  return j.analisis as string
}

// Cache local del último análisis generado por mes (no se sincroniza: es barato
// regenerarlo y evita pisadas entre dispositivos).
const LS_CACHE = 'dionsys_analisis_ia_cache'

interface CacheEntry { mes: string; texto: string; generadoAt: string }

export function getAnalisisCacheado(mes: string): CacheEntry | null {
  try {
    const raw = localStorage.getItem(LS_CACHE)
    if (!raw) return null
    const list: CacheEntry[] = JSON.parse(raw)
    return list.find(e => e.mes === mes) ?? null
  } catch {
    return null
  }
}

export function cachearAnalisis(mes: string, texto: string): void {
  try {
    const raw = localStorage.getItem(LS_CACHE)
    const list: CacheEntry[] = raw ? JSON.parse(raw) : []
    const next = [...list.filter(e => e.mes !== mes), { mes, texto, generadoAt: new Date().toISOString() }].slice(-12)
    localStorage.setItem(LS_CACHE, JSON.stringify(next))
  } catch { /* sin espacio: no pasa nada, se regenera */ }
}
