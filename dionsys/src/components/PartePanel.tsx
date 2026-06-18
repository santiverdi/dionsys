import { useState, useRef } from 'react'
import {
  Upload, AlertTriangle, CheckCircle2, Trash2, BedDouble, Save, X, Sparkles, Wrench,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { usePartes } from '../context/ParteContext'
import { useCajas } from '../context/CajaContext'
import { parsePartePdf } from '../lib/parsePartePdf'
import { getParteFlags, getParteResumen, type ParteFlag } from '../lib/parteControl'
import type { ParteHabitaciones, HabitacionOcupada, EstadoHabitacion } from '../types'

const SIN_CANAL = 'Sin canal'

function FlagPill({ flag }: { flag: ParteFlag }) {
  const color = flag.level === 'error'
    ? 'bg-red-50 border-red-200 text-red-700'
    : flag.level === 'warn'
      ? 'bg-amber-50 border-amber-200 text-amber-700'
      : 'bg-navy-50 border-navy-200 text-navy-600'
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-2.5 text-xs ${color}`}>
      <AlertTriangle size={14} className="shrink-0 mt-0.5" />
      <span>{flag.mensaje}</span>
    </div>
  )
}

const ESTADO_STYLE: Record<EstadoHabitacion, { label: string; cls: string; Icon: typeof Sparkles }> = {
  limpia: { label: 'Limpia', cls: 'bg-green-50 text-green-700 border-green-200', Icon: Sparkles },
  sucia: { label: 'Sucia', cls: 'bg-amber-50 text-amber-700 border-amber-200', Icon: BedDouble },
  mantenimiento: { label: 'Mantenimiento', cls: 'bg-red-50 text-red-700 border-red-200', Icon: Wrench },
}

export default function PartePanel({ nroCaja }: { nroCaja: number }) {
  const { employee } = useAuth()
  const { addParte, deleteParte, getParteByCaja, getParteAnterior } = usePartes()
  const { cajas } = useCajas()
  const [preview, setPreview] = useState<ParteHabitaciones | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const parte = getParteByCaja(nroCaja)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setError('')
    setPreview(null)
    try {
      const p = await parsePartePdf(file, employee?.name ?? '')
      if (p.nroCaja !== nroCaja) {
        setError(`El parte importado es de la Caja ${p.nroCaja}, no de la Caja ${nroCaja}.`)
      } else {
        setPreview(p)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el PDF del parte.')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function confirmImport() {
    if (!preview) return
    addParte(preview)
    setPreview(null)
  }

  // ===== Importador (cuando todavía no hay parte para esta caja) =====
  if (!parte) {
    return (
      <div className="bg-white rounded-xl border border-navy-100 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-navy-500 mb-2">Parte de habitaciones</p>
        <label className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
          importing ? 'border-gold-400 bg-gold-50 text-navy-600' : 'border-indigo-300 text-indigo-600 hover:bg-indigo-50'
        }`}>
          <Upload size={18} className={importing ? 'animate-pulse' : ''} />
          <span className="text-sm font-semibold">{importing ? 'Leyendo PDF…' : 'Importar parte (PDF)'}</span>
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={handleFile} disabled={importing} className="hidden" />
        </label>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

        {preview && (
          <div className="mt-3 rounded-xl border-2 border-gold-300 p-3">
            <div className="flex items-start justify-between mb-2">
              <p className="font-bold text-navy-800 text-sm">Parte Caja {preview.nroCaja}</p>
              <button onClick={() => setPreview(null)} className="p-1 rounded-lg hover:bg-navy-100"><X size={16} /></button>
            </div>
            <p className="text-xs text-navy-500 mb-3">
              {preview.totalOcupadas} ocupadas · {preview.totalPlazas} plazas · {preview.totalLibres} libres
            </p>
            <button onClick={confirmImport} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-navy-800 text-cream font-bold text-sm hover:bg-navy-700 transition-colors">
              <Save size={16} /> Guardar parte
            </button>
          </div>
        )}
      </div>
    )
  }

  // ===== Parte ya importado =====
  const resumen = getParteResumen(parte)
  const flags = getParteFlags(parte, getParteAnterior(parte), cajas)

  // Ocupadas agrupadas por canal de reserva.
  const porCanal = parte.ocupadas.reduce<Record<string, HabitacionOcupada[]>>((acc, h) => {
    const k = h.canal || SIN_CANAL
    ;(acc[k] ??= []).push(h)
    return acc
  }, {})

  return (
    <div className="bg-white rounded-xl border border-navy-100 p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-bold uppercase tracking-wide text-navy-500">Parte de habitaciones</p>
        {employee?.role === 'admin' && (
          <button
            onClick={() => deleteParte(parte.id)}
            className="p-1.5 rounded-lg text-navy-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            title="Borrar este parte importado"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {/* Resumen de ocupación */}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
        <div className="bg-navy-50 rounded-lg p-2.5">
          <p className="text-[10px] text-navy-500 uppercase">Ocupación</p>
          <p className="text-sm font-bold text-navy-800">{resumen.ocupacionPct}%</p>
        </div>
        <div className="bg-navy-50 rounded-lg p-2.5">
          <p className="text-[10px] text-navy-500 uppercase">Ocupadas</p>
          <p className="text-sm font-bold text-navy-800">{resumen.ocupadas}</p>
          <p className="text-[10px] text-navy-400">{resumen.plazas} plazas</p>
        </div>
        <div className="bg-navy-50 rounded-lg p-2.5">
          <p className="text-[10px] text-navy-500 uppercase">Libres</p>
          <p className="text-sm font-bold text-navy-800">{resumen.libres}</p>
        </div>
        <div className="bg-navy-50 rounded-lg p-2.5 col-span-3 sm:col-span-1">
          <p className="text-[10px] text-navy-500 uppercase">Limpieza</p>
          <p className="text-xs font-semibold text-navy-700">
            {resumen.limpias} limpias · {resumen.sucias} sucias · {resumen.mantenimiento} mant.
          </p>
        </div>
      </div>

      {/* Flags */}
      {flags.length > 0 ? (
        <div className="space-y-1.5 mb-3">
          {flags.map((f, i) => <FlagPill key={i} flag={f} />)}
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-2.5 text-xs text-green-700 mb-3">
          <CheckCircle2 size={14} /> Sin imperfecciones detectadas.
        </div>
      )}

      {/* Ocupadas por canal */}
      <p className="text-[11px] font-bold uppercase tracking-wide text-navy-400 mb-1.5">Ocupadas por canal</p>
      <div className="space-y-2 mb-3">
        {Object.entries(porCanal).map(([canal, habs]) => (
          <div key={canal}>
            <p className="text-xs font-semibold text-navy-600 mb-0.5">{canal} <span className="text-navy-400 font-normal">({habs.length})</span></p>
            <div className="flex flex-wrap gap-1">
              {habs.map((h, i) => (
                <span key={i} className="text-[11px] bg-navy-50 text-navy-700 rounded px-1.5 py-0.5" title={`Reserva ${h.reserva} · ${h.plazas} plaza(s)`}>
                  {h.habitacion}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Libres por estado */}
      {parte.libres.length > 0 && (
        <>
          <p className="text-[11px] font-bold uppercase tracking-wide text-navy-400 mb-1.5">Libres</p>
          <div className="flex flex-wrap gap-1">
            {parte.libres.map((l, i) => {
              const st = ESTADO_STYLE[l.estado]
              return (
                <span key={i} className={`text-[11px] rounded px-1.5 py-0.5 border ${st.cls}`} title={st.label}>
                  {l.habitacion}
                </span>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
