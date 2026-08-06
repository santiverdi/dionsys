// Proveedores de desayuno que el usuario marca a mano desde el panel de Desayuno.
//
// POR QUÉ EXISTE: el egreso de caja es texto libre, así que el desayuno se
// reconoce por el nombre del proveedor. La lista fija (CAJA_DESAYUNO_FIJOS) solo
// tiene los dos de siempre — Piazza y El Amanecer — a propósito, para no meter
// limpieza o mantenimiento adentro del desayuno. Cuando aparece otro proveedor,
// antes había que tocar código; ahora se marca desde la app y queda guardado
// acá, compartido entre dispositivos como cualquier otro almacén.
//
// Se guarda el TÉRMINO (una palabra del egreso, ej: "piazza"), no el egreso
// entero: así el mismo proveedor cuenta también los meses que vienen.

import { useState, useCallback } from 'react'
import { persist, useCloudSync } from './cloudStore'
import { normalizarTexto } from './desayunoCosto'

const KEY = 'dionsys_desayuno_proveedores'

function load(): string[] {
  const saved = localStorage.getItem(KEY)
  if (!saved) return []
  try {
    const v = JSON.parse(saved)
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function useProveedoresDesayuno() {
  const [proveedores, setProveedores] = useState<string[]>(load)

  useCloudSync<string[]>(KEY, setProveedores)

  // Términos de menos de 3 letras no se aceptan: matchean cualquier cosa y
  // ensuciarían el desayuno con gastos que no son.
  const agregar = useCallback((termino: string) => {
    const t = normalizarTexto(termino)
    if (t.length < 3) return
    setProveedores(prev => {
      if (prev.some(p => normalizarTexto(p) === t)) return prev
      const next = [...prev, t]
      persist(KEY, next)
      return next
    })
  }, [])

  const quitar = useCallback((termino: string) => {
    const t = normalizarTexto(termino)
    setProveedores(prev => {
      const next = prev.filter(p => normalizarTexto(p) !== t)
      persist(KEY, next)
      return next
    })
  }, [])

  return { proveedores, agregar, quitar }
}
