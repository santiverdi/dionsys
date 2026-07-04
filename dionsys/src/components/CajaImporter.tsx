import { useState, useRef } from 'react'
import { Upload, FileSpreadsheet, Save, X, Sparkles, AlertTriangle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useCajas } from '../context/CajaContext'
import { parseCajaExcel, cajaFromExtracted } from '../lib/parseCaja'
import { extractCaja } from '../lib/invoiceExtract'
import { getCajaResumen, faltantesAntesDe, fmtFaltantes } from '../lib/cajaControl'
import { formatMontoCurrency } from '../utils/validators'
import { TURNO_LABELS } from '../context/OccupancyContext'
import type { CajaParte } from '../types'

// Lectura de caja por foto/IA (modo 'caja' de /api/extract-invoice, ya soportado).
// El Excel del PMS sigue siendo la fuente EXACTA; la foto/IA es un respaldo
// aproximado para cuando el conserje no tiene el Excel a mano (se confirma en la
// vista previa antes de guardar). Apagar = poner en false.
const CAJA_IA_ENABLED = true

function fmtFecha(iso: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
}

/**
 * Carga de una caja (Excel del PMS o, si se habilita, foto/IA). Muestra una
 * vista previa antes de guardar y avisa `onSaved` con la caja recién guardada.
 * Compartido por Cerrar turno y Control de Caja para no duplicar la lógica.
 */
export default function CajaImporter({ onSaved }: { onSaved?: (caja: CajaParte) => void }) {
  const { employee } = useAuth()
  const { cajas, addCaja } = useCajas()
  const [preview, setPreview] = useState<CajaParte | null>(null)
  const [importing, setImporting] = useState<'' | 'excel' | 'ia'>('')
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const fileIaRef = useRef<HTMLInputElement>(null)

  async function procesar(
    file: File,
    fase: 'excel' | 'ia',
    leer: (f: File) => Promise<CajaParte>,
    ref: React.RefObject<HTMLInputElement | null>,
  ) {
    setImporting(fase)
    setError('')
    setPreview(null)
    try {
      setPreview(await leer(file))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer la caja.')
    } finally {
      setImporting('')
      if (ref.current) ref.current.value = ''
    }
  }

  function handleExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type.startsWith('image/')) {
      setError('Eso es una foto. La caja se carga con el «Informe de caja» en Excel del PMS. (El parte de habitaciones sí va por foto.)')
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    procesar(file, 'excel', f => parseCajaExcel(f, employee?.name ?? ''), fileRef)
  }

  function handleIA(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) procesar(file, 'ia', async f => cajaFromExtracted(await extractCaja(f), employee?.name ?? '', f.name), fileIaRef)
  }

  function confirmImport() {
    if (!preview) return
    addCaja(preview)
    onSaved?.(preview)
    setPreview(null)
  }

  const busy = !!importing
  // Regla del hotel: la numeración de cajas JAMÁS se saltea, así que se avisa
  // fuerte si falta algo en el medio. Pero no se bloquea para siempre esperando
  // un admin: cualquiera puede guardar igual dejando el hueco marcado (queda
  // visible para revisar en el dashboard) — si no, un conserje sin admin cerca
  // queda sin forma de terminar su turno.
  const faltantes = preview ? faltantesAntesDe(preview.nroCaja, cajas) : []

  return (
    <div>
      <div className={CAJA_IA_ENABLED ? 'grid sm:grid-cols-2 gap-2' : ''}>
        {/* Excel del PMS — fuente exacta */}
        <label className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
          importing === 'excel' ? 'border-gold-400 bg-gold-50 text-navy-600' : 'border-indigo-300 text-indigo-600 hover:bg-indigo-50'
        } ${busy ? 'pointer-events-none opacity-60' : ''}`}>
          <Upload size={18} className={importing === 'excel' ? 'animate-pulse' : ''} />
          <span className="text-sm font-semibold">{importing === 'excel' ? 'Leyendo Excel…' : 'Subir Excel de caja'}</span>
          {/* accept por extensión (sin el MIME largo, que esconde el archivo en algunos celulares). */}
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleExcel} disabled={busy} className="hidden" />
        </label>

        {/* Foto / IA — solo si está habilitado (necesita el modo 'caja' en el endpoint). */}
        {CAJA_IA_ENABLED && (
          <label className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
            importing === 'ia' ? 'border-gold-400 bg-gold-50 text-navy-600' : 'border-emerald-300 text-emerald-600 hover:bg-emerald-50'
          } ${busy ? 'pointer-events-none opacity-60' : ''}`}>
            <Sparkles size={18} className={importing === 'ia' ? 'animate-pulse' : ''} />
            <span className="text-sm font-semibold">{importing === 'ia' ? 'Leyendo con IA…' : 'Foto / escaneo (IA)'}</span>
            <input ref={fileIaRef} type="file" accept="image/*,application/pdf,.pdf" capture="environment" onChange={handleIA} disabled={busy} className="hidden" />
          </label>
        )}
      </div>

      <p className="text-[11px] text-navy-400 mt-1.5">
        Es el <strong>«Informe de caja»</strong> que exportás del PMS (Todoalojamiento) en Excel. Bajalo y subilo acá.
        {CAJA_IA_ENABLED && ' Si solo lo tenés en foto/escaneo, usá «Foto / escaneo (IA)» (aproximado).'}
      </p>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {/* Vista previa antes de guardar */}
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
          {faltantes.length > 0 && (
            <div className="flex items-start gap-2 rounded-lg border-2 border-red-300 bg-red-50 p-2.5 text-xs text-red-700 mb-3">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>
                <strong>No se puede saltear la numeración.</strong> Antes de la caja {preview.nroCaja} falta
                cargar: {fmtFaltantes(faltantes)}. Si podés, buscá el Excel de esa caja en el PMS y subilo primero.
                Si no lo tenés, guardá igual — el hueco queda marcado en el dashboard para revisar después.
              </span>
            </div>
          )}
          <button
            onClick={confirmImport}
            className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl font-bold text-sm transition-colors ${
              faltantes.length > 0
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'bg-navy-800 text-cream hover:bg-navy-700'
            }`}
          >
            <Save size={16} /> {faltantes.length > 0
              ? `Guardar igual dejando hueco`
              : `Guardar caja ${preview.nroCaja}`}
          </button>
        </div>
      )}
    </div>
  )
}
