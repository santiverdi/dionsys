import { AlertTriangle, HelpCircle, X } from 'lucide-react'

type Variant = 'danger' | 'info'

interface ConfirmDialogProps {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  variant?: Variant
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  variant = 'danger',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null

  const isDanger = variant === 'danger'
  const Icon = isDanger ? AlertTriangle : HelpCircle
  const iconWrap = isDanger ? 'bg-red-100' : 'bg-gold-100'
  const iconColor = isDanger ? 'text-red-600' : 'text-gold-600'
  const confirmBtn = isDanger
    ? 'bg-red-600 text-white hover:bg-red-700'
    : 'bg-gold-400 text-navy-900 hover:bg-gold-500'
  const defaultLabel = isDanger ? 'Eliminar' : 'Confirmar'

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white w-full sm:w-96 sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full ${iconWrap} flex items-center justify-center`}>
              <Icon size={18} className={iconColor} />
            </div>
            <h3 className="text-lg font-bold text-navy-800">{title}</h3>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg hover:bg-navy-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <p className="text-sm text-navy-600 mb-6">{message}</p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl font-semibold text-sm bg-navy-100 text-navy-700 hover:bg-navy-200 transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 py-3 rounded-xl font-bold text-sm transition-colors ${confirmBtn}`}
          >
            {confirmLabel ?? defaultLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
