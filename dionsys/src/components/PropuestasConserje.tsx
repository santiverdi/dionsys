import { useCallback, useEffect, useState } from 'react'
import { Lightbulb, Send } from 'lucide-react'
import type { Employee } from '../types'
import {
  avisarCambioPropuestas, crearPropuesta, errorDePropuesta, misPropuestas, resumenPropuesta, type EstadoPropuesta, type Propuesta,
} from '../lib/propuestas'

// Al pie del calendario de Tarifas, para quien NO es el dueño: proponer un
// precio o una promo para unas fechas, y ver cómo quedaron las propuestas.

const inputCls = 'w-full px-2 py-1.5 rounded-lg border border-navy-200 text-sm'
const labelCls = 'block text-xs font-medium text-navy-500 mb-1'
const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'))

const ESTADO: Record<EstadoPropuesta, { texto: string; cls: string }> = {
  pendiente: { texto: 'Pendiente', cls: 'bg-amber-100 text-amber-800' },
  aplicada: { texto: 'Aplicada', cls: 'bg-emerald-100 text-emerald-800' },
  rechazada: { texto: 'Rechazada', cls: 'bg-navy-100 text-navy-700' },
}

export default function PropuestasConserje({ employee, hoy, desdeSugerido, hastaSugerido }: {
  employee: Employee | null
  hoy: string
  desdeSugerido?: string | null
  hastaSugerido?: string | null
}) {
  const [abierto, setAbierto] = useState(false)
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [precio, setPrecio] = useState('')
  const [promo, setPromo] = useState('')
  const [motivo, setMotivo] = useState('')
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; msg: string } | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [mias, setMias] = useState<Propuesta[]>([])

  const cargar = useCallback(() => { void misPropuestas(employee).then(r => setMias(r.propuestas)) }, [employee])
  useEffect(() => { cargar() }, [cargar])

  function abrir() {
    setDesde(desdeSugerido && desdeSugerido >= hoy ? desdeSugerido : hoy)
    setHasta(hastaSugerido && hastaSugerido >= hoy ? hastaSugerido : (desdeSugerido && desdeSugerido >= hoy ? desdeSugerido : hoy))
    setEstado(null)
    setAbierto(true)
  }

  async function enviar() {
    const nueva = { desde, hasta, precio: precio.trim() ? num(precio) : null, promo, motivo }
    const e = errorDePropuesta(nueva, hoy)
    if (e) return setEstado({ tipo: 'error', msg: e })
    setEnviando(true)
    const r = await crearPropuesta(employee, nueva)
    setEnviando(false)
    if (r.error) return setEstado({ tipo: 'error', msg: r.error })
    setEstado({ tipo: 'ok', msg: 'Enviada. El dueño la va a revisar.' })
    setPrecio('')
    setPromo('')
    setMotivo('')
    setAbierto(false)
    avisarCambioPropuestas()
    cargar()
  }

  return (
    <section className="mt-4 bg-white rounded-xl border border-navy-100 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold text-navy-800"><Lightbulb size={17} /> Propuestas</h3>
        {!abierto && (
          <button onClick={abrir} className="px-3 py-1.5 rounded-lg border border-navy-200 text-navy-700 text-sm font-medium">
            Proponer cambio
          </button>
        )}
      </div>
      <p className="text-xs text-navy-500 mt-1">
        ¿Ves que un precio no cierra o que convendría una promo? Proponéselo al dueño con el motivo.
      </p>

      {abierto && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
          <label><span className={labelCls}>Desde (noche)</span>
            <input type="date" className={inputCls} value={desde} min={hoy} onChange={e => setDesde(e.target.value)} />
          </label>
          <label><span className={labelCls}>Hasta (noche)</span>
            <input type="date" className={inputCls} value={hasta} min={desde || hoy} onChange={e => setHasta(e.target.value)} />
          </label>
          <label><span className={labelCls}>Precio por persona por noche ($, opcional)</span>
            <input className={inputCls} inputMode="numeric" value={precio} onChange={e => setPrecio(e.target.value)} />
          </label>
          <label><span className={labelCls}>Promo (opcional)</span>
            <input className={inputCls} value={promo} maxLength={300} placeholder="Ej.: 3 noches por 2 de lunes a jueves" onChange={e => setPromo(e.target.value)} />
          </label>
          <label className="sm:col-span-2"><span className={labelCls}>Motivo</span>
            <textarea className={inputCls} rows={2} maxLength={500} value={motivo} placeholder="Ej.: el Guerrero está a $60.000 y perdimos 3 consultas" onChange={e => setMotivo(e.target.value)} />
          </label>
          <div className="sm:col-span-2 flex gap-2">
            <button disabled={enviando} onClick={() => void enviar()} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-800 text-cream text-sm font-medium disabled:opacity-50">
              <Send size={15} /> {enviando ? 'Enviando…' : 'Enviar al dueño'}
            </button>
            <button onClick={() => setAbierto(false)} className="px-3 py-1.5 rounded-lg border border-navy-200 text-navy-700 text-sm font-medium">Cancelar</button>
          </div>
        </div>
      )}
      {estado && <p className={`text-sm mt-2 ${estado.tipo === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>{estado.msg}</p>}

      {mias.length > 0 && (
        <div className="mt-3 border-t border-navy-100 pt-3">
          <p className="text-xs font-medium text-navy-500 mb-1.5">Mis propuestas</p>
          <ul className="space-y-2">
            {mias.slice(0, 10).map(p => (
              <li key={p.id} className="text-sm">
                <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mr-2 ${ESTADO[p.estado].cls}`}>{ESTADO[p.estado].texto}</span>
                <span className="text-navy-800">{resumenPropuesta(p)}</span>
                {p.respuesta && <p className="text-xs text-navy-600 mt-0.5 ml-1">↳ {p.resuelto_por ?? 'Dueño'}: {p.respuesta}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
