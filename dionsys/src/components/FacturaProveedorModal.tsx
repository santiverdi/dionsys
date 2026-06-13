import { useEffect, useState, type ChangeEvent } from 'react'
import { X, Save, Camera, Sparkles, FileText, Trash2 } from 'lucide-react'
import { extractProviderInvoice } from '../lib/invoiceExtract'
import { uploadFactura, downloadUrl } from '../lib/facturaStorage'
import { validateMonto, formatMonto } from '../utils/validators'
import type { FacturaProveedor, TipoFactura } from '../types'

interface Props {
  supplierName: string
  subtitle?: string
  initial?: FacturaProveedor
  onClose: () => void
  // Devuelve los campos de la factura (el padre completa supplierId/cargadoBy/cargadoAt).
  onSave: (data: Pick<FacturaProveedor, 'tipoFactura' | 'monto' | 'fecha' | 'facturaUrl' | 'facturaNombre'>) => void
}

const TIPOS: TipoFactura[] = ['A', 'B', 'C']

export default function FacturaProveedorModal({ supplierName, subtitle, initial, onClose, onSave }: Props) {
  const [tipo, setTipo] = useState<TipoFactura>(initial?.tipoFactura ?? '')
  const [montoInput, setMontoInput] = useState(initial?.monto ? formatMonto(initial.monto) : '')
  const [fecha, setFecha] = useState(initial?.fecha ?? '')
  const [facturaUrl, setFacturaUrl] = useState(initial?.facturaUrl)
  const [facturaNombre, setFacturaNombre] = useState(initial?.facturaNombre)
  const [extracting, setExtracting] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [extractError, setExtractError] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    function onEsc(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [onClose])

  async function handleFactura(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setExtractError('')
    setUploadError('')
    setExtracting(true)
    try {
      const data = await extractProviderInvoice(file)
      if (data.tipoFactura && data.tipoFactura !== 'M') setTipo(data.tipoFactura)
      if (data.monto) {
        const v = validateMonto(data.monto)
        setMontoInput(v.ok ? formatMonto(v.value!) : data.monto)
      }
      if (data.fecha) setFecha(data.fecha)
      // Adjuntamos el mismo archivo leído (opcional: si falla, seguimos con los datos).
      try {
        const { url, nombre } = await uploadFactura(file)
        setFacturaUrl(url)
        setFacturaNombre(nombre)
      } catch (up) {
        setUploadError(up instanceof Error ? up.message : 'Se leyó la factura pero no se pudo adjuntar el archivo.')
      }
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'No se pudo leer la factura.')
    } finally {
      setExtracting(false)
    }
  }

  function handleSave() {
    const v = validateMonto(montoInput)
    if (!v.ok) { setError(v.error ?? 'Monto inválido'); return }
    if (!fecha) { setError('Poné la fecha de la factura'); return }
    onSave({
      tipoFactura: tipo,
      monto: v.value!,
      fecha,
      facturaUrl,
      facturaNombre,
    })
  }

  const liveValidation = montoInput.trim() ? validateMonto(montoInput) : null

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:w-96 sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[95vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-bold text-navy-800">Factura — {supplierName}</h3>
            {subtitle && <p className="text-xs text-navy-500 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-navy-100 transition-colors shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* Leer factura con IA */}
        <label className={`flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed mb-1 cursor-pointer transition-colors ${
          extracting ? 'border-gold-400 bg-gold-50 text-navy-600' : 'border-indigo-300 text-indigo-600 hover:bg-indigo-50'
        }`}>
          <Sparkles size={18} className={extracting ? 'animate-pulse' : ''} />
          <span className="text-sm font-semibold">
            {extracting ? 'Leyendo factura…' : 'Sacar foto / subir factura (la lee la IA)'}
          </span>
          <input
            type="file"
            accept="image/*,application/pdf"
            capture="environment"
            onChange={handleFactura}
            disabled={extracting}
            className="hidden"
          />
        </label>
        {extractError && <p className="text-xs text-red-600 mb-2">{extractError}</p>}
        {uploadError && <p className="text-xs text-amber-600 mb-2">{uploadError}</p>}
        {facturaUrl && (
          <a
            href={downloadUrl(facturaUrl, facturaNombre || 'factura')}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 mb-3"
          >
            <FileText size={13} /> {facturaNombre || 'Ver archivo adjunto'}
          </a>
        )}
        <p className="text-[11px] text-navy-400 mb-4 mt-1">Revisá los datos antes de guardar.</p>

        {/* Tipo de factura */}
        <label className="block text-xs font-semibold text-navy-500 mb-1">Tipo de factura</label>
        <div className="flex gap-2 mb-4">
          {TIPOS.map(t => (
            <button
              key={t}
              onClick={() => setTipo(prev => (prev === t ? '' : t))}
              className={`flex-1 py-2.5 rounded-lg text-sm font-bold border transition-all ${
                tipo === t ? 'bg-navy-800 text-cream border-navy-800' : 'bg-white text-navy-600 border-navy-200 hover:bg-navy-50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Monto */}
        <label className="block text-xs font-semibold text-navy-500 mb-1">Monto *</label>
        <div className="relative mb-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-navy-400">$</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={montoInput}
            onChange={e => { setMontoInput(e.target.value); setError('') }}
            className="w-full pl-7 pr-3 py-2.5 text-lg font-bold rounded-lg border border-navy-200 focus:outline-none focus:border-gold-400 text-navy-800"
          />
        </div>
        {liveValidation?.ok && <p className="text-xs text-navy-400 mb-3">≈ $ {formatMonto(liveValidation.value!)}</p>}

        {/* Fecha */}
        <label className="block text-xs font-semibold text-navy-500 mb-1 mt-2">Fecha de la factura *</label>
        <input
          type="date"
          value={fecha}
          onChange={e => { setFecha(e.target.value); setError('') }}
          className="w-full px-3 py-2.5 rounded-lg border border-navy-200 text-sm focus:outline-none focus:border-gold-400 mb-4"
        />

        {error && <p className="text-xs text-red-600 mb-3">{error}</p>}

        <button
          onClick={handleSave}
          disabled={extracting}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-navy-800 text-cream font-bold text-sm hover:bg-navy-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Save size={16} /> Guardar factura
        </button>
      </div>
    </div>
  )
}
