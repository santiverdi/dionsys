// La ficha de un cuarto: todo lo que el sistema sabe de él en una pantalla.
// Se abre tocando una celda del mapa del hotel.

import { useMemo } from 'react'
import { X, BedDouble, Banknote, CalendarDays, AlertTriangle, Sparkles, Wrench, HelpCircle } from 'lucide-react'
import { useCajas } from '../context/CajaContext'
import { usePartes } from '../context/ParteContext'
import { getFichaHabitacion } from '../lib/porHabitacion'
import { formatMontoCurrency } from '../utils/validators'

const MAX_FILAS = 12

function fmtDia(iso: string): string {
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso)
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function Dato({ label, value, sub, tone = 'navy' }: { label: string; value: string; sub?: string; tone?: 'navy' | 'green' | 'amber' }) {
  const cls = { navy: 'text-navy-800', green: 'text-green-700', amber: 'text-amber-700' }[tone]
  return (
    <div className="bg-navy-50 rounded-lg p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-navy-500">{label}</p>
      <p className={`text-base font-bold leading-tight ${cls}`}>{value}</p>
      {sub && <p className="text-[10px] text-navy-400">{sub}</p>}
    </div>
  )
}

function Bloque({ icon: Icon, title, children }: { icon: typeof BedDouble; title: string; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <h4 className="text-[11px] font-bold uppercase tracking-wide text-navy-500 mb-1.5 flex items-center gap-1.5">
        <Icon size={13} className="text-gold-600" /> {title}
      </h4>
      {children}
    </section>
  )
}

export default function FichaHabitacionModal({ numero, onClose }: { numero: string | null; onClose: () => void }) {
  const { cajas } = useCajas()
  const { partes } = usePartes()
  const ficha = useMemo(
    () => (numero ? getFichaHabitacion(numero, cajas, partes) : undefined),
    [numero, cajas, partes],
  )

  if (!numero || !ficha) return null
  const { habitacion: h, totales: t } = ficha

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:w-[32rem] sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-5 max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-3">
          <div className="min-w-0">
            <h3 className="text-lg font-bold text-navy-800">Habitación {h.numero}</h3>
            <p className="text-xs text-navy-500">
              Piso {h.piso} · {h.plazas} plazas{ficha.tipo ? ` · ${ficha.tipo}` : ''}
              {!h.activa && <span className="text-red-600 font-semibold"> · fuera de servicio</span>}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-navy-100 transition-colors shrink-0">
            <X size={20} />
          </button>
        </div>

        {t.nochesMedidas === 0 ? (
          <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
            No hay partes de la noche cargados, así que no se puede saber cuántas noches se vendió
            esta habitación.
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            <Dato label="Noches vendidas" value={String(t.noches)} sub={`de ${t.nochesMedidas} medidas`} />
            <Dato label="Ocupación" value={`${t.ocupacionPct}%`} />
            <Dato label="Ingreso" value={formatMontoCurrency(t.ingreso)} tone="green" />
            <Dato
              label="Por noche"
              value={t.noches ? formatMontoCurrency(t.ingresoPorNoche) : '—'}
              sub={t.noches && t.ingreso === 0 ? 'cobrada por fuera' : undefined}
              tone={t.noches && t.ingreso === 0 ? 'amber' : 'navy'}
            />
          </div>
        )}

        {t.noches > 0 && t.ingreso === 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 mb-4">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span>Durmió gente acá y no hay plata en la caja. Suele ser un grupo que cobra el dueño por fuera.</span>
          </div>
        )}

        {ficha.meses.length > 0 && (
          <Bloque icon={CalendarDays} title="Mes a mes">
            <table className="w-full text-xs">
              <tbody>
                {ficha.meses.map(m => (
                  <tr key={m.key} className="border-b border-navy-50 last:border-0">
                    <td className="py-1.5 text-navy-700 capitalize">{m.label}</td>
                    <td className="px-2 text-center text-navy-500 whitespace-nowrap">{m.noches}/{m.nochesMedidas} noches</td>
                    <td className="px-2 text-right font-semibold text-navy-800 whitespace-nowrap">{formatMontoCurrency(m.ingreso)}</td>
                    <td className="pl-2 text-right text-navy-400 whitespace-nowrap">
                      {m.noches ? `${formatMontoCurrency(m.ingresoPorNoche)}/noche` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Bloque>
        )}

        {ficha.canales.length > 0 && (
          <Bloque icon={Sparkles} title="De dónde vienen las reservas">
            <div className="flex flex-wrap gap-1.5">
              {ficha.canales.map(c => (
                <span key={c.canal} className="text-[11px] px-2 py-1 rounded-full bg-navy-50 text-navy-700">
                  {c.canal} <span className="text-navy-400">· {c.noches}</span>
                </span>
              ))}
            </div>
          </Bloque>
        )}

        <Bloque icon={BedDouble} title={`Últimas noches ocupada (${ficha.estadias.length})`}>
          {ficha.estadias.length === 0 ? (
            <p className="text-xs text-navy-400">Nunca figuró ocupada en un parte de la noche.</p>
          ) : (
            <ul className="text-xs space-y-1">
              {ficha.estadias.slice(0, MAX_FILAS).map((e, i) => (
                <li key={`${e.fecha}-${i}`} className="flex items-center justify-between gap-2 border-b border-navy-50 last:border-0 py-1">
                  <span className="text-navy-600 whitespace-nowrap">{fmtDia(e.fecha)}</span>
                  <span className="min-w-0 flex-1 truncate text-navy-700">
                    Res. {e.reserva || '—'} <span className="text-navy-400">· {e.canal}</span>
                  </span>
                  <span className={`shrink-0 font-semibold ${e.sobreocupada ? 'text-red-600' : 'text-navy-700'}`}>
                    {e.plazas}/{h.plazas} pax
                    {e.sobreocupada && <AlertTriangle size={11} className="inline ml-1" />}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Bloque>

        <Bloque icon={Banknote} title={`Cobros atribuidos (${ficha.cobros.length})`}>
          {ficha.cobros.length === 0 ? (
            <p className="text-xs text-navy-400">Ningún cobro de caja apunta a esta habitación.</p>
          ) : (
            <ul className="text-xs space-y-1">
              {ficha.cobros.slice(0, MAX_FILAS).map((c, i) => (
                <li key={i} className="flex items-center justify-between gap-2 border-b border-navy-50 last:border-0 py-1">
                  <span className="text-navy-600 whitespace-nowrap">{fmtDia(c.fecha)}</span>
                  <span className="min-w-0 flex-1 truncate text-navy-700">
                    {c.observacion}
                    <span className="text-navy-400"> · Caja {c.nroCaja}</span>
                  </span>
                  <span className="shrink-0 font-semibold text-navy-800">
                    {formatMontoCurrency(c.monto)}
                    {c.compartido && <span className="text-navy-400 font-normal text-[10px]"> parte</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {ficha.cobros.some(c => c.compartido) && (
            <p className="text-[10px] text-navy-400 mt-1.5">
              "parte" = el cobro cubría varias habitaciones y acá se muestra lo que le toca a esta.
            </p>
          )}
        </Bloque>

        {/* Control: lo que no se sabe de esta habitación también es información. */}
        <div className="grid grid-cols-3 gap-2">
          <Dato label="Noches sin dato" value={String(t.sinDato)} tone={t.sinDato ? 'amber' : 'navy'} />
          <Dato label="Quedó sucia" value={String(t.sucia)} />
          <Dato label="En mantenimiento" value={String(t.mantenimiento)} />
        </div>
        {t.sinDato > 0 && (
          <p className="text-[11px] text-navy-500 mt-2 flex items-start gap-1.5">
            <HelpCircle size={12} className="shrink-0 mt-0.5 text-navy-400" />
            En {t.sinDato} noche(s) el parte no la nombró ni ocupada ni libre: nadie sabe si se usó.
          </p>
        )}
        {t.mantenimiento > 0 && (
          <p className="text-[11px] text-navy-500 mt-1 flex items-start gap-1.5">
            <Wrench size={12} className="shrink-0 mt-0.5 text-navy-400" />
            {t.mantenimiento} noche(s) fuera de servicio: noches que no se pudieron vender.
          </p>
        )}
      </div>
    </div>
  )
}
