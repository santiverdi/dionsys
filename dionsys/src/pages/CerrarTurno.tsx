import { useState, useRef, useMemo } from 'react'
import {
  Upload, FileSpreadsheet, Save, X, AlertTriangle, CheckCircle2, Wallet, Clock,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useCajas } from '../context/CajaContext'
import { parseCajaExcel } from '../lib/parseCaja'
import { getCajaFlags, getCajaResumen, type CajaFlag } from '../lib/cajaControl'
import { formatMontoCurrency } from '../utils/validators'
import { TURNO_LABELS } from '../context/OccupancyContext'
import PartePanel from '../components/PartePanel'
import type { CajaParte } from '../types'

function fmtFecha(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function FlagPill({ flag }: { flag: CajaFlag }) {
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

export default function CerrarTurno() {
  const { employee } = useAuth()
  const { cajas, addCaja, getCajaAnterior } = useCajas()
  const [preview, setPreview] = useState<CajaParte | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [savedNro, setSavedNro] = useState<number | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // La caja del turno: la recién guardada en esta sesión, o la más reciente importada.
  const caja = useMemo(() => {
    if (savedNro != null) return cajas.find(c => c.nroCaja === savedNro) ?? null
    return cajas[0] ?? null
  }, [cajas, savedNro])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setError('')
    setPreview(null)
    try {
      setPreview(await parseCajaExcel(file, employee?.name ?? ''))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el Excel de caja.')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  function confirmImport() {
    if (!preview) return
    addCaja(preview)
    setSavedNro(preview.nroCaja)
    setPreview(null)
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-xl font-bold text-navy-800 mb-1">Cerrar turno</h2>
      <p className="text-sm text-navy-500 mb-4">Al terminar tu turno, subí <strong>tu caja</strong> y <strong>tu parte de habitaciones</strong>. El sistema te marca si hay algo para corregir.</p>

      {/* Paso 1 — Caja */}
      <div className="bg-white rounded-xl border border-navy-100 p-3 mb-3">
        <p className="text-xs font-bold uppercase tracking-wide text-navy-500 mb-2">1 · Tu caja (Excel)</p>
        <label className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
          importing ? 'border-gold-400 bg-gold-50 text-navy-600' : 'border-indigo-300 text-indigo-600 hover:bg-indigo-50'
        }`}>
          <Upload size={18} className={importing ? 'animate-pulse' : ''} />
          <span className="text-sm font-semibold">{importing ? 'Leyendo Excel…' : 'Subir Excel de caja'}</span>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFile} disabled={importing} className="hidden" />
        </label>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

        {/* Preview antes de guardar */}
        {preview && (
          <div className="mt-3 rounded-xl border-2 border-gold-300 p-3">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={18} className="text-gold-600" />
                <div>
                  <p className="font-bold text-navy-800">Caja {preview.nroCaja} · {preview.turno ? TURNO_LABELS[preview.turno] : 'Turno —'}</p>
                  <p className="text-xs text-navy-500">{preview.conserje ?? preview.usuarioApertura} · apertura {fmtFecha(preview.aperturaAt)}</p>
                </div>
              </div>
              <button onClick={() => setPreview(null)} className="p-1 rounded-lg hover:bg-navy-100"><X size={18} /></button>
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm mb-3">
              <div className="bg-navy-50 rounded-lg p-2"><p className="text-[10px] text-navy-500 uppercase">Cobrado</p><p className="font-bold text-navy-800">{formatMontoCurrency(getCajaResumen(preview).totalCobrado)}</p></div>
              <div className="bg-navy-50 rounded-lg p-2"><p className="text-[10px] text-navy-500 uppercase">Cobros</p><p className="font-bold text-navy-800">{preview.ingresos.length}</p></div>
              <div className="bg-green-50 rounded-lg p-2"><p className="text-[10px] text-green-700 uppercase">Saldo</p><p className="font-bold text-navy-800">{formatMontoCurrency(preview.saldoFinal)}</p></div>
            </div>
            <button onClick={confirmImport} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-navy-800 text-cream font-bold text-sm hover:bg-navy-700 transition-colors">
              <Save size={16} /> Guardar caja {preview.nroCaja}
            </button>
          </div>
        )}
      </div>

      {/* Caja guardada: resumen + avisos */}
      {caja && (
        <div className="bg-white rounded-xl border border-navy-100 p-3 mb-3">
          <p className="font-bold text-navy-800 flex items-center gap-1.5 mb-2">
            <Wallet size={16} className="text-navy-500" /> Caja {caja.nroCaja} · {caja.turno ? TURNO_LABELS[caja.turno] : 'Turno —'}
          </p>
          <p className="text-xs text-navy-400 flex items-center gap-1 mb-3">
            <Clock size={11} /> {fmtFecha(caja.aperturaAt)} · {caja.conserje ?? caja.usuarioApertura}
          </p>
          {(() => {
            const flags = getCajaFlags(caja, getCajaAnterior(caja))
            return flags.length > 0 ? (
              <div className="space-y-1.5">
                {flags.map((f, i) => <FlagPill key={i} flag={f} />)}
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-2.5 text-xs text-green-700">
                <CheckCircle2 size={14} /> Caja sin observaciones.
              </div>
            )
          })()}
        </div>
      )}

      {/* Paso 2 — Parte (reusa el panel que hace PDF/foto IA + avisos) */}
      {caja ? (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-navy-500 mb-2">2 · Tu parte de habitaciones</p>
          <PartePanel nroCaja={caja.nroCaja} />
        </div>
      ) : (
        <p className="text-xs text-navy-400">Subí primero tu caja para poder cargar el parte.</p>
      )}
    </div>
  )
}
