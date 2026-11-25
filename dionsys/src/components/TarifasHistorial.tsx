import { useCallback, useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, History, RefreshCw, RotateCcw, Undo2 } from 'lucide-react'
import {
  NOMBRE_CLAVE, cargarHistorial, diferenciasPorDia, esRevertible, resumenFechas, revertirCambio, textoDiferencia,
  versionDe, type EntradaHistorial,
} from '../lib/historialTarifas'
import { guardarTarifa } from '../lib/permisosTarifa'
import type { SyncedKey } from '../lib/cloudStore'
import type { Employee } from '../types'
import ConfirmDialog from './ConfirmDialog'

// Historial de cambios de tarifas (solo el dueño, en Recepción → Tarifas con
// "Modificar precios"). Cada entrada se puede deshacer sola o usar para volver
// a la versión completa de ese momento; las dos quedan como un cambio nuevo.

const fecha = (s: string) => new Date(s).toLocaleString('es-AR', {
  day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  timeZone: 'America/Argentina/Buenos_Aires',
})

function leerLocal(clave: string): unknown {
  try { return JSON.parse(localStorage.getItem(clave) ?? 'null') } catch { return null }
}

interface Pedido { entrada: EntradaHistorial; modo: 'cambio' | 'version'; valor: unknown; mensaje: string }

export default function TarifasHistorial({ employee }: { employee: Employee | null }) {
  const [entradas, setEntradas] = useState<EntradaHistorial[]>([])
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [abierta, setAbierta] = useState<number | null>(null)
  const [pedido, setPedido] = useState<Pedido | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; msg: string } | null>(null)
  const [vuelta, setVuelta] = useState(0)

  useEffect(() => {
    let activo = true
    void cargarHistorial().then(r => {
      if (!activo) return
      setEntradas(r.entradas)
      setError(r.error)
      setCargando(false)
    })
    return () => { activo = false }
  }, [vuelta])

  const recargar = useCallback(() => {
    setCargando(true)
    setVuelta(v => v + 1)
  }, [])

  function pedirRevertir(e: EntradaHistorial) {
    const r = revertirCambio(leerLocal(e.clave), e)
    if (!r) {
      setAviso({ tipo: 'error', msg: `El cambio #${e.id} fue el primero: no hay una versión anterior a la que volver.` })
      return
    }
    const pisa = r.pisa.length ? ` Ojo: ${r.pisa.length === 1 && r.pisa[0].startsWith('(') ? 'esto' : resumenFechas(r.pisa)} se volvió a cambiar después, y lo vas a pisar.` : ''
    setPedido({ entrada: e, modo: 'cambio', valor: r.valor, mensaje: `Se deshace solo el cambio #${e.id}.${pisa}` })
  }

  function pedirVersion(e: EntradaHistorial) {
    setPedido({
      entrada: e, modo: 'version', valor: versionDe(e),
      mensaje: `${NOMBRE_CLAVE[e.clave] ?? e.clave} queda entero como estaba después del cambio #${e.id}. Se pierden los cambios posteriores (siguen en el historial).`,
    })
  }

  async function confirmar() {
    if (!pedido) return
    const { entrada: e, modo, valor } = pedido
    setPedido(null)
    const r = await guardarTarifa(employee, e.clave as SyncedKey, valor, {
      motivo: modo === 'cambio' ? `Revierte el cambio #${e.id}` : `Vuelve a la versión del cambio #${e.id}`,
      revierteId: e.id,
    })
    setAviso(r.error ? { tipo: 'error', msg: r.error } : { tipo: 'ok', msg: r.historialId ? `Listo (cambio #${r.historialId}).` : 'Ya estaba así: no hubo nada que cambiar.' })
    recargar()
  }

  return (
    <section className="bg-white rounded-xl border border-navy-100 p-4 mt-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-2 font-semibold text-navy-800"><History size={17} /> Historial de cambios</h3>
        <button onClick={recargar} className="flex items-center gap-1 text-xs text-navy-500 hover:text-navy-800">
          <RefreshCw size={13} className={cargando ? 'animate-spin' : ''} /> Actualizar
        </button>
      </div>
      {aviso && <p className={`text-sm mb-2 ${aviso.tipo === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>{aviso.msg}</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {!error && !entradas.length && !cargando && <p className="text-sm text-navy-400">Todavía no hay cambios registrados.</p>}

      <ul className="divide-y divide-navy-100">
        {entradas.map(e => {
          const dias = e.clave === 'dionsys_tarifas_dia' ? diferenciasPorDia(e.valor_anterior, e.valor_nuevo) : []
          const abiertaEsta = abierta === e.id
          return (
            <li key={e.id} className="py-2.5">
              <button className="w-full text-left flex items-start justify-between gap-2" onClick={() => setAbierta(abiertaEsta ? null : e.id)}>
                <span>
                  <span className="text-sm font-medium text-navy-800">#{e.id} · {NOMBRE_CLAVE[e.clave] ?? e.clave}</span>
                  <span className="block text-xs text-navy-500">
                    {fecha(e.creado_en)} · {e.autor_nombre}
                    {dias.length > 0 && ` · ${resumenFechas(dias.map(d => d.fecha))}`}
                    {e.motivo && ` · ${e.motivo}`}
                  </span>
                </span>
                {abiertaEsta ? <ChevronUp size={16} className="text-navy-400 shrink-0" /> : <ChevronDown size={16} className="text-navy-400 shrink-0" />}
              </button>
              {abiertaEsta && (
                <div className="mt-2 pl-1">
                  {dias.length > 0 ? (
                    <ul className="text-xs text-navy-600 space-y-0.5 max-h-48 overflow-y-auto">
                      {dias.map(d => <li key={d.fecha}>{textoDiferencia(d)}</li>)}
                    </ul>
                  ) : (
                    <div className="grid sm:grid-cols-2 gap-2 text-[11px]">
                      <pre className="bg-navy-50 rounded p-2 overflow-x-auto whitespace-pre-wrap">Antes: {JSON.stringify(e.valor_anterior, null, 1)}</pre>
                      <pre className="bg-navy-50 rounded p-2 overflow-x-auto whitespace-pre-wrap">Después: {JSON.stringify(e.valor_nuevo, null, 1)}</pre>
                    </div>
                  )}
                  {esRevertible(e.clave) ? (
                    <div className="flex flex-wrap gap-2 mt-2">
                      <button onClick={() => pedirRevertir(e)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-navy-200 text-xs font-medium text-navy-700 hover:bg-navy-50">
                        <Undo2 size={13} /> Revertir este cambio
                      </button>
                      <button onClick={() => pedirVersion(e)} className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-navy-200 text-xs font-medium text-navy-700 hover:bg-navy-50">
                        <RotateCcw size={13} /> Volver a esta versión
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-navy-400 mt-2">El tarifario público se vuelve atrás republicándolo desde Web → Tarifario público.</p>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>

      <ConfirmDialog
        open={!!pedido}
        title={pedido?.modo === 'cambio' ? '¿Revertir este cambio?' : '¿Volver a esta versión?'}
        message={pedido?.mensaje ?? ''}
        confirmLabel={pedido?.modo === 'cambio' ? 'Revertir' : 'Volver a esta versión'}
        variant="info"
        onConfirm={() => void confirmar()}
        onCancel={() => setPedido(null)}
      />
    </section>
  )
}
