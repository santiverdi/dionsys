import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Inbox, X } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { guardarTarifa, useEsDuenoTarifasEstado } from '../lib/permisosTarifa'
import { useDatosTarifas } from '../lib/useDatosTarifas'
import { infoDia } from '../lib/tarifaDiaria'
import { KEY_AJUSTES_TARIFA } from '../lib/tarifasEspeciales'
import { avisosAlGuardarAjustes } from '../lib/proteccionesTarifa'
import { fechasEntre } from '../lib/promosPantalla'
import {
  aplicarPrecioPropuesta, avisarCambioPropuestas, listarPropuestas, resolverPropuesta, resumenPropuesta, singleSugerida,
  type Propuesta,
} from '../lib/propuestas'
import { useAvisosAlGuardar } from '../components/AvisosAlGuardar'

// Bandeja de propuestas de los conserjes: SOLO el dueño (lista, aplica y
// rechaza con su PIN, verificado en el servidor). Aplicar un precio lo guarda
// en las noches propuestas con los mismos avisos e historial que el calendario.

const inputCls = 'w-full px-2 py-1.5 rounded-lg border border-navy-200 text-sm'
const labelCls = 'block text-xs font-medium text-navy-500 mb-1'
const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'))
const fechaHora = (s: string) => new Date(s).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

type Accion = { id: number; tipo: 'aplicar' | 'marcar' | 'rechazar' }

export default function Propuestas() {
  const { employee } = useAuth()
  const esDueno = useEsDuenoTarifasEstado(employee)
  const d = useDatosTarifas()
  const { confirmar, dialogo } = useAvisosAlGuardar()
  const [propuestas, setPropuestas] = useState<Propuesta[]>([])
  const [error, setError] = useState<string | null>(null)
  const [accion, setAccion] = useState<Accion | null>(null)
  const [precio, setPrecio] = useState('')
  const [single, setSingle] = useState('')
  const [respuesta, setRespuesta] = useState('')
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; msg: string } | null>(null)
  const [verResueltas, setVerResueltas] = useState(false)

  const cargar = useCallback(() => {
    void listarPropuestas(employee).then(r => { setPropuestas(r.propuestas); setError(r.error) })
  }, [employee])
  useEffect(() => { if (esDueno) cargar() }, [esDueno, cargar])

  if (esDueno === null) return <div className="p-6 text-navy-500">Verificando permiso…</div>
  if (!esDueno) return <div className="p-6 text-navy-600">Esta pantalla es solo para el dueño.</div>

  const pendientes = propuestas.filter(p => p.estado === 'pendiente')
  const resueltas = propuestas.filter(p => p.estado !== 'pendiente')

  function abrir(p: Propuesta, tipo: Accion['tipo']) {
    setAccion({ id: p.id, tipo })
    setRespuesta('')
    setEstado(null)
    if (tipo === 'aplicar' && p.precio_propuesto) {
      setPrecio(String(p.precio_propuesto))
      setSingle(String(singleSugerida(p.precio_propuesto, d.protecciones.relacionSingle)))
    }
  }

  async function terminar(p: Propuesta, estadoNuevo: 'aplicada' | 'rechazada', historialId: number | null = null) {
    const e = await resolverPropuesta(employee, p.id, estadoNuevo, respuesta, historialId)
    if (e) return setEstado({ tipo: 'error', msg: e })
    setEstado({ tipo: 'ok', msg: estadoNuevo === 'aplicada' ? `Aplicada: ${resumenPropuesta(p)}.` : 'Rechazada.' })
    setAccion(null)
    avisarCambioPropuestas()
    cargar()
  }

  async function aplicarPrecio(p: Propuesta) {
    const t = d.tarifario
    if (!t) return setEstado({ tipo: 'error', msg: 'Falta el tarifario.' })
    const pp = num(precio), s = num(single)
    if (!(pp > 0) || !(s > 0)) return setEstado({ tipo: 'error', msg: 'Revisá el precio por persona y la single.' })
    const fechas = fechasEntre(p.desde, p.hasta)
    const nuevos = aplicarPrecioPropuesta(d.ajustes, fechas, pp, s, f => infoDia(f, 2, t, d.especiales).descEfectivo)
    const avisos = avisosAlGuardarAjustes(d.ajustes, nuevos, { tarifario: t, estadias: d.estadias, promos: d.promos, config: d.protecciones })
    if (!(await confirmar(avisos))) return
    const r = await guardarTarifa(employee, KEY_AJUSTES_TARIFA, nuevos, {
      motivo: `Propuesta #${p.id} de ${p.autor_nombre}${avisos.length ? ' (con avisos)' : ''}`,
    })
    if (r.error) return setEstado({ tipo: 'error', msg: r.error })
    await terminar(p, 'aplicada', r.historialId)
  }

  // Función (no componente) para que los campos no pierdan el foco al escribir.
  const tarjeta = (p: Propuesta) => {
    const abierta = accion?.id === p.id ? accion.tipo : null
    return (
      <div key={p.id} className="bg-white rounded-xl border border-navy-100 p-4">
        <p className="font-semibold text-navy-800">{resumenPropuesta(p)}</p>
        <p className="text-xs text-navy-500">{p.autor_nombre} · {fechaHora(p.creado_en)}</p>
        <p className="text-sm text-navy-700 mt-1">“{p.motivo}”</p>

        {p.estado !== 'pendiente' && (
          <p className={`text-xs mt-2 ${p.estado === 'aplicada' ? 'text-emerald-700' : 'text-navy-500'}`}>
            {p.estado === 'aplicada' ? 'Aplicada' : 'Rechazada'}{p.resuelto_en ? ` el ${fechaHora(p.resuelto_en)}` : ''}
            {p.respuesta ? ` — ${p.respuesta}` : ''}
          </p>
        )}

        {p.estado === 'pendiente' && !abierta && (
          <div className="flex flex-wrap gap-2 mt-3">
            {p.precio_propuesto !== null && (
              <button onClick={() => abrir(p, 'aplicar')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-800 text-cream text-sm font-medium">
                <Check size={15} /> Aplicar precio
              </button>
            )}
            {p.promo_propuesta && (
              <>
                <Link to="/promos" className="px-3 py-1.5 rounded-lg border border-navy-200 text-navy-700 text-sm font-medium">Ir a Promos</Link>
                <button onClick={() => abrir(p, 'marcar')} className="px-3 py-1.5 rounded-lg border border-navy-200 text-navy-700 text-sm font-medium">Marcar aplicada</button>
              </>
            )}
            <button onClick={() => abrir(p, 'rechazar')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-red-700 text-sm font-medium">
              <X size={15} /> Rechazar
            </button>
          </div>
        )}

        {abierta && (
          <div className="mt-3 border-t border-navy-100 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {abierta === 'aplicar' && (
              <>
                <label><span className={labelCls}>Precio por persona por noche ($)</span>
                  <input className={inputCls} inputMode="numeric" value={precio} onChange={e => setPrecio(e.target.value)} />
                </label>
                <label><span className={labelCls}>Single por noche ($)</span>
                  <input className={inputCls} inputMode="numeric" value={single} onChange={e => setSingle(e.target.value)} />
                </label>
              </>
            )}
            <label className="sm:col-span-2"><span className={labelCls}>Respuesta para {p.autor_nombre} (opcional)</span>
              <input className={inputCls} maxLength={500} value={respuesta} onChange={e => setRespuesta(e.target.value)} />
            </label>
            <div className="sm:col-span-2 flex gap-2">
              <button
                onClick={() => void (abierta === 'aplicar' ? aplicarPrecio(p) : terminar(p, abierta === 'marcar' ? 'aplicada' : 'rechazada'))}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${abierta === 'rechazar' ? 'bg-red-700 text-white' : 'bg-navy-800 text-cream'}`}
              >
                {abierta === 'aplicar' ? `Guardar el precio en ${fechasEntre(p.desde, p.hasta).length} noches` : abierta === 'marcar' ? 'Marcar aplicada' : 'Rechazar'}
              </button>
              <button onClick={() => setAccion(null)} className="px-3 py-1.5 rounded-lg border border-navy-200 text-navy-700 text-sm font-medium">Cancelar</button>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Inbox size={22} className="text-navy-700" />
        <h2 className="text-xl font-bold text-navy-800">Propuestas de los conserjes</h2>
      </div>
      {error && <p className="text-sm text-red-700">{error}</p>}
      {estado && <p className={`text-sm ${estado.tipo === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>{estado.msg}</p>}

      {pendientes.length === 0
        ? <p className="text-sm text-navy-500 bg-navy-50 rounded-xl p-3">No hay propuestas pendientes.</p>
        : pendientes.map(tarjeta)}

      {resueltas.length > 0 && (
        <div>
          <button onClick={() => setVerResueltas(v => !v)} className="text-sm text-navy-600 underline">
            {verResueltas ? 'Ocultar' : 'Ver'} resueltas ({resueltas.length})
          </button>
          {verResueltas && <div className="space-y-2 mt-2">{resueltas.map(tarjeta)}</div>}
        </div>
      )}
      {dialogo}
    </div>
  )
}
