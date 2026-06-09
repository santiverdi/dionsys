import { useState, useCallback, useEffect } from 'react'
import { CloudUpload, CloudDownload, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { cloudEnabled } from '../lib/supabase'
import { fetchStoreMeta, pushNow, pullNow, type StoreMeta, type SyncedKey } from '../lib/cloudStore'

// Nombres amigables por almacén.
const LABELS: Record<SyncedKey, string> = {
  dionsys_orders: 'Pedidos a distribuidores',
  dionsys_deposito: 'Stock del depósito',
  dionsys_stock_movements: 'Movimientos de stock',
  dionsys_pedidos_semanales: 'Pedidos semanales',
  dionsys_deposito_suppliers: 'Distribuidoras',
  dionsys_turnos: 'Turnos (conserjes)',
  dionsys_impuestos_servicios: 'Impuestos — servicios',
  dionsys_impuestos_pagos: 'Impuestos — pagos',
  dionsys_maintenance_tasks: 'Mantenimiento',
  dionsys_basura: 'Basura',
  dionsys_occupancy: 'Ocupación',
  dionsys_lacteos_consumption: 'Consumo lácteos',
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

export default function SyncPanel() {
  const [meta, setMeta] = useState<StoreMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setMeta(await fetchStoreMeta())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const handlePush = useCallback(async (key: SyncedKey) => {
    if (!confirm(`Subir "${LABELS[key]}" de ESTE dispositivo a la nube.\n\nVa a PISAR lo que haya en la nube para ese almacén. ¿Seguro?`)) return
    setBusyKey(key)
    setMsg(null)
    const { error } = await pushNow(key)
    setBusyKey(null)
    if (error) setMsg({ type: 'err', text: `Error al subir ${LABELS[key]}: ${error}` })
    else { setMsg({ type: 'ok', text: `Subido: ${LABELS[key]}` }); void refresh() }
  }, [refresh])

  const handlePull = useCallback(async (key: SyncedKey) => {
    if (!confirm(`Bajar "${LABELS[key]}" desde la nube a ESTE dispositivo.\n\nVa a PISAR lo que tengas local para ese almacén. ¿Seguro?`)) return
    setBusyKey(key)
    setMsg(null)
    const { error } = await pullNow(key)
    setBusyKey(null)
    if (error) setMsg({ type: 'err', text: `Error al bajar ${LABELS[key]}: ${error}` })
    else { setMsg({ type: 'ok', text: `Bajado: ${LABELS[key]}` }); void refresh() }
  }, [refresh])

  if (!cloudEnabled) {
    return (
      <div className="max-w-2xl mx-auto p-4">
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="text-amber-600 shrink-0" size={20} />
          <div>
            <p className="font-bold text-amber-900">Nube no configurada en este dispositivo</p>
            <p className="text-sm text-amber-700 mt-1">
              Falta el build con las variables de Supabase. Esta pantalla solo sirve con la nube activa.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-4">
      <h2 className="text-xl font-bold text-navy-800 mb-1">Unificar datos</h2>
      <p className="text-sm text-navy-500 mb-4">
        Compará lo de <b>este dispositivo</b> con la <b>nube</b> y subí/bajá cada almacén por separado.
      </p>

      <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4 flex items-start gap-2">
        <AlertTriangle className="text-red-500 shrink-0 mt-0.5" size={16} />
        <p className="text-xs text-red-700">
          <b>Subir</b> pisa la nube con lo de este equipo. <b>Bajar</b> pisa este equipo con lo de la nube.
          Subí cada almacén desde el dispositivo que tenga la versión correcta.
        </p>
      </div>

      <button
        onClick={() => void refresh()}
        disabled={loading}
        className="flex items-center gap-2 mb-4 px-3 py-2 rounded-lg text-sm font-semibold bg-navy-100 text-navy-700 hover:bg-navy-200 disabled:opacity-50"
      >
        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Actualizar
      </button>

      {msg && (
        <div className={`rounded-lg p-3 mb-4 text-sm flex items-center gap-2 ${
          msg.type === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
        }`}>
          {msg.type === 'ok' ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {msg.text}
        </div>
      )}

      <div className="space-y-2">
        {meta.map(m => {
          const localEmpty = m.localCount === null
          const cloudEmpty = m.cloudCount === null
          return (
            <div key={m.key} className="bg-white rounded-xl border border-navy-100 p-3">
              <p className="font-semibold text-navy-800 text-sm mb-2">{LABELS[m.key]}</p>
              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                <div className="bg-navy-50 rounded-lg p-2">
                  <p className="text-[10px] uppercase tracking-wide text-navy-400 font-semibold">Este dispositivo</p>
                  <p className={`font-bold ${localEmpty ? 'text-navy-300' : 'text-navy-800'}`}>
                    {localEmpty ? 'vacío' : `${m.localCount} items`}
                  </p>
                </div>
                <div className="bg-navy-50 rounded-lg p-2">
                  <p className="text-[10px] uppercase tracking-wide text-navy-400 font-semibold">Nube</p>
                  <p className={`font-bold ${cloudEmpty ? 'text-navy-300' : 'text-navy-800'}`}>
                    {cloudEmpty ? 'vacío' : `${m.cloudCount} items`}
                  </p>
                  {m.cloudUpdatedAt && <p className="text-[10px] text-navy-400">{fmtDate(m.cloudUpdatedAt)}</p>}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => void handlePush(m.key)}
                  disabled={busyKey === m.key || localEmpty}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold bg-navy-800 text-cream hover:bg-navy-700 disabled:opacity-40"
                >
                  <CloudUpload size={14} /> Subir
                </button>
                <button
                  onClick={() => void handlePull(m.key)}
                  disabled={busyKey === m.key || cloudEmpty}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold bg-white text-navy-700 border border-navy-200 hover:bg-navy-50 disabled:opacity-40"
                >
                  <CloudDownload size={14} /> Bajar
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
