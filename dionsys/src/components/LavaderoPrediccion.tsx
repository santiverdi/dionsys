// Control predictivo del lavadero: cuánta ropa justifica la ocupación real vs
// cuánta se llevaron según los remitos. Solo admin (es control de plata).

import { useMemo, useState } from 'react'
import { TrendingUp, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react'
import { usePartes } from '../context/ParteContext'
import {
  calibrarRatios, compararPeriodo, desviosRelevantes,
} from '../lib/lavaderoPrediccion'
import type { LavaderoMovimiento } from '../types'

function fmtFecha(yyyyMmDd: string): string {
  const d = new Date(yyyyMmDd + 'T12:00:00')
  return isNaN(d.getTime()) ? yyyyMmDd : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

export default function LavaderoPrediccion({
  movimientos, desde, hasta,
}: { movimientos: LavaderoMovimiento[]; desde: string; hasta: string }) {
  const { partes } = usePartes()
  const [abierto, setAbierto] = useState(false)

  const cal = useMemo(() => calibrarRatios(movimientos, partes), [movimientos, partes])
  const pred = useMemo(
    () => compararPeriodo(desde, hasta, movimientos, partes, cal.ratios),
    [desde, hasta, movimientos, partes, cal.ratios],
  )
  const desvios = useMemo(() => desviosRelevantes(pred), [pred])

  if (!cal.ratios.length) {
    return (
      <div className="bg-white rounded-xl border border-navy-100 p-3 mb-3">
        <p className="text-sm font-bold text-navy-700 flex items-center gap-2"><TrendingUp size={16} /> Ropa esperada según ocupación</p>
        <p className="text-xs text-navy-500 mt-1">
          Faltan datos para calcular el consumo normal: hacen falta remitos cargados y partes de habitaciones
          del turno noche en las mismas fechas.
        </p>
      </div>
    )
  }

  const { drivers } = pred

  return (
    <div className="bg-white rounded-xl border border-navy-100 p-3 mb-3">
      <button onClick={() => setAbierto(a => !a)} className="w-full flex items-center justify-between gap-2">
        <span className="text-sm font-bold text-navy-700 flex items-center gap-2">
          <TrendingUp size={16} /> Ropa esperada según ocupación
        </span>
        <span className="flex items-center gap-2">
          {!pred.confiable ? (
            <span className="text-[11px] font-semibold text-navy-500 bg-navy-50 border border-navy-200 rounded-full px-2 py-0.5">
              sin datos suficientes
            </span>
          ) : desvios.length ? (
            <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
              {desvios.length} desvío(s)
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5">
              coincide
            </span>
          )}
          {abierto ? <ChevronUp size={16} className="text-navy-400" /> : <ChevronDown size={16} className="text-navy-400" />}
        </span>
      </button>

      {abierto && (
        <div className="mt-3">
          <p className="text-[11px] text-navy-500 mb-2">
            Período {fmtFecha(desde)} al {fmtFecha(hasta)} · {drivers.nochesHabitacion} noches-habitación
            ({drivers.nochesConParte} de {drivers.dias} noches con parte cargado).
          </p>

          {!pred.confiable ? (
            <p className="text-xs text-navy-600 bg-navy-50 border border-navy-100 rounded-lg p-2.5 flex gap-2">
              <HelpCircle size={14} className="shrink-0 mt-0.5 text-navy-400" />
              <span>
                Faltan partes del turno noche en este período (solo {drivers.coberturaPct}% de las noches).
                Sin saber cuánta gente durmió no se puede decir cuánta ropa correspondía.
              </span>
            </p>
          ) : (
            <>
              <div className="overflow-x-auto -mx-3 px-3">
                <table className="w-full text-xs min-w-[420px]">
                  <thead>
                    <tr className="text-navy-500 border-b border-navy-100">
                      <th className="text-left py-1.5 pr-2">Prenda</th>
                      <th className="text-right px-2">Esperadas</th>
                      <th className="text-right px-2">Retiradas</th>
                      <th className="text-right pl-2">Desvío</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pred.prendas.filter(p => p.esperadas > 0 || p.retiradas > 0).map(p => {
                      const marcado = desvios.some(d => d.prenda === p.prenda)
                      return (
                        <tr key={p.prenda} className="border-b border-navy-50 last:border-0">
                          <td className="py-1.5 pr-2 text-navy-700 capitalize">{p.prenda}</td>
                          <td className="px-2 text-right text-navy-500 tabular-nums">{p.esperadas}</td>
                          <td className="px-2 text-right font-semibold text-navy-800 tabular-nums">{p.retiradas}</td>
                          <td className={`pl-2 text-right font-semibold tabular-nums ${
                            !marcado ? 'text-navy-400' : p.diff > 0 ? 'text-amber-700' : 'text-navy-600'
                          }`}>
                            {p.diff > 0 ? '+' : ''}{p.diff} {marcado && `(${p.desvioPct > 0 ? '+' : ''}${p.desvioPct}%)`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {desvios.length ? (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5 mt-2 flex gap-2">
                  <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-500" />
                  <span>
                    Se desvió de lo normal: <strong>{desvios.map(d => `${d.prenda} ${d.desvioPct > 0 ? '+' : ''}${d.desvioPct}%`).join(', ')}</strong>.
                    Vale preguntar en el lavadero antes de pagar la liquidación.
                  </span>
                </p>
              ) : (
                <p className="text-xs text-green-800 bg-green-50 border border-green-200 rounded-lg p-2.5 mt-2 flex gap-2">
                  <CheckCircle2 size={14} className="shrink-0 mt-0.5 text-green-600" />
                  <span>La ropa retirada se corresponde con la ocupación del período.</span>
                </p>
              )}

              {pred.sinRatio.length > 0 && (
                <p className="text-[11px] text-navy-500 mt-2">
                  Prendas sin consumo normal conocido (aparecen poco): {pred.sinRatio.join(', ')}.
                </p>
              )}
            </>
          )}

          <p className="text-[11px] text-navy-400 mt-2">
            El consumo normal se calcula con la historia del propio hotel ({fmtFecha(cal.desde)} al {fmtFecha(cal.hasta)},
            {' '}{cal.nochesHabitacion} noches-habitación): detecta que un período se salga de lo habitual,
            no un sobreprecio que venga de arrastre.
          </p>
        </div>
      )}
    </div>
  )
}
