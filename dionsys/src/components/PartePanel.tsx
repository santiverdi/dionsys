import { useState, useRef } from 'react'
import {
  Upload, AlertTriangle, CheckCircle2, Trash2, BedDouble, Save, X, Sparkles, Wrench, LogOut,
  Camera, FileText,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { usePartes } from '../context/ParteContext'
import { useCajas } from '../context/CajaContext'
import { useCheckoutDocs } from '../context/CheckoutDocsContext'
import { parsePartePdf, parteFromExtracted } from '../lib/parsePartePdf'
import { extractParte } from '../lib/invoiceExtract'
import { getParteFlags, getParteResumen, getCheckouts, type ParteFlag, type CheckoutRecord } from '../lib/parteControl'
import { scanImageFile } from '../lib/scanDocument'
import { fileToPdf } from '../lib/imageToPdf'
import { uploadFactura, downloadUrl } from '../lib/facturaStorage'
import { formatMontoCurrency } from '../utils/validators'
import type { ParteHabitaciones, HabitacionOcupada, EstadoHabitacion } from '../types'

const SIN_CANAL = 'Sin canal'

function fmtFechaCorta(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}

// Adjunto de la hoja de checkout (sobre): escanear/subir y ver. Una por reserva.
function HojaCheckout({ reserva }: { reserva: string }) {
  const { employee } = useAuth()
  const { getDoc, setDoc } = useCheckoutDocs()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ref = useRef<HTMLInputElement>(null)
  const doc = getDoc(reserva)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setBusy(true)
    setErr('')
    try {
      const scanned = await scanImageFile(file)
      const pdf = await fileToPdf(scanned)
      const { url, nombre } = await uploadFactura(pdf)
      setDoc({ reserva, url, nombre, scannedBy: employee?.name ?? '', scannedAt: new Date().toISOString() })
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'No se pudo subir la hoja.')
    } finally {
      setBusy(false)
      if (ref.current) ref.current.value = ''
    }
  }

  return (
    <div className="mt-1.5 flex items-center gap-2 flex-wrap">
      {doc && (
        <a href={downloadUrl(doc.url, doc.nombre)} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:underline">
          <FileText size={12} /> Ver hoja de checkout
        </a>
      )}
      <label className={`inline-flex items-center gap-1 text-[11px] font-medium cursor-pointer ${busy ? 'text-navy-400' : 'text-navy-600 hover:text-navy-800'}`}>
        <Camera size={12} className={busy ? 'animate-pulse' : ''} />
        {busy ? 'Subiendo…' : doc ? 'Reemplazar hoja' : 'Escanear hoja de checkout'}
        <input ref={ref} type="file" accept="image/*,application/pdf" capture="environment" onChange={handleFile} disabled={busy} className="hidden" />
      </label>
      {err && <span className="text-[11px] text-red-600">{err}</span>}
    </div>
  )
}

function CheckoutRow({ co }: { co: CheckoutRecord }) {
  const habs = co.habitaciones.join(', ')
  const wrap = co.cobro ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
  return (
    <div className={`rounded-lg border p-2.5 text-xs ${wrap}`}>
      <div className="flex items-start gap-2">
        {co.cobro
          ? <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-green-600" />
          : <AlertTriangle size={14} className="shrink-0 mt-0.5 text-red-600" />}
        <div className="min-w-0">
          <p className="text-navy-700">
            <span className="font-semibold">Hab. {habs}</span> · reserva {co.reserva}
            {co.cobro?.pasajero ? ` · ${co.cobro.pasajero}` : ''}
          </p>
          {co.cobro ? (
            <p className="text-green-700">
              Cobrado en Caja {co.cobro.nroCaja} · {co.cobro.medioPago} · {formatMontoCurrency(co.cobro.monto)}
              {fmtFechaCorta(co.cobro.fechaHora) ? ` · ${fmtFechaCorta(co.cobro.fechaHora)}` : ''}
            </p>
          ) : (
            <p className="text-red-700 font-bold">SIN COBRO registrado en caja</p>
          )}
          <HojaCheckout reserva={co.reserva} />
        </div>
      </div>
    </div>
  )
}

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

export default function PartePanel({ nroCaja, onSaved }: { nroCaja?: number; onSaved?: (parte: ParteHabitaciones) => void }) {
  const { employee } = useAuth()
  const { addParte, deleteParte, getParteByCaja, getParteAnterior } = usePartes()
  const { cajas } = useCajas()
  const [preview, setPreview] = useState<ParteHabitaciones | null>(null)
  const [importing, setImporting] = useState<'' | 'pdf' | 'ia'>('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const fileIaRef = useRef<HTMLInputElement>(null)

  // Si nos dan un nroCaja, mostramos/validamos el parte de ESA caja. Si no
  // (carga suelta al cerrar turno, antes de tener la caja), el parte se
  // autoidentifica por su propio Nº de Caja del PDF y se enlaza solo.
  const parte = nroCaja != null ? getParteByCaja(nroCaja) : undefined

  // Procesa un archivo con el lector dado (PDF con texto o IA sobre foto/escaneo).
  async function procesar(
    file: File,
    fase: 'pdf' | 'ia',
    leer: (f: File) => Promise<ParteHabitaciones>,
    ref: React.RefObject<HTMLInputElement | null>,
  ) {
    setImporting(fase)
    setError('')
    setPreview(null)
    try {
      const p = await leer(file)
      if (nroCaja != null && p.nroCaja !== nroCaja) {
        setError(`El parte leído es de la Caja ${p.nroCaja}, no de la Caja ${nroCaja}.`)
      } else {
        setPreview(p)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el parte.')
    } finally {
      setImporting('')
      if (ref.current) ref.current.value = ''
    }
  }

  function handlePdf(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) procesar(file, 'pdf', f => parsePartePdf(f, employee?.name ?? ''), fileRef)
  }

  function handleIA(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) procesar(file, 'ia', async f => parteFromExtracted(await extractParte(f), employee?.name ?? '', f.name), fileIaRef)
  }

  function confirmImport() {
    if (!preview) return
    addParte(preview)
    onSaved?.(preview)
    setPreview(null)
  }

  // ===== Importador (cuando todavía no hay parte para esta caja) =====
  if (!parte) {
    return (
      <div className="bg-white rounded-xl border border-navy-100 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-navy-500 mb-2">Parte de habitaciones</p>
        <div className="grid sm:grid-cols-2 gap-2">
          <label className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
            importing === 'pdf' ? 'border-gold-400 bg-gold-50 text-navy-600' : 'border-indigo-300 text-indigo-600 hover:bg-indigo-50'
          } ${importing ? 'pointer-events-none opacity-60' : ''}`}>
            <Upload size={18} className={importing === 'pdf' ? 'animate-pulse' : ''} />
            <span className="text-sm font-semibold">{importing === 'pdf' ? 'Leyendo PDF…' : 'Parte (PDF con texto)'}</span>
            <input ref={fileRef} type="file" accept="application/pdf,.pdf" onChange={handlePdf} disabled={!!importing} className="hidden" />
          </label>
          <label className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
            importing === 'ia' ? 'border-gold-400 bg-gold-50 text-navy-600' : 'border-emerald-300 text-emerald-600 hover:bg-emerald-50'
          } ${importing ? 'pointer-events-none opacity-60' : ''}`}>
            <Sparkles size={18} className={importing === 'ia' ? 'animate-pulse' : ''} />
            <span className="text-sm font-semibold">{importing === 'ia' ? 'Leyendo con IA…' : 'Foto / escaneo (IA)'}</span>
            <input ref={fileIaRef} type="file" accept="image/*,application/pdf,.pdf" onChange={handleIA} disabled={!!importing} className="hidden" />
          </label>
        </div>
        <p className="text-[11px] text-navy-400 mt-1.5">Si podés bajar el PDF del turno, usá "PDF con texto" (exacto). Para partes viejos que solo tenés en foto/escaneo, usá "IA".</p>
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
  const parteAnterior = getParteAnterior(parte)
  const resumen = getParteResumen(parte)
  const flags = getParteFlags(parte, parteAnterior, cajas)
  const checkouts = getCheckouts(parte, parteAnterior, cajas)
  const checkoutsSinCobro = checkouts.filter(c => !c.cobro).length

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

      {/* Check-outs del turno conciliados contra la caja */}
      {checkouts.length > 0 && (
        <div className="mb-3">
          <p className="text-[11px] font-bold uppercase tracking-wide text-navy-400 mb-1.5 flex items-center gap-1.5">
            <LogOut size={12} /> Check-outs del turno ({checkouts.length})
            {checkoutsSinCobro > 0 && (
              <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold normal-case">
                {checkoutsSinCobro} sin cobro
              </span>
            )}
          </p>
          <div className="space-y-1.5">
            {checkouts.map((co, i) => <CheckoutRow key={i} co={co} />)}
          </div>
        </div>
      )}

      {/* Otras observaciones */}
      {flags.length > 0 && (
        <div className="space-y-1.5 mb-3">
          {flags.map((f, i) => <FlagPill key={i} flag={f} />)}
        </div>
      )}
      {flags.length === 0 && checkouts.length === 0 && (
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
