// Qué pagos del libro de Charo van al Dashboard.
//
// LA REGLA: nada suma hasta que el usuario lo marca, uno por uno. Se probó
// decidirlo solo (por concepto, y después apareando contra lo ya cargado) y las
// dos veces salió mal: un concepto junta cosas distintas, y cuando el apareo no
// encuentra el pago del otro lado lo suma igual — así se colaron 28 millones de
// sueldos e impuestos que ya estaban contados en sus pantallas.
//
// El apareo sigue existiendo, pero SOLO como dato en pantalla ("esto ya está
// cargado en Sueldos"): ayuda a decidir, no decide.
//
// La marca se guarda con una clave armada del contenido de la fila (fecha,
// concepto, medio, monto y el detalle que escribe Charo). Charo manda la misma
// planilla todos los días con las filas nuevas: al reimportarla, las filas
// viejas generan la misma clave y las marcas se mantienen. Si corrige una fila,
// esa marca se pierde y vuelve a quedar sin marcar, que es lo correcto: cambió.

import { useState, useCallback } from 'react'
import type { LibroCajaMes, LibroCajaMovimiento } from '../types'
import { persist, useCloudSync } from './cloudStore'

const KEY = 'dionsys_libro_caja_items'

/** Clave estable de una fila del libro, para acordarse de lo marcado. */
export function claveMovimiento(m: LibroCajaMovimiento): string {
  return [m.fecha, m.conceptoCod, m.medioCod, m.monto, m.detalle].join('|')
}

/**
 * Lo que el libro suma a los egresos de cada mes: solo los pagos marcados.
 * Sin marcas devuelve un mapa vacío y el Dashboard queda como estaba.
 */
export function salidasMarcadasPorMes(
  meses: LibroCajaMes[],
  marcas: Record<string, boolean>,
): Map<string, number> {
  const out = new Map<string, number>()
  for (const mes of meses) {
    for (const mov of mes.movimientos) {
      if (mov.monto >= 0) continue
      if (marcas[claveMovimiento(mov)] !== true) continue
      // Manda la fecha del movimiento: una fila con fecha de otro mes suma allá.
      const k = mov.fecha.slice(0, 7)
      out.set(k, (out.get(k) ?? 0) + -mov.monto)
    }
  }
  for (const [k, v] of out) out.set(k, Math.round(v * 100) / 100)
  return out
}

function load(): Record<string, boolean> {
  const saved = localStorage.getItem(KEY)
  if (!saved) return {}
  try {
    const v = JSON.parse(saved)
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {}
  } catch {
    return {}
  }
}

export function useMarcasLibroCaja() {
  const [marcas, setMarcas] = useState<Record<string, boolean>>(load)

  useCloudSync<Record<string, boolean>>(KEY, v => setMarcas(v && typeof v === 'object' ? v : {}))

  /** Prende o apaga un pago. Apagarlo lo saca del guardado, no deja basura. */
  const marcar = useCallback((clave: string, va: boolean) => {
    setMarcas(prev => {
      const next = { ...prev }
      if (va) next[clave] = true
      else delete next[clave]
      persist(KEY, next)
      return next
    })
  }, [])

  return { marcas, marcar }
}
