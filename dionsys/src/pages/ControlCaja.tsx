import { useState, useRef, useMemo } from 'react'
import {
  Wallet, Upload, ChevronLeft, Clock, AlertTriangle, CheckCircle2,
  Trash2, FileSpreadsheet, Save, X, Sun, Sunset, Moon,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useCajas } from '../context/CajaContext'
import { parseCajaExcel } from '../lib/parseCaja'
import { getCajaFlags, getCajaResumen, type CajaFlag } from '../lib/cajaControl'
import { formatMontoCurrency } from '../utils/validators'
import { TURNO_LABELS, type Turno } from '../context/OccupancyContext'
import type { CajaParte, CajaMovimiento } from '../types'

const TURNO_ICON: Record<Turno, typeof Sun> = { manana: Sun, tarde: Sunset, noche: Moon }

function fmtFecha(iso: string, withTime = true): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

// Medio de pago "principal" de un movimiento (la columna con monto).
function medioDe(m: CajaMovimiento): string {
  if (m.tarjetas) return 'Tarjeta'
  if (m.transferencia) return 'Transf.'
  if (m.cheques) return 'Cheque'
  if (m.otros) return 'Otros'
  if (m.efectivo) return 'Efectivo'
  return '—'
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

export default function ControlCaja() {
  const { employee } = useAuth()
  const { cajas, addCaja, deleteCaja, getCajaAnterior } = useCajas()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [preview, setPreview] = useState<CajaParte | null>(null)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const selected = useMemo(() => cajas.find(c => c.id === selectedId) ?? null, [cajas, selectedId])

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImporting(true)
    setError('')
    setPreview(null)
    try {
      const caja = await parseCajaExcel(file, employee?.name ?? '')
      setPreview(caja)
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
    setPreview(null)
  }

  // ============ DETALLE ============
  if (selected) {
    const resumen = getCajaResumen(selected)
    const flags = getCajaFlags(selected, getCajaAnterior(selected))
    const TIcon = selected.turno ? TURNO_ICON[selected.turno] : Clock
    return (
      <div>
        <button onClick={() => setSelectedId(null)} className="flex items-center gap-2 text-navy-600 hover:text-navy-800 mb-4 text-sm font-medium">
          <ChevronLeft size={18} /> Control de Caja
        </button>

        <div className="flex items-start justify-between gap-2 mb-1">
          <h2 className="text-xl font-bold text-navy-800">Caja {selected.nroCaja}</h2>
          {employee?.role === 'admin' && (
            <button
              onClick={() => { deleteCaja(selected.id); setSelectedId(null) }}
              className="p-1.5 rounded-lg text-navy-400 hover:text-red-500 hover:bg-red-50 transition-colors"
              title="Borrar esta caja importada"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
        <p className="text-sm text-navy-500 mb-4 flex items-center gap-1.5">
          <TIcon size={14} /> {selected.turno ? TURNO_LABELS[selected.turno] : 'Turno —'} · {selected.conserje ?? selected.usuarioApertura} · {selected.puntoVenta}
        </p>

        {/* Apertura / cierre / saldo */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
          <div className="bg-navy-50 rounded-lg p-2.5">
            <p className="text-[10px] text-navy-500 uppercase">Apertura</p>
            <p className="text-sm font-bold text-navy-800">{formatMontoCurrency(selected.aperturaMonto)}</p>
            <p className="text-[10px] text-navy-400">{fmtFecha(selected.aperturaAt)}</p>
          </div>
          <div className="bg-navy-50 rounded-lg p-2.5">
            <p className="text-[10px] text-navy-500 uppercase">Cobrado</p>
            <p className="text-sm font-bold text-navy-800">{formatMontoCurrency(resumen.totalCobrado)}</p>
            <p className="text-[10px] text-navy-400">{resumen.cantIngresos} cobro(s)</p>
          </div>
          <div className="bg-navy-50 rounded-lg p-2.5">
            <p className="text-[10px] text-navy-500 uppercase">Retiros</p>
            <p className="text-sm font-bold text-navy-800">{formatMontoCurrency(resumen.totalRetiros)}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-2.5">
            <p className="text-[10px] text-green-700 uppercase">Saldo</p>
            <p className="text-sm font-bold text-navy-800">{formatMontoCurrency(selected.saldoFinal)}</p>
            <p className="text-[10px] text-navy-400">{selected.cierreAt ? `Cierre ${fmtFecha(selected.cierreAt)}` : 'Sin cerrar'}</p>
          </div>
        </div>

        {/* Flags */}
        {flags.length > 0 && (
          <div className="space-y-1.5 mb-4">
            {flags.map((f, i) => <FlagPill key={i} flag={f} />)}
          </div>
        )}
        {flags.length === 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-2.5 text-xs text-green-700 mb-4">
            <CheckCircle2 size={14} /> Sin imperfecciones detectadas.
          </div>
        )}

        {/* Cobranzas por medio de pago */}
        <div className="bg-white rounded-xl border border-navy-100 p-3 mb-4">
          <p className="text-xs font-bold uppercase tracking-wide text-navy-500 mb-2">Cobrado por medio de pago</p>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-sm">
            {([['Efectivo', resumen.efectivo], ['Tarjetas', resumen.tarjetas], ['Transf.', resumen.transferencia], ['Cheques', resumen.cheques], ['Otros', resumen.otros]] as const).map(([l, v]) => (
              <div key={l} className="bg-navy-50 rounded-lg p-2">
                <p className="text-[10px] text-navy-500">{l}</p>
                <p className="font-semibold text-navy-800">{formatMontoCurrency(v)}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Ingresos */}
        <div className="bg-white rounded-xl border border-navy-100 p-3 mb-4">
          <p className="text-xs font-bold uppercase tracking-wide text-navy-500 mb-2">Cobranzas ({selected.ingresos.length})</p>
          <div className="overflow-x-auto -mx-3 px-3">
            <table className="w-full text-xs min-w-[520px]">
              <thead>
                <tr className="text-navy-500 border-b border-navy-100">
                  <th className="text-left py-1.5 pr-2">Hora</th>
                  <th className="text-left px-2">Hab.</th>
                  <th className="text-left px-2">Pasajero / Reserva</th>
                  <th className="text-left px-2">Medio</th>
                  <th className="text-left px-2">FB</th>
                  <th className="text-right pl-2">Monto</th>
                </tr>
              </thead>
              <tbody>
                {selected.ingresos.map((m, i) => (
                  <tr key={i} className="border-b border-navy-50 last:border-0">
                    <td className="py-1.5 pr-2 text-navy-500 whitespace-nowrap">{fmtFecha(m.fechaHora).split(' ')[1] ?? ''}</td>
                    <td className="px-2 text-navy-700">{m.habitacion || '—'}</td>
                    <td className="px-2 text-navy-700">{m.pasajero ?? (m.reserva ? `Reserva ${m.reserva}` : '—')}</td>
                    <td className="px-2 text-navy-600">{medioDe(m)}</td>
                    <td className="px-2">
                      {m.tarjetas > 0 && !m.facturaB
                        ? <span className="text-red-600 font-semibold">falta</span>
                        : <span className="text-navy-500">{m.facturaB ?? '—'}</span>}
                    </td>
                    <td className="text-right pl-2 font-semibold text-navy-800 whitespace-nowrap">{formatMontoCurrency(m.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Egresos / retiros */}
        {(selected.egresos.length > 0 || selected.retiros.length > 0) && (
          <div className="bg-white rounded-xl border border-navy-100 p-3">
            <p className="text-xs font-bold uppercase tracking-wide text-navy-500 mb-2">Egresos y retiros</p>
            <ul className="text-sm space-y-1">
              {[...selected.egresos, ...selected.retiros].map((m, i) => (
                <li key={i} className="flex items-center justify-between gap-2">
                  <span className="text-navy-600 truncate">{m.observacion || 'Movimiento'}</span>
                  <span className="font-semibold text-navy-800 shrink-0">{formatMontoCurrency(m.total)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    )
  }

  // ============ LISTADO + IMPORT ============
  return (
    <div>
      <h2 className="text-xl font-bold text-navy-800 mb-1">Control de Caja</h2>
      <p className="text-sm text-navy-500 mb-4">Importá el Excel de caja que baja cada conserje del PMS. El sistema marca solo las imperfecciones.</p>

      {/* Importar */}
      <label className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed mb-2 cursor-pointer transition-colors ${
        importing ? 'border-gold-400 bg-gold-50 text-navy-600' : 'border-indigo-300 text-indigo-600 hover:bg-indigo-50'
      }`}>
        <Upload size={18} className={importing ? 'animate-pulse' : ''} />
        <span className="text-sm font-semibold">{importing ? 'Leyendo Excel…' : 'Importar Excel de caja'}</span>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={handleFile} disabled={importing} className="hidden" />
      </label>
      {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

      {/* Preview antes de guardar */}
      {preview && (
        <div className="bg-white rounded-xl border-2 border-gold-300 p-4 mb-4">
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

      {/* Listado */}
      {cajas.length === 0 ? (
        <div className="text-center py-16">
          <Wallet size={48} className="mx-auto text-navy-200 mb-3" />
          <p className="text-navy-400 font-medium">No hay cajas importadas</p>
          <p className="text-sm text-navy-300 mt-1">Importá el Excel de caja de un turno para empezar el control.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {cajas.map(caja => {
            const resumen = getCajaResumen(caja)
            const flags = getCajaFlags(caja, getCajaAnterior(caja))
            const errores = flags.filter(f => f.level === 'error').length
            const warns = flags.filter(f => f.level !== 'error').length
            const TIcon = caja.turno ? TURNO_ICON[caja.turno] : Clock
            return (
              <button
                key={caja.id}
                onClick={() => setSelectedId(caja.id)}
                className="w-full text-left rounded-xl border border-navy-100 bg-white p-4 hover:border-gold-400 hover:shadow-md transition-all"
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <TIcon size={16} className="text-navy-500 shrink-0" />
                    <p className="font-bold text-navy-800 truncate">
                      Caja {caja.nroCaja} · {caja.turno ? TURNO_LABELS[caja.turno].split(' ')[0] : '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {errores > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">{errores} descuadre</span>}
                    {warns > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">{warns} a revisar</span>}
                    {flags.length === 0 && <CheckCircle2 size={16} className="text-green-500" />}
                  </div>
                </div>
                <p className="text-xs text-navy-400 flex items-center gap-1 mb-2">
                  <Clock size={11} /> {fmtFecha(caja.aperturaAt)} · {caja.conserje ?? caja.usuarioApertura}
                </p>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-navy-600">
                  <span>Cobrado: <span className="font-semibold text-navy-800">{formatMontoCurrency(resumen.totalCobrado)}</span></span>
                  <span>Saldo: <span className="font-semibold text-navy-800">{formatMontoCurrency(caja.saldoFinal)}</span></span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
