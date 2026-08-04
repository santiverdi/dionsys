// Qué hizo cada habitación en el mes: plata atribuida, noches vendidas y cuánto
// rinde una noche. La plata sale de la habitación que trae cada cobro del PMS
// (ver src/lib/porHabitacion.ts), no de un promedio del total del mes.

import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight, Users } from 'lucide-react'
import { useCajas } from '../context/CajaContext'
import { usePartes } from '../context/ParteContext'
import { getRendimientoPorHabitacion, type GrupoRendimiento } from '../lib/porHabitacion'
import { formatMontoCurrency } from '../utils/validators'

type Vista = 'habitacion' | 'piso' | 'tipo'

const VISTAS: { id: Vista; label: string }[] = [
  { id: 'habitacion', label: 'Por habitación' },
  { id: 'piso', label: 'Por piso' },
  { id: 'tipo', label: 'Por tipo' },
]

function BarraGrupo({ g, max }: { g: GrupoRendimiento; max: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 sm:w-24 text-navy-600 shrink-0 truncate capitalize">{g.label}</span>
      <div className="flex-1 h-3 bg-navy-50 rounded-full overflow-hidden">
        <div className="h-full bg-gold-400 rounded-full" style={{ width: `${(g.ingreso / max) * 100}%` }} />
      </div>
      <span className="w-24 sm:w-28 text-right font-semibold text-navy-800 shrink-0 whitespace-nowrap">
        {formatMontoCurrency(g.ingreso)}
      </span>
      <span className="w-24 text-right text-navy-400 shrink-0 whitespace-nowrap hidden sm:block">
        {g.noches ? `${formatMontoCurrency(g.ingresoPorNoche)}/noche` : 'sin noches'}
      </span>
    </div>
  )
}

export default function RendimientoHabitaciones({ year, month }: { year: number; month: number }) {
  const { cajas } = useCajas()
  const { partes } = usePartes()
  const [vista, setVista] = useState<Vista>('habitacion')
  const [verTodas, setVerTodas] = useState(false)

  const r = useMemo(
    () => getRendimientoPorHabitacion(year, month, cajas, partes),
    [year, month, cajas, partes],
  )

  if (r.totalCobrado === 0 && r.nochesMedidas === 0) {
    return <p className="text-xs text-navy-400">Sin cajas ni partes cargados en este mes.</p>
  }

  const conMovimiento = r.habitaciones.filter(h => h.ingreso > 0 || h.noches > 0)
  const visibles = verTodas ? r.habitaciones : conMovimiento
  const maxIngreso = Math.max(...r.habitaciones.map(h => h.ingreso), 1)
  const grupos = vista === 'piso' ? r.porPiso : r.porTipo
  const maxGrupo = Math.max(...grupos.map(g => g.ingreso), 1)
  const pctAtribuido = r.totalCobrado > 0 ? Math.round((r.ingresoAtribuido / r.totalCobrado) * 100) : 0

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-3">
        <p className="text-[11px] text-navy-400">
          {r.nochesMedidas > 0
            ? `${r.nochesMedidas} noche(s) del mes con parte cargado.`
            : 'Sin partes de la noche cargados: no se pueden contar noches vendidas.'}
        </p>
        <div className="flex gap-1 bg-navy-50 rounded-lg p-0.5 shrink-0">
          {VISTAS.map(v => (
            <button
              key={v.id}
              onClick={() => setVista(v.id)}
              className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                vista === v.id ? 'bg-white text-navy-800 shadow-sm' : 'text-navy-500 hover:text-navy-700'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cuánto del mes se pudo colgar de una habitación. Sin esto, el total de
          abajo se lee como si fuera todo lo que entró. */}
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="bg-navy-50 rounded-lg p-2.5">
          <p className="text-[10px] uppercase text-navy-500">Atribuido a habitaciones</p>
          <p className="text-sm font-bold text-navy-800">{formatMontoCurrency(r.ingresoAtribuido)}</p>
          <p className="text-[10px] text-navy-400">{pctAtribuido}% de lo cobrado en el mes</p>
        </div>
        <div className="bg-navy-50 rounded-lg p-2.5">
          <p className="text-[10px] uppercase text-navy-500">Sin habitación</p>
          <p className="text-sm font-bold text-navy-800">{formatMontoCurrency(r.ingresoSinAtribuir)}</p>
          <p className="text-[10px] text-navy-400">cobros que no dicen a qué cuarto van</p>
        </div>
      </div>

      {r.sinCobro.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 mb-3">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            <strong>{r.sinCobro.length} habitación(es) durmieron gente sin plata en la caja:</strong>{' '}
            {r.sinCobro.join(', ')}. Suele ser un grupo que cobra el dueño por fuera — no son cuartos
            improductivos.
          </span>
        </div>
      )}

      {vista === 'habitacion' ? (
        <>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-xs min-w-[440px]">
              <thead>
                <tr className="text-navy-500 border-b border-navy-100">
                  <th className="text-left py-1.5 pr-2">Hab.</th>
                  <th className="px-2 text-left">Ingreso del mes</th>
                  <th className="px-2 text-center">Noches</th>
                  <th className="px-2 text-center">Ocup.</th>
                  <th className="pl-2 text-right">Por noche</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map(h => (
                  <tr key={h.numero} className="border-b border-navy-50 last:border-0">
                    <td className="py-1.5 pr-2 whitespace-nowrap">
                      <span className="font-semibold text-navy-800">{h.numero}</span>
                      <span className="text-navy-400"> · {h.plazas}p</span>
                      {!h.activa && <span className="text-red-500 text-[10px]"> f/serv.</span>}
                    </td>
                    <td className="px-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-navy-50 rounded-full overflow-hidden min-w-[40px]">
                          <div className="h-full bg-gold-400 rounded-full" style={{ width: `${(h.ingreso / maxIngreso) * 100}%` }} />
                        </div>
                        <span className="font-semibold text-navy-800 whitespace-nowrap">{formatMontoCurrency(h.ingreso)}</span>
                      </div>
                    </td>
                    <td className="px-2 text-center text-navy-600 whitespace-nowrap">
                      {h.noches}
                      {h.ocupadaSinCobro && <AlertTriangle size={11} className="inline ml-1 text-amber-500" />}
                    </td>
                    <td className="px-2 text-center text-navy-500">{h.ocupacionPct}%</td>
                    <td className="pl-2 text-right text-navy-700 whitespace-nowrap">
                      {h.noches ? formatMontoCurrency(h.ingresoPorNoche) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {r.habitaciones.length > conMovimiento.length && (
            <button
              onClick={() => setVerTodas(!verTodas)}
              className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-navy-500 hover:text-navy-700"
            >
              {verTodas ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              {verTodas
                ? 'Ocultar las que no se movieron'
                : `Ver también las ${r.habitaciones.length - conMovimiento.length} que no se vendieron ni cobraron`}
            </button>
          )}
        </>
      ) : (
        <div className="space-y-1.5">
          {grupos.map(g => <BarraGrupo key={g.label} g={g} max={maxGrupo} />)}
          <p className="text-[10px] text-navy-400 pt-1 flex items-center gap-1">
            <Users size={11} /> El ingreso por noche compara {vista === 'piso' ? 'pisos' : 'tipos'} de
            distinto tamaño; el total no, porque un piso tiene más cuartos que otro.
          </p>
        </div>
      )}
    </div>
  )
}
