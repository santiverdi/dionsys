// Los impuestos, servicios y honorarios pagados en el libro de Charo, para
// mandarlos a la pantalla de Impuestos y Servicios.
//
// Mandar una fila NO carga un servicio nuevo: marca como PAGADO el vencimiento
// que ya estaba cargado (con la plata y la fecha del libro). Solo cuando no hay
// ningún vencimiento cerca se crea el pago. Por eso el botón dice una cosa u
// otra según el caso — que quede claro qué va a pasar antes de tocarlo.

import { useMemo, useState } from 'react'
import { Receipt, Send, Undo2, AlertTriangle, Check, Eye } from 'lucide-react'
import { useImpuestos } from '../context/ImpuestosContext'
import { useAuth } from '../context/AuthContext'
import {
  impuestosDelLibro, pendienteDe, yaPagadoDe, categoriaDe,
  type ImpuestoDelLibro,
} from '../lib/libroCajaImpuestos'
import { formatMontoCurrency } from '../utils/validators'
import { CATEGORIA_LABELS, type LibroCajaMovimiento, type PagoMensual } from '../types'

function fmtFecha(s: string): string {
  const [, m, d] = s.split('-')
  return `${d}/${m}`
}

interface Props {
  movimientos: LibroCajaMovimiento[]
  /** Para sacar la marca del Dashboard: lo que se manda ya suma en Impuestos. */
  desmarcar: (clave: string) => void
}

export default function ImpuestosDelLibro({ movimientos, desmarcar }: Props) {
  const { servicios, pagos, addPago, updatePago, deletePago } = useImpuestos()
  const { employee } = useAuth()

  const [verTodas, setVerTodas] = useState(false)
  // Servicio elegido a mano por fila: pisa el propuesto.
  const [servicioElegido, setServicioElegido] = useState<Record<string, string>>({})

  const filas = useMemo(
    () => impuestosDelLibro(movimientos, servicios, pagos, verTodas),
    [movimientos, servicios, pagos, verTodas],
  )

  if (servicios.length === 0 || filas.length === 0) return null

  const servicioDe = (f: ImpuestoDelLibro): string =>
    servicioElegido[f.clave] ?? f.servicioSugerido?.id ?? ''

  // El estado del otro lado depende del servicio elegido, así que se recalcula
  // acá: lo que trae la fila vale para el servicio PROPUESTO nada más.
  const destino = (f: ImpuestoDelLibro) => {
    const id = servicioDe(f)
    if (!id || f.enviado) return { id, pendiente: null, yaPagado: null }
    return {
      id,
      pendiente: pendienteDe(id, f.mov.fecha, pagos),
      yaPagado: yaPagadoDe(id, f.mes, pagos),
    }
  }

  const enviar = (f: ImpuestoDelLibro) => {
    const { id, pendiente, yaPagado } = destino(f)
    if (!id || f.enviado || yaPagado) return
    const ahora = new Date().toISOString()

    // Cualquier pago sin pagar que ya exista para ese servicio y ese mes, aunque
    // su vencimiento esté lejos: crear otro encima lo pisaría sin avisar
    // (Impuestos guarda uno solo por servicio y por mes).
    const existente = pendiente ?? pagos.find(p => p.impuestoId === id && p.mes === f.mes) ?? null

    if (existente) {
      // El vencimiento ya estaba cargado: se marca pagado con lo que dice el
      // libro. No se toca `mes` — el pago sigue perteneciendo a su vencimiento.
      updatePago({
        ...existente,
        monto: f.monto,
        pagado: true,
        fechaPago: f.mov.fecha,
        origenLibro: f.clave,
        creadoDesdeLibro: false,
      })
    } else {
      // No había vencimiento cargado: el pago se crea con la fecha del libro,
      // que es lo único que se sabe. Cae en el mes en que salió la plata.
      addPago({
        impuestoId: id,
        mes: f.mes,
        monto: f.monto,
        vtoActual: f.mov.fecha,
        vtoSiguiente: '',
        pagado: true,
        fechaPago: f.mov.fecha,
        origenLibro: f.clave,
        creadoDesdeLibro: true,
        createdBy: employee?.name,
        createdAt: ahora,
      })
    }
    // Si estaba marcado para el Dashboard, se saca: ahora suma desde Impuestos.
    desmarcar(f.clave)
  }

  const deshacer = (f: ImpuestoDelLibro) => {
    const p = f.enviado
    if (!p) return
    if (p.creadoDesdeLibro) {
      deletePago(p.id)
      return
    }
    // Existía antes: vuelve a quedar pendiente, no se borra el vencimiento. Se
    // arma de cero para que no queden ni la fecha de pago ni la marca de origen.
    const limpio: PagoMensual = { ...p, pagado: false }
    delete limpio.fechaPago
    delete limpio.origenLibro
    delete limpio.creadoDesdeLibro
    updatePago(limpio)
  }

  const listas = filas.filter(f => {
    if (f.enviado) return false
    const d = destino(f)
    return !!d.id && !d.yaPagado
  })

  // En lote va UNA fila por servicio: `pagos` no se refresca entre llamadas, así
  // que dos filas del mismo servicio se pisarían la una a la otra. La segunda
  // queda en la lista para mandarla después, ya con el estado actualizado.
  const enviarLote = () => {
    const hechos = new Set<string>()
    for (const f of listas) {
      const id = servicioDe(f)
      if (hechos.has(id)) continue
      hechos.add(id)
      enviar(f)
    }
  }

  return (
    <section className="bg-white rounded-xl border border-navy-100 p-4 mb-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <h3 className="text-sm font-bold uppercase tracking-wide text-navy-500 flex items-center gap-1.5">
          <Receipt size={15} /> Impuestos y servicios de este libro ({filas.length})
        </h3>
        <span className="flex items-center gap-2">
          <button
            onClick={() => setVerTodas(v => !v)}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-navy-500 hover:bg-navy-50"
            title="Mostrar también las salidas que no suenan a impuesto o servicio"
          >
            <Eye size={12} /> {verTodas ? 'Solo las que parecen' : 'Ver todas las salidas'}
          </button>
          {listas.length > 0 && (
            <button
              onClick={enviarLote}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-800 text-cream text-xs font-semibold hover:bg-navy-700"
            >
              <Send size={13} /> Mandar {listas.length}
            </button>
          )}
        </span>
      </div>
      <p className="text-[11px] text-navy-400 mb-3">
        Elegí a qué servicio va cada pago. Si el vencimiento ya estaba cargado en Impuestos, se marca
        pagado con el importe y la fecha del libro; si no existía, se crea el pago ahí.
      </p>

      <ul className="space-y-0.5 max-h-[28rem] overflow-y-auto">
        {filas.map(f => {
          const d = destino(f)
          const srv = servicios.find(s => s.id === d.id) ?? null
          return (
            <li
              key={f.clave}
              className={`flex items-start gap-2 flex-wrap border-b border-navy-50 last:border-0 py-2 ${f.enviado ? 'bg-green-50/60' : ''}`}
            >
              <span className="min-w-0 flex-1">
                <span className="text-xs text-navy-700">
                  <span className="text-navy-400">{fmtFecha(f.mov.fecha)}</span>{' '}
                  <span className="font-medium">{f.mov.detalle || f.mov.concepto}</span>
                </span>
                <span className="block text-[10px] text-navy-400">
                  {f.mov.concepto} · {f.mov.medio}
                </span>
                {f.enviado ? (
                  <span className="flex items-center gap-1 text-[10px] text-green-700">
                    <Check size={11} />
                    {f.enviado.creadoDesdeLibro
                      ? 'pago creado en Impuestos desde el libro'
                      : 'vencimiento marcado como pagado en Impuestos'}
                  </span>
                ) : d.yaPagado ? (
                  <span className="flex items-start gap-1 text-[10px] text-amber-700">
                    <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                    <span>
                      {srv?.nombre} ya figura pagado en ese mes por{' '}
                      {formatMontoCurrency(d.yaPagado.monto)} — Impuestos guarda un pago por
                      servicio y por mes, así que este no se puede mandar
                    </span>
                  </span>
                ) : d.pendiente ? (
                  <span className="block text-[10px] text-navy-500">
                    marca pagado el vencimiento del {fmtFecha(d.pendiente.vtoActual)}
                    {Math.abs(d.pendiente.monto - f.monto) > 1 && d.pendiente.monto > 0 && (
                      <> · estaba cargado por {formatMontoCurrency(d.pendiente.monto)}</>
                    )}
                  </span>
                ) : d.id ? (
                  <span className="block text-[10px] text-navy-500">
                    no hay vencimiento cargado: se crea el pago en {CATEGORIA_LABELS[categoriaDe(srv)]}
                  </span>
                ) : null}
              </span>

              {!f.enviado && (
                <select
                  value={d.id}
                  onChange={e => setServicioElegido(prev => ({ ...prev, [f.clave]: e.target.value }))}
                  className="shrink-0 px-2 py-1 rounded-lg border border-navy-200 text-xs bg-white max-w-[12rem]"
                >
                  <option value="">¿A qué servicio va?</option>
                  {servicios.map(s => (
                    <option key={s.id} value={s.id}>{s.nombre}</option>
                  ))}
                </select>
              )}

              <span className="shrink-0 self-center text-xs font-semibold text-navy-800 whitespace-nowrap">
                {formatMontoCurrency(f.monto)}
              </span>

              {f.enviado ? (
                <button
                  onClick={() => deshacer(f)}
                  className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-navy-400 hover:text-red-600 hover:bg-red-50"
                  title={f.enviado.creadoDesdeLibro
                    ? 'Borra el pago que se creó en Impuestos'
                    : 'Vuelve a dejar el vencimiento pendiente'}
                >
                  <Undo2 size={13} /> Deshacer
                </button>
              ) : (
                <button
                  onClick={() => enviar(f)}
                  disabled={!d.id || !!d.yaPagado}
                  className="shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg bg-navy-800 text-cream text-xs font-semibold hover:bg-navy-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send size={13} /> {d.pendiente ? 'Marcar pagado' : 'A Impuestos'}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
