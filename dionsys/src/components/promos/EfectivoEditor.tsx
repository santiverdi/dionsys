import { useMemo, useState } from 'react'
import { Banknote, Save } from 'lucide-react'
import type { AjustesTarifa } from '../../lib/tarifasEspeciales'
import { costoEfectivo, dm, pct, rangosEfectivo, textoReservasMas } from '../../lib/promosPantalla'

// Descuento por pagar en efectivo, por rango de fechas. Escribe descEfectivo en
// cada noche de dionsys_tarifas_dia (la fuente de verdad); no toca el
// tarifario viejo de la landing. Solo vale en noches con precio en DionSys.

const inputCls = 'w-full px-2 py-1.5 rounded-lg border border-navy-200 text-sm'
const labelCls = 'block text-xs font-medium text-navy-500 mb-1'

export default function EfectivoEditor({ ajustes, hoy, onGuardar }: {
  ajustes: AjustesTarifa
  hoy: string
  /** Devuelve el error, o null si se guardó. */
  onGuardar: (desde: string, hasta: string, porcentaje: number) => Promise<string | null>
}) {
  const rangos = useMemo(() => rangosEfectivo(ajustes).filter(r => r.hasta >= hoy), [ajustes, hoy])
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [valor, setValor] = useState('10')
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; msg: string } | null>(null)

  async function guardar() {
    const p = Number(valor.replace(',', '.')) / 100
    if (!desde || !hasta || hasta < desde) return setEstado({ tipo: 'error', msg: 'Elegí las fechas (desde ≤ hasta).' })
    if (!(p >= 0 && p < 1)) return setEstado({ tipo: 'error', msg: 'El % tiene que estar entre 0 y 99.' })
    const error = await onGuardar(desde, hasta, p)
    setEstado(error ? { tipo: 'error', msg: error } : { tipo: 'ok', msg: 'Guardado.' })
  }

  function editar(r: { desde: string; hasta: string; porcentaje: number }) {
    setDesde(r.desde > hoy ? r.desde : hoy)
    setHasta(r.hasta)
    setValor((Math.round(r.porcentaje * 1000) / 10).toLocaleString('es-AR'))
    setEstado(null)
  }

  return (
    <section className="bg-white rounded-xl border border-navy-100 p-4">
      <h3 className="flex items-center gap-2 font-semibold text-navy-800 mb-1"><Banknote size={17} /> Efectivo</h3>
      <p className="text-xs text-navy-500 mb-3">
        Descuento pagando en efectivo, noche por noche. Es una alternativa: no se suma a ninguna promo (el huésped se queda con lo que más le convenga).
        Solo vale en noches con precio cargado en DionSys.
      </p>

      {rangos.length > 0 ? (
        <ul className="divide-y divide-navy-50 mb-4">
          {rangos.map(r => {
            const c = costoEfectivo(r.porcentaje)
            return (
              <li key={r.desde} className="py-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm text-navy-800">
                    <span className="font-semibold">{r.porcentaje > 0 ? pct(r.porcentaje) : 'Sin descuento'}</span>
                    {' '}· del {dm(r.desde)} al {dm(r.hasta)} <span className="text-navy-400">({r.noches} noches)</span>
                  </p>
                  {r.porcentaje > 0 && (
                    <p className="text-xs text-navy-500">Qué te cuesta: {pct(c.fraccion)} de cada reserva que paga en efectivo → {textoReservasMas(c.reservasMas)}.</p>
                  )}
                </div>
                <button onClick={() => editar(r)} className="text-xs px-2 py-1 rounded-lg border border-navy-200 text-navy-700">Cambiar</button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm text-navy-500 mb-4">No hay noches futuras con precio cargado.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <label><span className={labelCls}>Desde (noche)</span>
          <input type="date" className={inputCls} value={desde} min={hoy} onChange={e => setDesde(e.target.value)} />
        </label>
        <label><span className={labelCls}>Hasta (noche)</span>
          <input type="date" className={inputCls} value={hasta} min={desde || hoy} onChange={e => setHasta(e.target.value)} />
        </label>
        <label><span className={labelCls}>Descuento en efectivo (%)</span>
          <input className={inputCls} inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-3">
        <button onClick={() => void guardar()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-800 text-cream text-sm font-medium">
          <Save size={15} /> Ver vista previa y guardar
        </button>
        {estado && <span className={`text-sm ${estado.tipo === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>{estado.msg}</span>}
      </div>
    </section>
  )
}
