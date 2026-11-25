import { useMemo, useState } from 'react'
import { Copy, Info, Pause, Pencil, Play, Plus, Tag, Trash2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useEsDuenoTarifas, guardarTarifa } from '../lib/permisosTarifa'
import { useDatosTarifas } from '../lib/useDatosTarifas'
import { cotizarEstadia, hoyBuenosAires } from '../lib/tarifaDiaria'
import { KEY_AJUSTES_TARIFA, especialesConAjustes, type AjustesTarifa } from '../lib/tarifasEspeciales'
import { KEY_PROMOS, type Promo, type TipoPromoConfig } from '../lib/promos'
import { avisosAlGuardarAjustes, peorDescuento } from '../lib/proteccionesTarifa'
import {
  NOMBRE_TIPO, aplicarEfectivo, costoPromo, dm, duplicarPromo, ejemplosVistaPrevia, fechasEntre, nuevaPromo, pct,
  resumenPromo, textoReservasMas, type Contexto, type EjemploVistaPrevia,
} from '../lib/promosPantalla'
import { armarMensaje } from '../components/CotizacionMensaje'
import PromoEditor from '../components/promos/PromoEditor'
import EfectivoEditor from '../components/promos/EfectivoEditor'
import { useVistaPrevia, type FilaVistaPrevia } from '../components/promos/VistaPrevia'
import { useAvisosAlGuardar } from '../components/AvisosAlGuardar'

// Pantalla Promos: SOLO el dueño (src/lib/permisosTarifa.ts). Crear, editar,
// pausar, duplicar y borrar promos de la cotización, y el % de efectivo por
// rango de fechas. Todo guardado pasa por vista previa, avisos e historial.

const money = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
const MAX_FECHAS_AVISO = 40   // para el aviso del tope: muestra de noches del rango (si no, tarda)

/** Hasta `max` noches repartidas en el rango, desde hoy. */
function muestraDeFechas(desde: string, hasta: string, hoy: string): string[] {
  const todas = fechasEntre(desde > hoy ? desde : hoy, hasta)
  if (todas.length <= MAX_FECHAS_AVISO) return todas
  const paso = todas.length / MAX_FECHAS_AVISO
  return Array.from({ length: MAX_FECHAS_AVISO }, (_, i) => todas[Math.floor(i * paso)])
}

export default function Promos() {
  const { employee } = useAuth()
  const esDueno = useEsDuenoTarifas(employee)
  const d = useDatosTarifas()
  const hoy = hoyBuenosAires()
  const [editando, setEditando] = useState<{ promo: Promo; nueva: boolean } | null>(null)
  const [estado, setEstado] = useState<{ tipo: 'ok' | 'error'; msg: string } | null>(null)
  const { mostrar, dialogo: dialogoVista } = useVistaPrevia()
  const { confirmar, dialogo: dialogoAvisos } = useAvisosAlGuardar()

  const ctx: Contexto | null = useMemo(
    () => (d.tarifario ? { tarifario: d.tarifario, especiales: d.especiales, estadias: d.estadias, hoy } : null),
    [d.tarifario, d.especiales, d.estadias, hoy],
  )
  const costos = useMemo(
    () => new Map(ctx ? d.promos.map(p => [p.id, costoPromo(p, ctx)]) : []),
    [ctx, d.promos],
  )

  if (!esDueno) {
    return <div className="p-6 text-navy-600">Esta pantalla es solo para el dueño.</div>
  }

  function mensaje(e: EjemploVistaPrevia, c: Contexto, promos: readonly Promo[]): string {
    const cot = cotizarEstadia(e.llegada, e.salida, e.pax, c.tarifario, c.especiales, c.estadias, { promos, hoy: e.hoy })
    return armarMensaje(e.llegada, e.salida, e.pax, cot, c.tarifario.config.cuotas)
  }

  async function guardarLista(nueva: Promo[], cambiada: Promo, motivo: string) {
    if (!ctx || !d.tarifario) return
    const filas: FilaVistaPrevia[] = ejemplosVistaPrevia(cambiada, ctx).map(e => ({
      ejemplo: e, antes: mensaje(e, ctx, d.promos), despues: mensaje(e, ctx, nueva),
    }))
    if (!(await mostrar(filas, cambiada.nombre || NOMBRE_TIPO[cambiada.tipo]))) return
    const avisos: string[] = []
    const peor = peorDescuento(muestraDeFechas(cambiada.desde, cambiada.hasta, hoy), d.tarifario, d.especiales, d.estadias, null, nueva)
    if (peor && peor.descuento > d.protecciones.topeDescuento + 1e-9) {
      avisos.push(
        `El descuento combinado llega a ${pct(peor.descuento)} (tope ${pct(d.protecciones.topeDescuento)}): `
        + `${dm(peor.llegada)} al ${dm(peor.salida)}, ${peor.pax} ${peor.pax === 1 ? 'persona' : 'personas'}, `
        + `lista ${money(peor.total)} → ${money(peor.cobrado)}.`,
      )
    }
    if (!(await confirmar(avisos))) return
    const r = await guardarTarifa(employee, KEY_PROMOS, nueva, { motivo: avisos.length ? `${motivo} (con avisos)` : motivo })
    setEstado(r.error ? { tipo: 'error', msg: r.error } : { tipo: 'ok', msg: 'Guardado.' })
    if (!r.error) setEditando(null)
  }

  const reemplazar = (p: Promo) => d.promos.map(x => (x.id === p.id ? p : x))

  function listoEditor(p: Promo) {
    if (!editando) return
    const nueva = editando.nueva ? [...d.promos, p] : reemplazar(p)
    void guardarLista(nueva, p, `${editando.nueva ? 'Nueva promo' : 'Editó la promo'}: ${p.nombre}`)
  }

  async function guardarEfectivo(desde: string, hasta: string, porcentaje: number): Promise<string | null> {
    if (!ctx || !d.tarifario) return 'Falta el tarifario.'
    const cambio = aplicarEfectivo(d.ajustes, desde, hasta, porcentaje)
    if (!cambio.cambiadas.length) {
      return cambio.sinPrecio.length
        ? 'Esas noches no tienen precio cargado en DionSys: el % de efectivo no se aplica ahí.'
        : 'No hay nada que cambiar: esas noches ya tienen ese %.'
    }
    const despues: Contexto = { ...ctx, especiales: especialesConAjustes(cambio.ajustes) }
    const filas = ejemplosVistaPrevia(null, ctx, { desde, hasta }).map(e => ({
      ejemplo: e, antes: mensaje(e, ctx, d.promos), despues: mensaje(e, despues, d.promos),
    }))
    if (!(await mostrar(filas, `efectivo ${pct(porcentaje)} del ${dm(desde)} al ${dm(hasta)}`))) return 'No se guardó.'
    const avisos = avisosAlGuardarAjustes(d.ajustes, cambio.ajustes as AjustesTarifa, {
      tarifario: d.tarifario, estadias: d.estadias, promos: d.promos, config: d.protecciones,
    })
    if (cambio.sinPrecio.length) {
      avisos.unshift(`${cambio.sinPrecio.length} noches del rango no tienen precio en DionSys y quedan como están (desde el ${dm(cambio.sinPrecio[0])}).`)
    }
    if (!(await confirmar(avisos))) return 'No se guardó.'
    const r = await guardarTarifa(employee, KEY_AJUSTES_TARIFA, cambio.ajustes, {
      motivo: `Efectivo ${pct(porcentaje)} del ${dm(desde)} al ${dm(hasta)}`,
    })
    return r.error
  }

  function borrar(p: Promo) {
    if (!window.confirm(`¿Borrar "${p.nombre}"? Queda en el historial y se puede volver atrás.`)) return
    void guardarLista(d.promos.filter(x => x.id !== p.id), { ...p, activa: false }, `Borró la promo: ${p.nombre}`)
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Tag size={22} className="text-navy-700" />
        <h2 className="text-xl font-bold text-navy-800">Promos</h2>
      </div>

      <div className="flex gap-2 items-start bg-sky-50 border border-sky-200 rounded-xl p-3 text-sm text-sky-900">
        <Info size={18} className="shrink-0 mt-0.5" />
        <p>
          Estas promos aplican <strong>solo a la cotización de DionSys / WhatsApp</strong>.
          No se publican en Booking ni en TodoAlojamiento: si querés una promo ahí, hay que cargarla en cada canal.
        </p>
      </div>

      {d.promosGuardadas === null && (
        <p className="text-sm text-navy-600 bg-navy-50 rounded-xl p-3">
          Todavía se cotiza con las promos de siempre (5 y 7 noches y la reserva anticipada). Con el primer cambio que guardes
          se guarda la lista completa y desde ahí manda esta pantalla.
        </p>
      )}

      {d.errorTarifario && <p className="text-sm text-red-700">{d.errorTarifario}</p>}
      {estado && <p className={`text-sm ${estado.tipo === 'ok' ? 'text-emerald-700' : 'text-red-700'}`}>{estado.msg}</p>}

      <details className="bg-white rounded-xl border border-navy-100 p-4 text-sm text-navy-700">
        <summary className="font-semibold text-navy-800 cursor-pointer">Orden en que se aplican</summary>
        <ol className="list-decimal ml-5 mt-2 space-y-1">
          <li>Precio de lista de cada noche (tarifa, finde largo, tus ajustes).</li>
          <li>Descuento general de las tarifas pactadas.</li>
          <li>Promos que <strong>no se suman</strong>: cada una sobre la lista, queda la de menor total para el huésped. Solo se ofrece si mejora el paso 2.</li>
          <li>Promos que <strong>se suman</strong>: encima, en este orden: anticipada → último momento → por noches.</li>
          <li>Efectivo: alternativa aparte, nunca se suma a una promo.</li>
        </ol>
      </details>

      {editando && (
        <PromoEditor key={editando.promo.id} inicial={editando.promo} onListo={listoEditor} onCancelar={() => setEditando(null)} />
      )}

      <section className="space-y-2">
        {d.promos.map(p => {
          const c = costos.get(p.id)
          return (
            <div key={p.id} className={`bg-white rounded-xl border p-4 ${p.activa ? 'border-navy-100' : 'border-dashed border-navy-200 opacity-70'}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-navy-800">
                    {p.nombre}
                    {!p.activa && <span className="ml-2 text-xs font-medium text-amber-700">pausada</span>}
                    {p.seSuma && <span className="ml-2 text-xs font-medium text-navy-500">se suma</span>}
                  </p>
                  <p className="text-xs text-navy-500">{NOMBRE_TIPO[p.tipo]} · {resumenPromo(p)}</p>
                  <p className="text-xs text-navy-600 mt-1">🎁 {p.tipo === 'noches' ? p.texto : p.texto.replace('{porcentaje}', String(Math.round(p.porcentaje * 100)))}</p>
                </div>
                <div className="flex gap-1">
                  <button title="Editar" onClick={() => setEditando({ promo: p, nueva: false })} className="p-1.5 rounded-lg border border-navy-200"><Pencil size={15} /></button>
                  <button
                    title={p.activa ? 'Pausar' : 'Activar'}
                    onClick={() => void guardarLista(reemplazar({ ...p, activa: !p.activa }), { ...p, activa: true }, `${p.activa ? 'Pausó' : 'Activó'} la promo: ${p.nombre}`)}
                    className="p-1.5 rounded-lg border border-navy-200"
                  >
                    {p.activa ? <Pause size={15} /> : <Play size={15} />}
                  </button>
                  <button title="Duplicar" onClick={() => setEditando({ promo: duplicarPromo(p), nueva: true })} className="p-1.5 rounded-lg border border-navy-200"><Copy size={15} /></button>
                  <button title="Borrar" onClick={() => borrar(p)} className="p-1.5 rounded-lg border border-red-200 text-red-700"><Trash2 size={15} /></button>
                </div>
              </div>
              <div className="mt-2 text-xs bg-navy-50/70 rounded-lg px-3 py-2 text-navy-700">
                <span className="font-semibold">Qué te cuesta: </span>
                {c
                  ? <>en una reserva tipo ({c.reserva.pax} personas, {c.reserva.noches} noches desde el {dm(c.reserva.llegada)}) se descuentan{' '}
                      <strong>{money(c.descuento)}</strong> ({pct(c.fraccion)} de {money(c.lista)}). Para cobrar lo mismo hacen falta{' '}
                      <strong>{textoReservasMas(c.reservasMas)}</strong>.</>
                  : 'no hay fechas elegibles desde hoy para calcularlo.'}
              </div>
            </div>
          )
        })}
      </section>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(NOMBRE_TIPO) as TipoPromoConfig[]).map(t => (
          <button
            key={t}
            onClick={() => setEditando({ promo: nuevaPromo(t, hoy), nueva: true })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-navy-200 text-navy-700 text-sm font-medium bg-white"
          >
            <Plus size={15} /> {NOMBRE_TIPO[t]}
          </button>
        ))}
      </div>

      <EfectivoEditor ajustes={d.ajustes} hoy={hoy} onGuardar={guardarEfectivo} />

      {dialogoVista}
      {dialogoAvisos}
    </div>
  )
}
