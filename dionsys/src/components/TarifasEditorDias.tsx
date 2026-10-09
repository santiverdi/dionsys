import { useEffect, useState } from 'react'
import { RotateCcw, Save, X } from 'lucide-react'
import type { TarifarioPublico } from '../lib/landing'
import { infoDia } from '../lib/tarifaDiaria'
import type { AjustesTarifa, TarifaEspecial } from '../lib/tarifasEspeciales'

// Panel del admin para cambiar el precio de las noches marcadas en el
// calendario de Recepción → Tarifas. Arranca con el precio que tiene hoy la
// primera noche marcada; al guardar, todas las marcadas quedan con ese precio.

const fmtDia = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`
const money = (n: number) => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })
const aNumero = (s: string) => Number(s.replace(/\D/g, '')) || 0

interface Props {
  fechas: string[]                // ordenadas
  tarifario: TarifarioPublico
  especiales: TarifaEspecial[]    // las vigentes, con los ajustes ya aplicados
  ajustes: AjustesTarifa
  onGuardar: (nuevos: AjustesTarifa) => void
  onCerrar: () => void
}

export default function TarifasEditorDias({ fechas, tarifario, especiales, ajustes, onGuardar, onCerrar }: Props) {
  const primera = fechas[0]
  const [porPersona, setPorPersona] = useState('')
  const [single, setSingle] = useState('')
  const [singleComoDoble, setSingleComoDoble] = useState(false)
  const [efectivo, setEfectivo] = useState('')

  // Al cambiar la primera noche marcada, el formulario toma su precio actual.
  useEffect(() => {
    if (!primera) return
    const doble = infoDia(primera, 2, tarifario, especiales)
    const uno = infoDia(primera, 1, tarifario, especiales)
    const pp = doble.precio ?? 0
    const s = uno.precio ?? 0
    setPorPersona(pp ? String(pp) : '')
    setSingle(s ? String(s) : '')
    setSingleComoDoble(pp > 0 && s === 2 * pp)
    setEfectivo(String(Math.round(doble.descEfectivo * 100)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [primera])

  if (!fechas.length) return null

  const pp = aNumero(porPersona)
  const s = singleComoDoble ? 2 * pp : aNumero(single)
  const ef = Math.min(100, aNumero(efectivo))
  const valido = pp > 0 && s > 0
  const conAjuste = fechas.filter(f => ajustes[f])

  function guardar() {
    if (!valido) return
    const nuevos = { ...ajustes }
    for (const f of fechas) nuevos[f] = { porPersona: pp, single: s, descEfectivo: ef / 100 }
    onGuardar(nuevos)
  }

  function volverAlOriginal() {
    const nuevos = { ...ajustes }
    for (const f of fechas) delete nuevos[f]
    onGuardar(nuevos)
  }

  const resumen = fechas.length <= 6
    ? fechas.map(fmtDia).join(', ')
    : `${fechas.length} noches, del ${fmtDia(fechas[0])} al ${fmtDia(fechas[fechas.length - 1])}`

  const input = 'w-full rounded-lg border border-navy-200 px-3 py-2 text-base font-bold text-navy-800 focus:outline-none focus:ring-2 focus:ring-gold-400'

  return (
    <div className="mb-4 p-4 bg-gold-50 rounded-xl border border-gold-300">
      <div className="flex items-start justify-between gap-2 mb-3">
        <p className="text-sm text-navy-700">
          Cambiar precio: <b>{resumen}</b>
        </p>
        <button onClick={onCerrar} className="text-navy-400 hover:text-navy-700" title="Desmarcar">
          <X size={18} />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label className="block">
          <span className="text-xs font-medium text-navy-500">Por persona (2 a 5)</span>
          <input inputMode="numeric" value={porPersona} onChange={e => setPorPersona(e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-navy-500">Single (habitación)</span>
          <input
            inputMode="numeric"
            value={singleComoDoble ? String(2 * pp) : single}
            onChange={e => setSingle(e.target.value)}
            disabled={singleComoDoble}
            className={`${input} disabled:bg-navy-50 disabled:text-navy-400`}
          />
          <span className="flex items-center gap-1.5 mt-1 text-xs text-navy-600">
            <input type="checkbox" checked={singleComoDoble} onChange={e => setSingleComoDoble(e.target.checked)} />
            Igual que la doble
          </span>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-navy-500">Descuento en efectivo (%)</span>
          <input inputMode="numeric" value={efectivo} onChange={e => setEfectivo(e.target.value)} className={input} />
        </label>
      </div>

      {valido && (
        <p className="text-xs text-navy-500 mt-2">
          Doble: {money(2 * pp)} la noche{ef > 0 ? ` (${money(Math.round(2 * pp * (1 - ef / 100)))} en efectivo)` : ''} · Single: {money(s)}
        </p>
      )}

      <div className="flex flex-wrap gap-2 mt-3">
        <button
          onClick={guardar}
          disabled={!valido}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-navy-800 text-cream text-sm font-bold disabled:opacity-40"
        >
          <Save size={15} /> Guardar {fechas.length === 1 ? '1 noche' : `${fechas.length} noches`}
        </button>
        {conAjuste.length > 0 && (
          <button
            onClick={volverAlOriginal}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-navy-200 bg-white text-navy-600 text-sm font-medium"
          >
            <RotateCcw size={15} /> Volver al precio original
          </button>
        )}
      </div>
    </div>
  )
}
