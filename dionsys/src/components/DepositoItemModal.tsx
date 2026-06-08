import { useState } from 'react'
import { X, Trash2, Package, Coffee, SprayCanIcon } from 'lucide-react'
import type { DepositoItem, DepositoSupplier } from '../types'
import { depositoItemSupplier } from '../data/mock'
import ConfirmDialog from './ConfirmDialog'

interface Props {
  item: DepositoItem | null // null = nuevo
  suppliers: DepositoSupplier[]
  onClose: () => void
  onSave: (data: Omit<DepositoItem, 'id'>) => void
  onDelete?: () => void
}

export default function DepositoItemModal({ item, suppliers, onClose, onSave, onDelete }: Props) {
  const isNew = item === null

  const [name, setName] = useState(item?.name ?? '')
  const [category, setCategory] = useState<'desayunador' | 'limpieza'>(item?.category ?? 'desayunador')
  const [unit, setUnit] = useState(item?.unit ?? 'unidad')
  const [stockIdeal, setStockIdeal] = useState(String(item?.stockIdeal ?? 1))
  const [initialStock, setInitialStock] = useState('0')
  const [hasPack, setHasPack] = useState(!!item?.packUnit?.trim())
  const [packUnit, setPackUnit] = useState(item?.packUnit ?? 'bolsa')
  const [packSize, setPackSize] = useState(String(item?.packSize ?? 10))
  const [supplierId, setSupplierId] = useState(
    item?.supplierId ?? (item ? depositoItemSupplier[item.id] ?? '' : '')
  )
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  function handleSave() {
    const trimmedName = name.trim()
    if (!trimmedName) return setError('Poné un nombre')
    if (!unit.trim()) return setError('Poné la unidad de consumo (kg, unidad, caja...)')

    const idealN = Number(stockIdeal)
    if (isNaN(idealN) || idealN < 0) return setError('El stock ideal tiene que ser un número válido')

    let packData: { packUnit?: string; packSize?: number } = { packUnit: undefined, packSize: undefined }
    if (hasPack) {
      const sizeN = Number(packSize)
      if (!packUnit.trim()) return setError('Poné la unidad de compra (bolsa, caja...)')
      if (isNaN(sizeN) || sizeN <= 1) return setError('La unidad de compra debe traer más de 1 unidad de consumo')
      packData = { packUnit: packUnit.trim(), packSize: sizeN }
    }

    let stock = item?.stock ?? 0
    if (isNew) {
      const stockN = Number(initialStock)
      stock = isNaN(stockN) || stockN < 0 ? 0 : stockN
    }

    onSave({
      name: trimmedName,
      category,
      unit: unit.trim(),
      stock,
      stockIdeal: idealN,
      supplierId: supplierId || undefined,
      ...packData,
    })
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:w-[460px] sm:max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[95vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-3 border-b border-navy-100">
          <h3 className="text-lg font-bold text-navy-800">
            {isNew ? 'Nuevo artículo' : 'Editar artículo'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-navy-100 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4 flex-1 space-y-4">
          {/* Nombre */}
          <div>
            <label className="block text-xs font-semibold text-navy-500 mb-1">Nombre</label>
            <input
              type="text"
              value={name}
              onChange={e => { setName(e.target.value); setError(null) }}
              placeholder="Ej: Harina"
              className="w-full px-3 py-2 rounded-lg border border-navy-200 text-sm focus:outline-none focus:border-gold-400"
            />
          </div>

          {/* Categoría */}
          <div>
            <label className="block text-xs font-semibold text-navy-500 mb-1">Categoría</label>
            <div className="flex gap-2">
              {([
                { key: 'desayunador' as const, label: 'Desayuno', icon: Coffee },
                { key: 'limpieza' as const, label: 'Limpieza', icon: SprayCanIcon },
              ]).map(c => (
                <button
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                    category === c.key ? 'bg-navy-800 text-cream' : 'bg-navy-100 text-navy-600 hover:bg-navy-200'
                  }`}
                >
                  <c.icon size={14} /> {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Unidad de consumo + stock ideal */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-navy-500 mb-1">Unidad de consumo</label>
              <input
                type="text"
                value={unit}
                onChange={e => { setUnit(e.target.value); setError(null) }}
                placeholder="kg, unidad, caja..."
                className="w-full px-3 py-2 rounded-lg border border-navy-200 text-sm focus:outline-none focus:border-gold-400"
              />
              <p className="text-[10px] text-navy-400 mt-0.5">Cómo se cuenta el stock y se sacan salidas</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-navy-500 mb-1">Stock ideal ({unit || 'u.'})</label>
              <input
                type="number"
                value={stockIdeal}
                onChange={e => { setStockIdeal(e.target.value); setError(null) }}
                min={0}
                step={0.5}
                className="w-full px-3 py-2 rounded-lg border border-navy-200 text-sm focus:outline-none focus:border-gold-400"
              />
            </div>
          </div>

          {/* Stock inicial (solo nuevo) */}
          {isNew && (
            <div>
              <label className="block text-xs font-semibold text-navy-500 mb-1">Stock inicial ({unit || 'u.'})</label>
              <input
                type="number"
                value={initialStock}
                onChange={e => setInitialStock(e.target.value)}
                min={0}
                step={0.5}
                className="w-full px-3 py-2 rounded-lg border border-navy-200 text-sm focus:outline-none focus:border-gold-400"
              />
            </div>
          )}

          {/* Formato de compra */}
          <div className="rounded-lg border border-navy-100 p-3 bg-navy-50/40">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={hasPack}
                onChange={e => { setHasPack(e.target.checked); setError(null) }}
                className="w-4 h-4 accent-gold-500"
              />
              <span className="text-sm font-semibold text-navy-700 flex items-center gap-1.5">
                <Package size={14} className="text-indigo-500" />
                Se compra en otro formato
              </span>
            </label>
            {hasPack && (
              <>
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <label className="block text-xs font-semibold text-navy-500 mb-1">Unidad de compra</label>
                    <input
                      type="text"
                      value={packUnit}
                      onChange={e => { setPackUnit(e.target.value); setError(null) }}
                      placeholder="bolsa, caja..."
                      className="w-full px-3 py-2 rounded-lg border border-navy-200 text-sm focus:outline-none focus:border-gold-400"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-navy-500 mb-1">Trae ({unit || 'u.'})</label>
                    <input
                      type="number"
                      value={packSize}
                      onChange={e => { setPackSize(e.target.value); setError(null) }}
                      min={2}
                      step={1}
                      className="w-full px-3 py-2 rounded-lg border border-navy-200 text-sm focus:outline-none focus:border-gold-400"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-indigo-600 mt-2">
                  Se pide y recibe en <b>{packUnit || 'pack'}</b>. 1 {packUnit || 'pack'} = {packSize || '?'} {unit || 'u.'}.
                </p>
              </>
            )}
          </div>

          {/* Proveedor */}
          <div>
            <label className="block text-xs font-semibold text-navy-500 mb-1">Proveedor</label>
            <select
              value={supplierId}
              onChange={e => setSupplierId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-navy-200 text-sm focus:outline-none focus:border-gold-400 bg-white"
            >
              <option value="">Sin proveedor</option>
              {suppliers.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
        </div>

        {/* Footer */}
        <div className="p-5 pt-3 border-t border-navy-100 bg-cream/50 flex gap-2">
          {!isNew && onDelete && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-3 rounded-xl text-red-600 hover:bg-red-50 border border-red-200 transition-colors shrink-0"
              title="Borrar artículo"
            >
              <Trash2 size={18} />
            </button>
          )}
          <button
            onClick={handleSave}
            className="flex-1 py-3 rounded-xl bg-gold-400 text-navy-900 font-bold text-sm hover:bg-gold-500 transition-colors"
          >
            {isNew ? 'Crear artículo' : 'Guardar cambios'}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title="Borrar artículo"
        message={`Se va a quitar "${item?.name}" del depósito. Los movimientos históricos se conservan.`}
        onConfirm={() => { setConfirmDelete(false); onDelete?.() }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  )
}
