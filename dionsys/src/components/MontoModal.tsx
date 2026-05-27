import { useState, useEffect, type ChangeEvent } from 'react'
import { X, Save, Camera, Trash2 } from 'lucide-react'
import { compressImage } from '../utils/imageCompressor'
import { validateMonto, formatMonto } from '../utils/validators'

interface MontoModalProps {
  open: boolean
  title: string
  subtitle?: string
  initialMonto?: number
  initialReceiptPhoto?: string
  onClose: () => void
  onSave: (data: { monto: number; receiptPhoto?: string }) => void
}

export default function MontoModal({
  open, title, subtitle, initialMonto, initialReceiptPhoto, onClose, onSave,
}: MontoModalProps) {
  const [montoInput, setMontoInput] = useState('')
  const [photo, setPhoto] = useState<string | undefined>()
  const [uploading, setUploading] = useState(false)
  const [submitError, setSubmitError] = useState('')

  useEffect(() => {
    if (open) {
      setMontoInput(initialMonto ? formatMonto(initialMonto) : '')
      setPhoto(initialReceiptPhoto)
      setSubmitError('')
    }
  }, [open, initialMonto, initialReceiptPhoto])

  if (!open) return null

  async function handlePhotoUpload(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setSubmitError('')
    try {
      const base64 = await compressImage(file)
      setPhoto(base64)
    } catch {
      setSubmitError('No se pudo cargar la imagen')
    } finally {
      setUploading(false)
    }
  }

  function handleSubmit() {
    const result = validateMonto(montoInput)
    if (!result.ok) {
      setSubmitError(result.error ?? 'Monto inválido')
      return
    }
    onSave({ monto: result.value!, receiptPhoto: photo })
  }

  const liveValidation = montoInput.trim() ? validateMonto(montoInput) : null
  const showError = submitError || (liveValidation && !liveValidation.ok ? liveValidation.error : '')
  const canSubmit = liveValidation?.ok && !uploading

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
            <h3 className="text-lg font-bold text-navy-800">{title}</h3>
            {subtitle && <p className="text-xs text-navy-500 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-navy-100 transition-colors shrink-0">
            <X size={20} />
          </button>
        </div>

        <label className="block text-xs font-semibold text-navy-500 mb-1">Monto recibido *</label>
        <div className="relative mb-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-navy-400">$</span>
          <input
            type="text"
            inputMode="decimal"
            placeholder="0,00"
            value={montoInput}
            onChange={e => { setMontoInput(e.target.value); setSubmitError('') }}
            autoFocus
            className={`w-full pl-7 pr-3 py-2.5 text-lg font-bold rounded-lg border focus:outline-none ${
              showError
                ? 'border-red-300 focus:border-red-500 text-red-700'
                : 'border-navy-200 focus:border-gold-400 text-navy-800'
            }`}
          />
        </div>
        {showError && <p className="text-xs text-red-600 mb-3">{showError}</p>}
        {!showError && liveValidation?.ok && (
          <p className="text-xs text-navy-400 mb-3">≈ $ {formatMonto(liveValidation.value!)}</p>
        )}
        {!liveValidation && <p className="text-xs text-navy-300 mb-3">Ej: 1.234,56</p>}

        <label className="block text-xs font-semibold text-navy-500 mb-1">Foto del remito (opcional)</label>
        {photo ? (
          <div className="relative mb-4">
            <img
              src={photo}
              alt="Remito"
              className="w-full max-h-40 object-contain rounded-lg border border-navy-100 bg-navy-50"
            />
            <button
              onClick={() => setPhoto(undefined)}
              className="absolute top-1 right-1 p-1.5 rounded-lg bg-white/90 hover:bg-white shadow-sm"
              title="Quitar foto"
            >
              <Trash2 size={14} className="text-red-500" />
            </button>
          </div>
        ) : (
          <label className="flex items-center justify-center gap-2 py-2.5 rounded-lg border border-dashed border-navy-200 text-navy-500 hover:border-gold-400 hover:text-navy-700 cursor-pointer transition-colors mb-4">
            <Camera size={16} />
            <span className="text-sm">{uploading ? 'Cargando...' : 'Agregar foto'}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoUpload}
              className="hidden"
            />
          </label>
        )}

        <button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-navy-800 text-cream font-bold text-sm hover:bg-navy-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <Save size={16} /> Guardar
        </button>
      </div>
    </div>
  )
}
