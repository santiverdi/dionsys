import { useState } from 'react'
import { Pause, Pencil, Play, Plus, Save, Trash2, UtensilsCrossed, X } from 'lucide-react'
import { errorDeAgregado, margenDe, margenPct, nuevoAgregado, type Agregado } from '../../lib/agregados'
import { dm, pct } from '../../lib/promosPantalla'

// Agregados de pensión en la pantalla Promos (solo el dueño): precio y costo
// por persona por noche, fechas en que se ofrecen y el margen de cada uno.

const inputCls = 'w-full px-2 py-1.5 rounded-lg border border-navy-200 text-sm'
const labelCls = 'block text-xs font-medium text-navy-500 mb-1'
const money = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'))

function Formulario({ inicial, onListo, onCancelar }: {
  inicial: Agregado
  onListo: (a: Agregado) => Promise<string | null>
  onCancelar: () => void
}) {
  const [a, setA] = useState(inicial)
  const [precio, setPrecio] = useState(inicial.precioPorPersona ? String(inicial.precioPorPersona) : '')
  const [costo, setCosto] = useState(inicial.costoPorPersona ? String(inicial.costoPorPersona) : '')
  const [error, setError] = useState<string | null>(null)
  const set = (c: Partial<Agregado>) => setA(prev => ({ ...prev, ...c }))
  const vista: Agregado = { ...a, precioPorPersona: num(precio) || 0, costoPorPersona: num(costo) || 0 }

  async function listo() {
    const final = { ...vista, nombre: a.nombre.trim(), detalle: a.detalle.trim() }
    const e = errorDeAgregado(final)
    if (e) return setError(`Revisá: ${e}.`)
    setError(await onListo(final))
  }

  return (
    <div className="border-2 border-gold-300 rounded-xl p-3 mb-3">
      <div className="flex justify-end -mt-1 -mr-1">
        <button onClick={onCancelar} className="p-1 rounded-lg hover:bg-navy-50" aria-label="Cancelar"><X size={16} /></button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label><span className={labelCls}>Nombre (lo lee el huésped)</span>
          <input className={inputCls} value={a.nombre} onChange={e => set({ nombre: e.target.value })} />
        </label>
        <label><span className={labelCls}>Detalle (opcional, entre paréntesis)</span>
          <input className={inputCls} value={a.detalle} placeholder="cena con bebida" onChange={e => set({ detalle: e.target.value })} />
        </label>
        <label><span className={labelCls}>Precio por persona por noche ($)</span>
          <input className={inputCls} inputMode="numeric" value={precio} onChange={e => setPrecio(e.target.value)} />
        </label>
        <label><span className={labelCls}>Costo por persona por noche ($)</span>
          <input className={inputCls} inputMode="numeric" value={costo} onChange={e => setCosto(e.target.value)} />
        </label>
        <label><span className={labelCls}>Se ofrece desde (noche)</span>
          <input type="date" className={inputCls} value={a.desde} onChange={e => set({ desde: e.target.value })} />
        </label>
        <label><span className={labelCls}>hasta</span>
          <input type="date" className={inputCls} value={a.hasta} onChange={e => set({ hasta: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-sm text-navy-700">
          <input type="checkbox" checked={a.admitePromos} onChange={e => set({ admitePromos: e.target.checked })} />
          Le aplican las promos y el efectivo
        </label>
        <label className="flex items-center gap-2 text-sm text-navy-700">
          <input type="checkbox" checked={a.activo} onChange={e => set({ activo: e.target.checked })} />
          Activo
        </label>
      </div>
      {vista.precioPorPersona > 0 && (
        <p className="text-xs text-navy-600 mt-2">Margen: {money(margenDe(vista))} por persona por noche ({pct(margenPct(vista))}).</p>
      )}
      {error && <p className="text-sm text-red-700 mt-2">{error}</p>}
      <button onClick={() => void listo()} className="flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg bg-navy-800 text-cream text-sm font-medium">
        <Save size={15} /> Guardar
      </button>
    </div>
  )
}

export default function AgregadosEditor({ agregados, hoy, finTemporada, onGuardar }: {
  agregados: Agregado[]
  hoy: string
  finTemporada: string
  /** Guarda la lista completa; devuelve el error o null. */
  onGuardar: (lista: Agregado[], motivo: string) => Promise<string | null>
}) {
  const [editando, setEditando] = useState<{ a: Agregado; nuevo: boolean } | null>(null)

  async function listo(a: Agregado) {
    if (!editando) return null
    const lista = editando.nuevo ? [...agregados, a] : agregados.map(x => (x.id === a.id ? a : x))
    const error = await onGuardar(lista, `${editando.nuevo ? 'Nuevo agregado' : 'Editó el agregado'}: ${a.nombre}`)
    if (!error) setEditando(null)
    return error
  }

  return (
    <section className="bg-white rounded-xl border border-navy-100 p-4">
      <h3 className="flex items-center gap-2 font-semibold text-navy-800 mb-1"><UtensilsCrossed size={17} /> Agregados de pensión</h3>
      <p className="text-xs text-navy-500 mb-3">
        El conserje los suma a la cotización y el mensaje los muestra en una línea aparte. Por defecto se cobran enteros (sin promos ni efectivo).
        El costo y el margen solo los ves vos.
      </p>

      {editando && <Formulario key={editando.a.id} inicial={editando.a} onListo={listo} onCancelar={() => setEditando(null)} />}

      {agregados.length > 0 ? (
        <ul className="divide-y divide-navy-50 mb-3">
          {agregados.map(a => (
            <li key={a.id} className={`py-2 flex flex-wrap items-start justify-between gap-2 ${a.activo ? '' : 'opacity-60'}`}>
              <div>
                <p className="text-sm font-semibold text-navy-800">
                  {a.nombre}{a.detalle && <span className="font-normal text-navy-500"> ({a.detalle})</span>}
                  {!a.activo && <span className="ml-2 text-xs font-medium text-amber-700">pausado</span>}
                  {a.admitePromos && <span className="ml-2 text-xs font-medium text-navy-500">admite promos</span>}
                </p>
                <p className="text-xs text-navy-500">
                  {money(a.precioPorPersona)} p/p/noche · costo {money(a.costoPorPersona)} · del {dm(a.desde)} al {dm(a.hasta)}
                </p>
                <p className={`text-xs font-medium ${margenDe(a) > 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  Margen: {money(margenDe(a))} por persona por noche ({pct(margenPct(a))})
                </p>
              </div>
              <div className="flex gap-1">
                <button title="Editar" onClick={() => setEditando({ a, nuevo: false })} className="p-1.5 rounded-lg border border-navy-200"><Pencil size={15} /></button>
                <button
                  title={a.activo ? 'Pausar' : 'Activar'}
                  onClick={() => void onGuardar(agregados.map(x => (x.id === a.id ? { ...a, activo: !a.activo } : x)), `${a.activo ? 'Pausó' : 'Activó'} el agregado: ${a.nombre}`)}
                  className="p-1.5 rounded-lg border border-navy-200"
                >
                  {a.activo ? <Pause size={15} /> : <Play size={15} />}
                </button>
                <button
                  title="Borrar"
                  onClick={() => {
                    if (window.confirm(`¿Borrar "${a.nombre}"? Queda en el historial.`)) {
                      void onGuardar(agregados.filter(x => x.id !== a.id), `Borró el agregado: ${a.nombre}`)
                    }
                  }}
                  className="p-1.5 rounded-lg border border-red-200 text-red-700"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-navy-500 mb-3">Todavía no hay agregados.</p>
      )}

      <div className="flex flex-wrap gap-2">
        {['Media pensión', 'Pensión completa', ''].map(nombre => (
          <button
            key={nombre || 'otro'}
            onClick={() => setEditando({ a: nuevoAgregado(nombre, hoy, finTemporada), nuevo: true })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-navy-200 text-navy-700 text-sm font-medium"
          >
            <Plus size={15} /> {nombre || 'Otro'}
          </button>
        ))}
      </div>
    </section>
  )
}
