import { useEffect, useState, type ChangeEvent } from 'react'
import { X, Save, Sparkles, FileText, Trash2, Plus } from 'lucide-react'
import { extractProviderInvoice } from '../lib/invoiceExtract'
import { uploadFactura, downloadUrl } from '../lib/facturaStorage'
import { validateMonto, formatMonto, formatMontoCurrency } from '../utils/validators'
import type { FacturaProveedor, FacturaItemLinea, TipoFactura } from '../types'

interface Props {
  supplierName: string
  subtitle?: string
  initial?: FacturaProveedor
  onClose: () => void
  // Devuelve los campos de la factura (el padre completa supplierId/cargadoBy/cargadoAt).
  onSave: (data: Pick<FacturaProveedor, 'tipoFactura' | 'monto' | 'fecha' | 'items' | 'facturaUrl' | 'facturaNombre'>) => void
}

// Fila editable: todo string para los inputs; se convierte a números al guardar.
interface Row { descripcion: string; cantidad: string; importe: string }

const TIPOS: TipoFactura[] = ['A', 'B', 'C']

function rowsFromItems(items?: FacturaItemLinea[]): Row[] {
  return (items ?? []).map(it => ({
    descripcion: it.descripcion,
    cantidad: it.cantidad != null ? String(it.cantidad) : '',
    importe: formatMonto(it.importe),
  }))
}

function parseCantidad(s: string): number | undefined {
  const n = parseFloat(s.replace(',', '.'))
  return isNaN(n) ? undefined : n
}

function rowImporte(s: string): number {
  const v = validateMonto(s)
  return v.ok ? v.value! : 0
}

export default function FacturaProveedorModal({ supplierName, subtitle, initial, onClose, onSave }: Props) {
  const [tipo, setTipo] = useState<TipoFactura>(initial?.tipoFactura ?? '')
  const [fecha, setFecha] = useState(initial?.fecha ?? '')
  const [rows, setRows] = useState<Row[]>(rowsFromItems(initial?.items))
  // monto manual: solo se usa cuando no hay renglones cargados
  const [montoManual, setMontoManual] = useState(initial?.monto && !initial.items?.length ? formatMonto(initial.monto) : '')
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

  const itemsTotal = rows.reduce((acc, r) => acc + rowImporte(r.importe), 0)
  const hasRows = rows.length > 0

  async function handleFactura(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setExtractError('')
    setUploadError('')
    setExtracting(true)
    try {
      const data = await extractProviderInvoice(file)
      if (data.tipoFactura && data.tipoFactura !== 'M') setTipo(data.tipoFactura)
      if (data.fecha) setFecha(data.fecha)
      if (data.items?.length) {
        setRows(data.items.map(it => {
          const v = validateMonto(it.importe || '')
          return {
            descripcion: it.descripcion,
            cantidad: it.cantidad || '',
            importe: v.ok ? formatMonto(v.value!) : (it.importe || ''),
          }
        }))
      } else if (data.monto) {
        const v = validateMonto(data.monto)
        setMontoManual(v.ok ? formatMonto(v.value!) : data.monto)
      }
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

  function updateRow(idx: number, patch: Partial<Row>) {
    setRows(prev => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
    setError('')
  }
  function removeRow(idx: number) {
    setRows(prev => prev.filter((_, i) => i !== idx))
  }
  function addRow() {
    setRows(prev => [...prev, { descripcion: '', cantidad: '', importe: '' }])
  }

  function handleSave() {
    if (!fecha) { setError('Poné la fecha de la factura'); return }

    let monto: number
    let items: FacturaItemLinea[] | undefined

    if (hasRows) {
      items = rows
        .filter(r => r.descripcion.trim() || r.importe.trim())
        .map(r => ({
          descripcion: r.descripcion.trim() || 'Sin descripción',
          cantidad: parseCantidad(r.cantidad),
          importe: rowImporte(r.importe),
        }))
      if (items.length === 0) { setError('Agregá al menos un renglón o un monto'); return }
      monto = items.reduce((a, it) => a + it.importe, 0)
      if (monto <= 0) { setError('El total de los renglones tiene que ser mayor a 0'); return }
    } else {
      const v = validateMonto(montoManual)
      if (!v.ok) { setError(v.error ?? 'Poné el monto'); return }
      monto = v.value!
      items = undefined
    }

    onSave({ tipoFactura: tipo, monto, fecha, items, facturaUrl, facturaNombre })
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:w-[460px] sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 max-h-[95vh] overflow-y-auto"
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
            className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 mb-2"
          >
            <FileText size={13} /> {facturaNombre || 'Ver archivo adjunto'}
          </a>
        )}
        <p className="text-[11px] text-navy-400 mb-4 mt-1">Revisá y corregí los datos antes de guardar.</p>

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

        {/* Fecha */}
        <label className="block text-xs font-semibold text-navy-500 mb-1">Fecha de la factura *</label>
        <input
          type="date"
          value={fecha}
          onChange={e => { setFecha(e.target.value); setError('') }}
          className="w-full px-3 py-2.5 rounded-lg border border-navy-200 text-sm focus:outline-none focus:border-gold-400 mb-4"
        />

        {/* Renglones / detalle */}
        <div className="flex items-center justify-between mb-1.5">
          <label className="block text-xs font-semibold text-navy-500">Renglones</label>
          <button onClick={addRow} className="flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800">
            <Plus size={13} /> Agregar
          </button>
        </div>

        {hasRows ? (
          <div className="space-y-1.5 mb-3">
            {/* encabezados */}
            <div className="flex items-center gap-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-navy-400">
              <span className="flex-1">Producto</span>
              <span className="w-12 text-center">Cant.</span>
              <span className="w-20 text-right">Importe</span>
              <span className="w-5" />
            </div>
            {rows.map((r, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={r.descripcion}
                  onChange={e => updateRow(idx, { descripcion: e.target.value })}
                  placeholder="Producto"
                  className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-navy-200 text-sm focus:outline-none focus:border-gold-400"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={r.cantidad}
                  onChange={e => updateRow(idx, { cantidad: e.target.value })}
                  placeholder="—"
                  className="w-12 px-1.5 py-1.5 rounded-lg border border-navy-200 text-sm text-center focus:outline-none focus:border-gold-400"
                />
                <input
                  type="text"
                  inputMode="decimal"
                  value={r.importe}
                  onChange={e => updateRow(idx, { importe: e.target.value })}
                  placeholder="0,00"
                  className="w-20 px-1.5 py-1.5 rounded-lg border border-navy-200 text-sm text-right focus:outline-none focus:border-gold-400"
                />
                <button onClick={() => removeRow(idx)} className="w-5 text-navy-300 hover:text-red-500 shrink-0" title="Quitar renglón">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between pt-2 mt-1 border-t border-navy-100">
              <span className="text-sm font-semibold text-navy-600">Total</span>
              <span className="text-lg font-bold text-navy-800">{formatMontoCurrency(itemsTotal)}</span>
            </div>
          </div>
        ) : (
          <div className="mb-3">
            <p className="text-[11px] text-navy-400 mb-2">Sin renglones. Cargá la factura con IA, agregá renglones, o poné el monto total a mano:</p>
            <label className="block text-xs font-semibold text-navy-500 mb-1">Monto total *</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-navy-400">$</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0,00"
                value={montoManual}
                onChange={e => { setMontoManual(e.target.value); setError('') }}
                className="w-full pl-7 pr-3 py-2.5 text-lg font-bold rounded-lg border border-navy-200 focus:outline-none focus:border-gold-400 text-navy-800"
              />
            </div>
          </div>
        )}

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
