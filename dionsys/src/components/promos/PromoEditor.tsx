import { useState } from 'react'
import { Save, X } from 'lucide-react'
import { errorDePromo, type Promo } from '../../lib/promos'
import { NOMBRE_TIPO } from '../../lib/promosPantalla'

// Formulario de UNA promo (crear o editar). No guarda: devuelve la promo a la
// pantalla, que muestra la vista previa y los avisos antes de guardar la lista.

const inputCls = 'w-full px-2 py-1.5 rounded-lg border border-navy-200 text-sm'
const labelCls = 'block text-xs font-medium text-navy-500 mb-1'

const num = (s: string) => Number(s.replace(',', '.'))
const pctTexto = (f: number) => (Math.round(f * 1000) / 10).toLocaleString('es-AR')

export default function PromoEditor({ inicial, onListo, onCancelar }: {
  inicial: Promo
  onListo: (p: Promo) => void
  onCancelar: () => void
}) {
  const [p, setP] = useState<Promo>(inicial)
  const [maxTexto, setMaxTexto] = useState(inicial.maxNoches === null ? '' : String(inicial.maxNoches))
  const [pct, setPct] = useState(p.tipo === 'noches' ? '' : pctTexto(p.porcentaje))
  const [error, setError] = useState<string | null>(null)
  const set = (cambios: Partial<Promo>) => setP(prev => ({ ...prev, ...cambios }) as Promo)

  function listo() {
    const final = {
      ...p,
      nombre: p.nombre.trim(),
      maxNoches: maxTexto.trim() === '' ? null : num(maxTexto),
      ...(p.tipo === 'noches' ? {} : { porcentaje: num(pct) / 100 }),
    } as Promo
    const e = errorDePromo(final)
    if (e) {
      setError(`Revisá: ${e}.`)
      return
    }
    onListo(final)
  }

  return (
    <section className="bg-white rounded-xl border-2 border-gold-300 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-navy-800">{NOMBRE_TIPO[p.tipo]}</h3>
        <button onClick={onCancelar} className="p-1 rounded-lg hover:bg-navy-50" aria-label="Cancelar"><X size={18} /></button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="sm:col-span-2"><span className={labelCls}>Nombre (solo lo ves vos)</span>
          <input className={inputCls} value={p.nombre} onChange={e => set({ nombre: e.target.value })} />
        </label>

        <label><span className={labelCls}>{p.tipo === 'noches' ? 'Llegada desde' : 'Noches con descuento desde'}</span>
          <input type="date" className={inputCls} value={p.desde} onChange={e => set({ desde: e.target.value })} />
        </label>
        <label><span className={labelCls}>hasta</span>
          <input type="date" className={inputCls} value={p.hasta} onChange={e => set({ hasta: e.target.value })} />
        </label>

        <label><span className={labelCls}>Estadía de al menos (noches)</span>
          <input className={inputCls} inputMode="numeric" value={String(p.minNoches)} onChange={e => set({ minNoches: num(e.target.value) })} />
        </label>
        <label><span className={labelCls}>y como mucho (vacío = sin tope)</span>
          <input className={inputCls} inputMode="numeric" value={maxTexto} onChange={e => setMaxTexto(e.target.value)} />
        </label>

        {p.tipo === 'noches' && (
          <label className="sm:col-span-2"><span className={labelCls}>Última noche</span>
            <select className={inputCls} value={p.ultima} onChange={e => set({ ultima: e.target.value as 'mitad' | 'gratis' })}>
              <option value="mitad">A mitad de precio</option>
              <option value="gratis">Gratis</option>
            </select>
          </label>
        )}

        {p.tipo !== 'noches' && (
          <label><span className={labelCls}>Descuento (%)</span>
            <input className={inputCls} inputMode="decimal" value={pct} onChange={e => setPct(e.target.value)} />
          </label>
        )}
        {p.tipo === 'anticipada' && (
          <label><span className={labelCls}>Reservando con al menos (días antes)</span>
            <input className={inputCls} inputMode="numeric" value={String(p.diasAnticipacion)} onChange={e => set({ diasAnticipacion: num(e.target.value) })} />
          </label>
        )}
        {p.tipo === 'ultimo_momento' && (
          <label><span className={labelCls}>Faltando menos de (días)</span>
            <input className={inputCls} inputMode="numeric" value={String(p.diasMaximos)} onChange={e => set({ diasMaximos: num(e.target.value) })} />
          </label>
        )}

        <label className="sm:col-span-2"><span className={labelCls}>
          Texto en el mensaje al huésped{p.tipo !== 'noches' && ' ({porcentaje} = el número)'}
        </span>
          <input className={inputCls} value={p.texto} onChange={e => set({ texto: e.target.value })} />
        </label>
        {p.tipo === 'anticipada' && (
          <>
            <label className="sm:col-span-2"><span className={labelCls}>
              Texto si solo algunas noches tienen descuento ({'{rango}'} = "desde el 04/01", "hasta el 31/01"…)
            </span>
              <input className={inputCls} value={p.textoParcial} onChange={e => set({ textoParcial: e.target.value })} />
            </label>
            <label className="sm:col-span-2"><span className={labelCls}>Validez ({'{fecha}'} = llegada menos los días de anticipación)</span>
              <input className={inputCls} value={p.validez} onChange={e => set({ validez: e.target.value })} />
            </label>
          </>
        )}

        <label className="flex items-center gap-2 text-sm text-navy-700">
          <input type="checkbox" checked={p.seSuma} onChange={e => set({ seSuma: e.target.checked })} />
          Se suma con otras promos
        </label>
        <label className="flex items-center gap-2 text-sm text-navy-700">
          <input type="checkbox" checked={p.activa} onChange={e => set({ activa: e.target.checked })} />
          Activa
        </label>
      </div>

      {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
      <div className="flex gap-2 mt-4">
        <button onClick={listo} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-800 text-cream text-sm font-medium">
          <Save size={15} /> Ver vista previa y guardar
        </button>
        <button onClick={onCancelar} className="px-3 py-1.5 rounded-lg border border-navy-200 text-navy-700 text-sm font-medium">Cancelar</button>
      </div>
    </section>
  )
}
