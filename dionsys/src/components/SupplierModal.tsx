import { useState } from 'react'
import { X, Trash2 } from 'lucide-react'
import type { DepositoSupplier } from '../types'
import ConfirmDialog from './ConfirmDialog'

interface Props {
  supplier: DepositoSupplier | null // null = nueva
  onClose: () => void
  onSave: (data: Omit<DepositoSupplier, 'id'>) => void
  onDelete?: () => void
}

const CATEGORIAS = ['Desayunador', 'Limpieza', 'Limpieza/General', 'General']

export default function SupplierModal({ supplier, onClose, onSave, onDelete }: Props) {
  const isNew = supplier === null
  const [name, setName] = useState(supplier?.name ?? '')
  const [phone, setPhone] = useState(supplier?.phone ?? '')
  const [category, setCategory] = useState(supplier?.category ?? 'Desayunador')
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleSave() {
    if (!name.trim()) return setError('Poné el nombre de la distribuidora')
    // Teléfono opcional, pero si lo cargan debe tener solo dígitos / + / espacios
    const cleanPhone = phone.replace(/[\s-]/g, '')
    if (cleanPhone && !/^\+?\d{6,15}$/.test(cleanPhone)) {
      return setError('El teléfono debe ser solo números (con código de país). Ej: 5492235550000')
    }
    onSave({ name: name.trim(), phone: cleanPhone, category })
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:w-[420px] sm:max-w-md rounded-t-2xl sm:rounded-2xl flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 pb-3 border-b border-navy-100">
          <h3 className="text-lg font-bold text-navy-800">
            {isNew ? 'Nueva distribuidora' : 'Editar distribuidora'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-navy-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-navy-500 mb-1">Nombre</label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setError(null) }}
              placeholder="Ej: TPG"
              className="w-full px-3 py-2 rounded-lg border border-navy-200 text-sm focus:outline-none focus:border-gold-400"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-500 mb-1">
              Teléfono (WhatsApp)
            </label>
            <input
              type="tel"
              value={phone}
              onChange={e => { setPhone(e.target.value); setError(null) }}
              placeholder="5492235550000"
              className="w-full px-3 py-2 rounded-lg border border-navy-200 text-sm focus:outline-none focus:border-gold-400"
            />
            <p className="text-[10px] text-navy-400 mt-0.5">
              Con código de país, sin el +. Ej: 549223... Necesario para enviar el pedido por WhatsApp.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-navy-500 mb-1">Categoría</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-navy-200 text-sm focus:outline-none focus:border-gold-400 bg-white"
            >
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
        </div>

        <div className="p-5 pt-3 border-t border-navy-100 bg-cream/50 flex gap-2">
          {!isNew && onDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-3 rounded-xl text-red-600 hover:bg-red-50 border border-red-200 transition-colors shrink-0"
              title="Borrar distribuidora"
            >
              <Trash2 size={18} />
            </button>
          )}
          <button
            onClick={handleSave}
            className="flex-1 py-3 rounded-xl bg-gold-400 text-navy-900 font-bold text-sm hover:bg-gold-500 transition-colors"
          >
            {isNew ? 'Crear distribuidora' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Borrar distribuidora"
        message={`Se va a quitar "${supplier?.name}". Los items que la tenían asignada quedarán sin proveedor.`}
        onConfirm={() => { setConfirmDelete(false); onDelete?.() }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
