import { useEffect, useState } from 'react'
import { CloudDownload, CloudUpload, Plus, Trash2 } from 'lucide-react'
import { persist, useCloudSync } from '../lib/cloudStore'
import {
  DIAS_SEMANA, PAXES, expandirRango, fetchTarifarioPublicado, normalizarTarifario,
  publicarTarifario, tarifarioVacio, validarTarifario,
  type FindeLargo, type PromocionPublica, type TarifarioPublico, type TemporadaPublica,
} from '../lib/landing'

// Borrador local del tarifario (sincronizado entre dispositivos). Lo publicado
// vive en Supabase (tarifario_publico) y solo cambia al tocar "Publicar".
const LS_DRAFT = 'dionsys_landing_tarifario'

const money = (n: number) => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })

function temporadaNueva(): TemporadaPublica {
  return {
    nombre: '', desde: '', hasta: '',
    tarifas: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, tarifasCaras: null,
    diasCaros: [5, 6], efectivoCaro: 0.10, efectivoBarato: 0.10, minNoches: 1, sena: 0,
  }
}

// Porcentajes: en pantalla se cargan como enteros (10 = 10%), en el JSON viajan
// como fracción (0.10), que es lo que espera el script de la landing.
const aPct = (x: number) => String(Math.round((Number(x) || 0) * 100))
const dePct = (s: string) => (Number(s) || 0) / 100

const inputCls = 'w-full px-2 py-1.5 rounded-lg border border-navy-200 text-sm'
const labelCls = 'block text-xs font-medium text-navy-500 mb-1'

function TarifasFila({ titulo, tarifas, onChange }: {
  titulo: string
  tarifas: Record<number, number>
  onChange: (t: Record<number, number>) => void
}) {
  return (
    <div>
      <p className={labelCls}>{titulo}</p>
      <div className="grid grid-cols-5 gap-2">
        {PAXES.map(p => (
          <div key={p}>
            <span className="block text-[11px] text-navy-400 mb-0.5">{p === 1 ? '1 (single)' : `${p} pers.`}</span>
            <input
              type="number" min={0} step={500} value={tarifas[p] || ''}
              onChange={e => onChange({ ...tarifas, [p]: Number(e.target.value) || 0 })}
              className={inputCls}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

export default function LandingTarifarioEditor() {
  const [draft, setDraft] = useState<TarifarioPublico | null>(() => {
    const raw = localStorage.getItem(LS_DRAFT)
    return raw ? JSON.parse(raw) : null
  })
  // Texto del campo cuotas mientras se edita; null = mostrar lo del borrador.
  const [cuotasTxt, setCuotasTxt] = useState<string | null>(null)
  const [errores, setErrores] = useState<string[]>([])
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; msg: string } | null>(null)
  const [publicando, setPublicando] = useState(false)
  // Bloqueadas: se cargan de a un día o por rango.
  const [bloqDesde, setBloqDesde] = useState('')
  const [bloqHasta, setBloqHasta] = useState('')

  useCloudSync<TarifarioPublico>(LS_DRAFT, setDraft)

  // Sin borrador local: arrancamos desde lo que ya está publicado en la nube.
  useEffect(() => {
    if (draft) return
    void fetchTarifarioPublicado().then(({ tarifario }) => {
      setDraft(prev => prev ?? tarifario ?? tarifarioVacio())
    })
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (draft) persist(LS_DRAFT, draft)
  }, [draft])

  if (!draft) return <p className="text-sm text-navy-400 py-8 text-center">Cargando tarifario…</p>

  const upd = (patch: Partial<TarifarioPublico>) => setDraft({ ...draft, ...patch })
  const updConfig = (patch: Partial<TarifarioPublico['config']>) => upd({ config: { ...draft.config, ...patch } })
  const updTemporada = (i: number, patch: Partial<TemporadaPublica>) =>
    upd({ temporadas: draft.temporadas.map((t, j) => (j === i ? { ...t, ...patch } : t)) })
  const updFinde = (i: number, patch: Partial<FindeLargo>) =>
    upd({ findesLargos: draft.findesLargos.map((f, j) => (j === i ? { ...f, ...patch } : f)) })
  const promos = draft.promociones ?? []
  const updPromo = (i: number, patch: Partial<PromocionPublica>) =>
    upd({ promociones: promos.map((p, j) => (j === i ? { ...p, ...patch } : p)) })

  function commitCuotas() {
    if (cuotasTxt === null) return
    const cuotas = cuotasTxt.split(/[,\s]+/).map(Number).filter(n => Number.isInteger(n) && n > 0)
    setCuotasTxt(null)
    updConfig({ cuotas })
  }

  async function traerPublicado() {
    if (!confirm('Esto pisa el borrador de este editor con lo que está publicado en la landing. ¿Seguir?')) return
    const { tarifario, error } = await fetchTarifarioPublicado()
    if (error || !tarifario) {
      setEstado({ tipo: 'error', msg: error ?? 'No hay nada publicado todavía.' })
      return
    }
    setDraft(tarifario)
    setEstado({ tipo: 'ok', msg: 'Borrador reemplazado por lo publicado.' })
  }

  async function publicar() {
    if (!draft) return
    const problemas = validarTarifario(draft)
    setErrores(problemas)
    setEstado(null)
    if (problemas.length) return
    setPublicando(true)
    const { error } = await publicarTarifario(draft)
    setPublicando(false)
    if (error) {
      setEstado({ tipo: 'error', msg: `Supabase rechazó la publicación: ${error}. Si es un tema de permisos, corré scripts/landing-supabase.sql.` })
      return
    }
    setDraft(normalizarTarifario(draft))
    setEstado({ tipo: 'ok', msg: 'Publicado. La landing lo muestra en la próxima visita (los que ya la tenían abierta pueden tardar hasta 30 minutos por el caché).' })
  }

  function agregarBloqueadas() {
    const dias = expandirRango(bloqDesde, bloqHasta || bloqDesde)
    if (!dias.length) return
    upd({ bloqueadas: [...new Set([...draft!.bloqueadas, ...dias])].sort() })
    setBloqDesde(''); setBloqHasta('')
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-navy-500">
          Esto es lo que cobra el calculador público. Los cambios quedan en borrador hasta tocar <b>Publicar</b>.
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => void traerPublicado()} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border border-navy-200 text-navy-600 hover:bg-navy-50">
            <CloudDownload size={16} /> Traer lo publicado
          </button>
          <button onClick={() => void publicar()} disabled={publicando} className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm bg-navy-800 text-cream font-medium hover:bg-navy-700 disabled:opacity-50">
            <CloudUpload size={16} /> {publicando ? 'Publicando…' : 'Publicar en la landing'}
          </button>
        </div>
      </div>

      {errores.length > 0 && (
        <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
          <p className="font-medium mb-1">No se publicó — revisá esto:</p>
          <ul className="list-disc pl-5 space-y-0.5">{errores.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}
      {estado && (
        <div className={`p-3 rounded-lg border text-sm ${estado.tipo === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {estado.msg}
        </div>
      )}

      {/* Vigencia y condiciones generales */}
      <section className="bg-white rounded-xl border border-navy-100 p-4">
        <h3 className="font-bold text-navy-800 mb-3">Vigencia y condiciones</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className={labelCls}>Tarifas desde</label>
            <input type="date" value={draft.config.vigencia.desde} onChange={e => updConfig({ vigencia: { ...draft.config.vigencia, desde: e.target.value } })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Tarifas hasta</label>
            <input type="date" value={draft.config.vigencia.hasta} onChange={e => updConfig({ vigencia: { ...draft.config.vigencia, hasta: e.target.value } })} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Tope por persona/noche</label>
            <input type="number" min={0} step={1000} value={draft.config.tope_por_persona || ''} onChange={e => updConfig({ tope_por_persona: Number(e.target.value) || 0 })} className={inputCls} />
            <p className="text-[11px] text-navy-400 mt-0.5">Con recargos nunca se cobra más de {money(draft.config.tope_por_persona)} por persona.</p>
          </div>
          <div>
            <label className={labelCls}>Cuotas sin interés</label>
            <input type="text" value={cuotasTxt ?? draft.config.cuotas.join(', ')} onChange={e => setCuotasTxt(e.target.value)} onBlur={commitCuotas} placeholder="3, 6" className={inputCls} />
          </div>
        </div>
      </section>

      {/* Temporadas */}
      <section className="bg-white rounded-xl border border-navy-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-navy-800">Temporadas</h3>
          <button onClick={() => upd({ temporadas: [...draft.temporadas, temporadaNueva()] })} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border border-navy-200 text-navy-600 hover:bg-navy-50">
            <Plus size={15} /> Agregar temporada
          </button>
        </div>
        <p className="text-xs text-navy-400 mb-4">Tienen que cubrir toda la vigencia, sin huecos ni superposiciones. El precio de 1 persona es por habitación (single); de 2 a 5 es por persona por noche.</p>
        <div className="space-y-4">
          {draft.temporadas.map((t, i) => (
            <div key={i} className="border border-navy-100 rounded-lg p-3 space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className={labelCls}>Nombre</label>
                  <input type="text" value={t.nombre} onChange={e => updTemporada(i, { nombre: e.target.value })} placeholder="Baja / Alta / …" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Desde</label>
                  <input type="date" value={t.desde} onChange={e => updTemporada(i, { desde: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Hasta</label>
                  <input type="date" value={t.hasta} onChange={e => updTemporada(i, { hasta: e.target.value })} className={inputCls} />
                </div>
                <div className="flex items-end justify-end">
                  <button onClick={() => upd({ temporadas: draft.temporadas.filter((_, j) => j !== i) })} className="p-2 rounded-lg text-red-400 hover:bg-red-50" title="Eliminar temporada">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <TarifasFila titulo="Precio por noche" tarifas={t.tarifas} onChange={tarifas => updTemporada(i, { tarifas })} />

              <label className="flex items-center gap-2 text-sm text-navy-600">
                <input type="checkbox" checked={!!t.tarifasCaras} onChange={e => updTemporada(i, { tarifasCaras: e.target.checked ? { ...t.tarifas } : null })} />
                Los días caros tienen otro precio
              </label>
              {t.tarifasCaras && (
                <TarifasFila titulo="Precio por noche en días caros" tarifas={t.tarifasCaras} onChange={tarifasCaras => updTemporada(i, { tarifasCaras })} />
              )}

              <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
                <div>
                  <p className={labelCls}>Días caros</p>
                  <div className="flex gap-1.5">
                    {DIAS_SEMANA.map((d, dia) => (
                      <button
                        key={dia} type="button"
                        onClick={() => updTemporada(i, { diasCaros: t.diasCaros.includes(dia) ? t.diasCaros.filter(x => x !== dia) : [...t.diasCaros, dia].sort() })}
                        className={`px-2 py-1 rounded text-xs font-medium ${t.diasCaros.includes(dia) ? 'bg-navy-800 text-cream' : 'bg-navy-50 text-navy-500'}`}
                      >
                        {d.slice(0, 2)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="w-28">
                  <label className={labelCls}>% efect. día caro</label>
                  <input type="number" min={0} max={99} value={aPct(t.efectivoCaro)} onChange={e => updTemporada(i, { efectivoCaro: dePct(e.target.value) })} className={inputCls} />
                </div>
                <div className="w-28">
                  <label className={labelCls}>% efect. resto</label>
                  <input type="number" min={0} max={99} value={aPct(t.efectivoBarato)} onChange={e => updTemporada(i, { efectivoBarato: dePct(e.target.value) })} className={inputCls} />
                </div>
                <div className="w-28">
                  <label className={labelCls}>Mín. noches</label>
                  <input type="number" min={1} value={t.minNoches || ''} onChange={e => updTemporada(i, { minNoches: Number(e.target.value) || 0 })} className={inputCls} />
                </div>
                <div className="w-28">
                  <label className={labelCls}>% de seña</label>
                  <input type="number" min={0} max={99} value={aPct(t.sena)} onChange={e => updTemporada(i, { sena: dePct(e.target.value) })} className={inputCls} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Findes largos */}
      <section className="bg-white rounded-xl border border-navy-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-navy-800">Fines de semana largos</h3>
          <button onClick={() => upd({ findesLargos: [...draft.findesLargos, { n: '', desde: '', hasta: '', recargo: 0.20 }] })} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border border-navy-200 text-navy-600 hover:bg-navy-50">
            <Plus size={15} /> Agregar
          </button>
        </div>
        <p className="text-xs text-navy-400 mb-3">Esas fechas llevan un recargo sobre la tarifa de la temporada (y el descuento por efectivo baja al de día caro).</p>
        <div className="space-y-2">
          {draft.findesLargos.map((f, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-end">
              <div>
                <label className={labelCls}>Nombre</label>
                <input type="text" value={f.n} onChange={e => updFinde(i, { n: e.target.value })} placeholder="Carnaval" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Desde</label>
                <input type="date" value={f.desde} onChange={e => updFinde(i, { desde: e.target.value })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Hasta</label>
                <input type="date" value={f.hasta} onChange={e => updFinde(i, { hasta: e.target.value })} className={inputCls} />
              </div>
              <div className="w-24">
                <label className={labelCls}>% recargo</label>
                <input type="number" min={0} max={99} value={aPct(f.recargo)} onChange={e => updFinde(i, { recargo: dePct(e.target.value) })} className={inputCls} />
              </div>
              <button onClick={() => upd({ findesLargos: draft.findesLargos.filter((_, j) => j !== i) })} className="p-2 rounded-lg text-red-400 hover:bg-red-50" title="Eliminar">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Fechas bloqueadas */}
      <section className="bg-white rounded-xl border border-navy-100 p-4">
        <h3 className="font-bold text-navy-800 mb-1">Fechas sin disponibilidad</h3>
        <p className="text-xs text-navy-400 mb-3">La landing no deja pedir reserva sobre estos días.</p>
        <div className="flex flex-wrap items-end gap-2 mb-3">
          <div>
            <label className={labelCls}>Desde</label>
            <input type="date" value={bloqDesde} onChange={e => setBloqDesde(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Hasta (opcional)</label>
            <input type="date" value={bloqHasta} onChange={e => setBloqHasta(e.target.value)} className={inputCls} />
          </div>
          <button onClick={agregarBloqueadas} className="px-3 py-2 rounded-lg text-sm border border-navy-200 text-navy-600 hover:bg-navy-50">Bloquear</button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {draft.bloqueadas.map(d => (
            <span key={d} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-navy-50 text-navy-600 text-xs">
              {d.slice(8, 10)}/{d.slice(5, 7)}/{d.slice(0, 4)}
              <button onClick={() => upd({ bloqueadas: draft.bloqueadas.filter(x => x !== d) })} className="text-navy-400 hover:text-red-500" title="Desbloquear">×</button>
            </span>
          ))}
          {draft.bloqueadas.length === 0 && <span className="text-xs text-navy-400">Sin fechas bloqueadas.</span>}
        </div>
      </section>

      {/* Promociones (atajos "Fechas con buen precio") */}
      <section className="bg-white rounded-xl border border-navy-100 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-navy-800">Fechas con buen precio (atajos)</h3>
          <button onClick={() => upd({ promociones: [...promos, { titulo: '', diaInicio: 5, noches: 2, nota: '' }] })} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border border-navy-200 text-navy-600 hover:bg-navy-50">
            <Plus size={15} /> Agregar
          </button>
        </div>
        <p className="text-xs text-navy-400 mb-3">Los botones de sugerencia del calculador: la landing busca la próxima fecha libre que arranque ese día y arma la estadía. Si no cargás ninguno, la landing usa los suyos de fábrica.</p>
        <div className="space-y-2">
          {promos.map((p, i) => (
            <div key={i} className="grid grid-cols-2 sm:grid-cols-[1fr_auto_auto_1fr_auto] gap-2 items-end">
              <div>
                <label className={labelCls}>Título</label>
                <input type="text" value={p.titulo} onChange={e => updPromo(i, { titulo: e.target.value })} placeholder="Escapada de mitad de semana" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Empieza un</label>
                <select value={p.diaInicio} onChange={e => updPromo(i, { diaInicio: Number(e.target.value) })} className={inputCls}>
                  {DIAS_SEMANA.map((d, dia) => <option key={dia} value={dia}>{d}</option>)}
                </select>
              </div>
              <div className="w-24">
                <label className={labelCls}>Noches</label>
                <input type="number" min={1} value={p.noches || ''} onChange={e => updPromo(i, { noches: Number(e.target.value) || 0 })} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Nota (opcional)</label>
                <input type="text" value={p.nota ?? ''} onChange={e => updPromo(i, { nota: e.target.value })} placeholder="20% en efectivo" className={inputCls} />
              </div>
              <button onClick={() => upd({ promociones: promos.filter((_, j) => j !== i) })} className="p-2 rounded-lg text-red-400 hover:bg-red-50" title="Eliminar">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
