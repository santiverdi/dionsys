import { useState } from 'react'
import { BadgeDollarSign, ChevronDown, ChevronUp, Plus, Save, Trash2, X } from 'lucide-react'
import { useTarifas } from '../context/TarifasContext'
import type { TarifaPeriodo } from '../lib/tarifas'
import { formatMontoCurrency } from '../utils/validators'

// Editor de las tarifas pactadas (solo admin). El control de caja cruza cada
// cobro contra estos valores: mantenerlos al día cuando cambian los precios.
export default function TarifasEditor() {
  const { tarifas, saveTarifas } = useTarifas()
  const [open, setOpen] = useState(false)
  // null = viendo lo guardado; con valor = editando (se guarda con el botón).
  const [draft, setDraft] = useState<TarifaPeriodo[] | null>(null)

  const items = draft ?? tarifas
  const editing = draft !== null

  function edit(idx: number, patch: Partial<TarifaPeriodo>) {
    const base = draft ?? tarifas.map(t => ({ ...t, single: { ...t.single }, porPersona: { ...t.porPersona } }))
    setDraft(base.map((t, i) => (i === idx ? { ...t, ...patch } : t)))
  }

  function addPeriodo() {
    const base = draft ?? [...tarifas]
    const last = base[base.length - 1]
    setDraft([...base, {
      desde: '', hasta: '',
      single: { ...(last?.single ?? { lista: 0, efectivo: 0 }) },
      porPersona: { ...(last?.porPersona ?? { lista: 0, efectivo: 0 }) },
    }])
  }

  function removePeriodo(idx: number) {
    setDraft((draft ?? [...tarifas]).filter((_, i) => i !== idx))
  }

  const valido = items.every(t =>
    t.desde && t.hasta && t.desde <= t.hasta &&
    t.single.lista > 0 && t.single.efectivo > 0 && t.porPersona.lista > 0 && t.porPersona.efectivo > 0)

  const num = (v: string) => Math.max(0, Math.round(Number(v) || 0))
  const inputCls = 'w-full rounded-lg border border-navy-200 px-2 py-1.5 text-xs text-navy-800 focus:outline-none focus:border-gold-400'

  return (
    <div className="bg-white rounded-xl border border-navy-100 mb-4">
      <button onClick={() => setOpen(!open)} className="w-full flex items-center justify-between p-3">
        <span className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-navy-500">
          <BadgeDollarSign size={15} className="text-gold-600" /> Tarifas pactadas
        </span>
        <span className="flex items-center gap-2 text-xs text-navy-400">
          {!open && tarifas.length > 0 && (
            <span className="hidden sm:inline">
              {tarifas.map(t => `${t.desde.slice(8)}/${t.desde.slice(5, 7)}–${t.hasta.slice(8)}/${t.hasta.slice(5, 7)}`).join(' · ')}
            </span>
          )}
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3">
          <p className="text-[11px] text-navy-400 mb-2">
            El sistema cruza cada cobro de caja contra estas tarifas (por noche; la single es fija y de la doble
            a la quíntuple es por persona). Cuando cambien los precios, actualizalas acá.
          </p>

          <div className="space-y-3">
            {items.map((t, i) => (
              <div key={i} className="rounded-lg border border-navy-100 p-2.5">
                <div className="flex items-center gap-2 mb-2">
                  <input type="date" value={t.desde} onChange={e => edit(i, { desde: e.target.value })} className={inputCls} />
                  <span className="text-xs text-navy-400 shrink-0">al</span>
                  <input type="date" value={t.hasta} onChange={e => edit(i, { hasta: e.target.value })} className={inputCls} />
                  <button onClick={() => removePeriodo(i)} className="p-1.5 rounded-lg text-navy-400 hover:text-red-500 hover:bg-red-50 shrink-0" title="Quitar período">
                    <Trash2 size={14} />
                  </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {([
                    ['Single', t.single.lista, (v: number) => edit(i, { single: { ...t.single, lista: v } })],
                    ['Single efectivo', t.single.efectivo, (v: number) => edit(i, { single: { ...t.single, efectivo: v } })],
                    ['Por persona', t.porPersona.lista, (v: number) => edit(i, { porPersona: { ...t.porPersona, lista: v } })],
                    ['Por persona efectivo', t.porPersona.efectivo, (v: number) => edit(i, { porPersona: { ...t.porPersona, efectivo: v } })],
                  ] as const).map(([label, value, set]) => (
                    <label key={label} className="block">
                      <span className="text-[10px] uppercase text-navy-500">{label}</span>
                      <input
                        type="number" min={0} step={500} value={value || ''}
                        onChange={e => set(num(e.target.value))}
                        className={inputCls}
                      />
                    </label>
                  ))}
                </div>
                <label className="flex items-center gap-2 mt-2 text-xs text-navy-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!t.puedeHaberMasDescuento}
                    onChange={e => edit(i, { puedeHaberMasDescuento: e.target.checked || undefined })}
                  />
                  Puede haber descuentos mejores (un cobro menor se avisa como “a confirmar”, no como imperfección)
                </label>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 mt-3">
            <button onClick={addPeriodo} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-navy-200 text-xs font-semibold text-navy-600 hover:bg-navy-50">
              <Plus size={14} /> Agregar período
            </button>
            {editing && (
              <>
                <button
                  onClick={() => { if (draft && valido) { saveTarifas(draft); setDraft(null) } }}
                  disabled={!valido}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold ${
                    valido ? 'bg-navy-800 text-cream hover:bg-navy-700' : 'bg-navy-100 text-navy-400 cursor-not-allowed'
                  }`}
                >
                  <Save size={14} /> Guardar tarifas
                </button>
                <button onClick={() => setDraft(null)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-navy-500 hover:bg-navy-50">
                  <X size={14} /> Cancelar
                </button>
              </>
            )}
          </div>
          {!valido && editing && (
            <p className="text-[11px] text-red-600 mt-1.5">Cada período necesita fechas (desde ≤ hasta) y los cuatro precios mayores a cero.</p>
          )}

          {/* Resumen legible de lo guardado */}
          {!editing && tarifas.length > 0 && (
            <ul className="text-[11px] text-navy-500 mt-3 space-y-0.5">
              {tarifas.map((t, i) => (
                <li key={i}>
                  {t.desde} al {t.hasta}: single {formatMontoCurrency(t.single.lista)} ({formatMontoCurrency(t.single.efectivo)} ef.) ·
                  por persona {formatMontoCurrency(t.porPersona.lista)} ({formatMontoCurrency(t.porPersona.efectivo)} ef.)
                  {t.puedeHaberMasDescuento ? ' · admite más descuento' : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
