import { useMemo } from 'react'
import {
  Wallet, AlertTriangle, CheckCircle2, TrendingUp, Users, BedDouble,
  CreditCard, Banknote, Receipt, LayoutList, ClipboardList,
} from 'lucide-react'
import { useCajas } from '../context/CajaContext'
import { usePartes } from '../context/ParteContext'
import { getPanorama, type ConserjeStats, type ImperfeccionesCount } from '../lib/panorama'
import { formatMontoCurrency } from '../utils/validators'

function fmtFechaCorta(s: string): string {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

function Section({ icon: Icon, title, children }: { icon: typeof Wallet; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-navy-100 p-4 mb-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-navy-500 mb-3 flex items-center gap-2">
        <Icon size={15} className="text-gold-600" /> {title}
      </h3>
      {children}
    </section>
  )
}

function Kpi({ label, value, sub, tone = 'navy' }: { label: string; value: string; sub?: string; tone?: 'navy' | 'green' | 'red' | 'amber' }) {
  const toneCls = {
    navy: 'bg-navy-50 text-navy-800',
    green: 'bg-green-50 text-green-800',
    red: 'bg-red-50 text-red-800',
    amber: 'bg-amber-50 text-amber-800',
  }[tone]
  return (
    <div className={`rounded-lg p-3 ${toneCls}`}>
      <p className="text-[10px] uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-lg font-bold leading-tight">{value}</p>
      {sub && <p className="text-[10px] opacity-60 mt-0.5">{sub}</p>}
    </div>
  )
}

// Una imperfección: número en rojo/ámbar si hay, verde si está en cero.
function ImperfCell({ label, n, level = 'warn' }: { label: string; n: number; level?: 'error' | 'warn' }) {
  const cls = n === 0
    ? 'bg-green-50 text-green-700 border-green-200'
    : level === 'error'
      ? 'bg-red-50 text-red-700 border-red-200'
      : 'bg-amber-50 text-amber-700 border-amber-200'
  return (
    <div className={`rounded-lg border p-2.5 text-center ${cls}`}>
      <p className="text-xl font-bold leading-none">{n}</p>
      <p className="text-[10px] mt-1 leading-tight">{label}</p>
    </div>
  )
}

function imperfArray(i: ImperfeccionesCount) {
  return [
    { label: 'Descuadres', n: i.descuadres, level: 'error' as const },
    { label: 'Tarjeta sin FB', n: i.tarjetaSinFB, level: 'warn' as const },
    { label: 'Check-out sin cobro', n: i.checkoutsSinCobro, level: 'error' as const },
    { label: 'Estadías ocultas', n: i.estadiasOcultas, level: 'warn' as const },
    { label: 'Cajas sin cerrar', n: i.cajasSinCerrar, level: 'warn' as const },
    { label: 'Egresos a revisar', n: i.egresosRevisar, level: 'warn' as const },
  ]
}

function ConserjeRow({ s, maxCobrado }: { s: ConserjeStats; maxCobrado: number }) {
  const pct = maxCobrado ? Math.round((s.totalCobrado / maxCobrado) * 100) : 0
  return (
    <tr className="border-b border-navy-50 last:border-0">
      <td className="py-2 pr-2 font-semibold text-navy-800">{s.conserje}</td>
      <td className="px-2 text-navy-500 text-center">{s.cajas}/{s.partes}</td>
      <td className="px-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-navy-50 rounded-full overflow-hidden min-w-[40px]">
            <div className="h-full bg-gold-400 rounded-full" style={{ width: `${pct}%` }} />
          </div>
          <span className="font-semibold text-navy-800 whitespace-nowrap">{formatMontoCurrency(s.totalCobrado)}</span>
        </div>
      </td>
      <td className="px-2 text-center text-navy-600">{formatMontoCurrency(s.ticketPromedio)}</td>
      <td className="px-2 text-center">
        <span className={s.pctFB < 100 ? 'text-amber-600 font-semibold' : 'text-navy-500'}>{s.pctFB}%</span>
      </td>
      <td className="pl-2 text-center">
        {s.imperfecciones.total === 0
          ? <CheckCircle2 size={16} className="inline text-green-500" />
          : <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-bold">{s.imperfecciones.total}</span>}
      </td>
    </tr>
  )
}

export default function Panorama() {
  const { cajas } = useCajas()
  const { partes } = usePartes()
  const p = useMemo(() => getPanorama(cajas, partes), [cajas, partes])

  if (cajas.length === 0 && partes.length === 0) {
    return (
      <div className="text-center py-16">
        <LayoutList size={48} className="mx-auto text-navy-200 mb-3" />
        <p className="text-navy-400 font-medium">Todavía no hay cajas ni partes cargados</p>
        <p className="text-sm text-navy-300 mt-1">A medida que los conserjes carguen, acá ves todo el análisis agregado.</p>
      </div>
    )
  }

  const { dinero, imperfecciones, conserjes, ocupacion, cobertura, gastos, serie } = p
  const maxCobradoConserje = Math.max(...conserjes.map(c => c.totalCobrado), 1)
  const medios = [
    { label: 'Efectivo', v: dinero.efectivo, Icon: Banknote },
    { label: 'Tarjetas', v: dinero.tarjetas, Icon: CreditCard },
    { label: 'Transf.', v: dinero.transferencia, Icon: TrendingUp },
    { label: 'Cheques', v: dinero.cheques, Icon: Receipt },
    { label: 'Otros', v: dinero.otros, Icon: Wallet },
  ]
  const serieReciente = serie.slice(-14)
  const maxSerieCobrado = Math.max(...serieReciente.map(d => d.cobrado), 1)

  return (
    <div>
      <p className="text-sm text-navy-500 mb-4">
        Todo lo que cargan los conserjes en sus cajas y partes, agregado. {cobertura.cajas} cajas · {cobertura.partes} partes.
      </p>

      {/* KPIs principales */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <Kpi label="Total cobrado" value={formatMontoCurrency(dinero.totalCobrado)} sub={`${dinero.cantIngresos} cobros`} tone="green" />
        <Kpi label="Ticket promedio" value={formatMontoCurrency(dinero.ticketPromedio)} />
        <Kpi label="Cobros c/ Factura B" value={`${dinero.pctFB}%`} sub={`${dinero.cobrosTarjetaConFB}/${dinero.cobrosTarjeta} con tarjeta`} tone={dinero.pctFB < 100 ? 'amber' : 'green'} />
        <Kpi label="Imperfecciones" value={String(imperfecciones.total)} tone={imperfecciones.total ? 'red' : 'green'} />
      </div>

      {/* Control & cumplimiento */}
      <Section icon={AlertTriangle} title="Control & cumplimiento">
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {imperfArray(imperfecciones).map(x => <ImperfCell key={x.label} {...x} />)}
        </div>
      </Section>

      {/* Ranking por conserje */}
      <Section icon={Users} title="Por conserje (más imperfecciones primero)">
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-xs min-w-[520px]">
            <thead>
              <tr className="text-navy-500 border-b border-navy-100">
                <th className="text-left py-1.5 pr-2">Conserje</th>
                <th className="px-2 text-center">Cajas/Partes</th>
                <th className="px-2 text-left">Cobrado</th>
                <th className="px-2 text-center">Ticket</th>
                <th className="px-2 text-center">FB</th>
                <th className="pl-2 text-center">Imperf.</th>
              </tr>
            </thead>
            <tbody>
              {conserjes.map(s => <ConserjeRow key={s.conserje} s={s} maxCobrado={maxCobradoConserje} />)}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Dinero & cobranzas */}
      <Section icon={Wallet} title="Dinero & cobranzas">
        <div className="space-y-1.5 mb-3">
          {medios.map(({ label, v, Icon }) => {
            const pct = dinero.totalCobrado ? Math.round((v / dinero.totalCobrado) * 100) : 0
            return (
              <div key={label} className="flex items-center gap-2 text-xs">
                <Icon size={13} className="text-navy-400 shrink-0" />
                <span className="w-16 text-navy-600 shrink-0">{label}</span>
                <div className="flex-1 h-3 bg-navy-50 rounded-full overflow-hidden">
                  <div className="h-full bg-navy-700 rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-12 text-right text-navy-500 shrink-0">{pct}%</span>
                <span className="w-28 text-right font-semibold text-navy-800 shrink-0 whitespace-nowrap">{formatMontoCurrency(v)}</span>
              </div>
            )
          })}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Kpi label="Retiros de efectivo" value={formatMontoCurrency(dinero.totalRetiros)} />
          <Kpi label="Gastos a revisar" value={formatMontoCurrency(dinero.totalGastosARevisar)} sub={`${gastos.length} egreso(s)`} tone={gastos.length ? 'amber' : 'navy'} />
        </div>
      </Section>

      {/* Gastos a revisar */}
      {gastos.length > 0 && (
        <Section icon={Receipt} title={`Gastos a revisar (${gastos.length})`}>
          <ul className="space-y-1 text-xs">
            {gastos.slice(0, 12).map((g, i) => (
              <li key={i} className="flex items-center justify-between gap-2 border-b border-navy-50 last:border-0 py-1">
                <span className="text-navy-600 truncate">
                  <span className="text-navy-400">Caja {g.nroCaja} · {g.conserje}</span> — {g.observacion}
                </span>
                <span className="font-semibold text-navy-800 shrink-0">{formatMontoCurrency(g.total)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Ocupación & canales */}
      <Section icon={BedDouble} title="Ocupación & canales">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3">
          <Kpi label="Ocupación promedio" value={`${ocupacion.ocupacionPromedioPct}%`} sub={`${ocupacion.partes} partes`} />
          <Kpi label="Huéspedes última noche" value={String(ocupacion.huespedesUltimaNoche)} sub={ocupacion.fechaUltimaNoche ? `al ${fmtFechaCorta(ocupacion.fechaUltimaNoche)}` : 'sin parte noche'} tone="green" />
          <Kpi label="Limpieza (último parte)" value={`${ocupacion.limpieza.sucias} sucias`} sub={`${ocupacion.limpieza.limpias} limpias · ${ocupacion.limpieza.mantenimiento} mant.`} tone={ocupacion.limpieza.sucias ? 'amber' : 'navy'} />
        </div>
        <p className="text-[11px] font-bold uppercase tracking-wide text-navy-400 mb-1.5">Reservas por canal</p>
        <div className="space-y-1.5">
          {ocupacion.canalMix.map(c => (
            <div key={c.canal} className="flex items-center gap-2 text-xs">
              <span className="w-24 text-navy-600 shrink-0 truncate">{c.canal}</span>
              <div className="flex-1 h-3 bg-navy-50 rounded-full overflow-hidden">
                <div className="h-full bg-gold-400 rounded-full" style={{ width: `${c.pct}%` }} />
              </div>
              <span className="w-8 text-right text-navy-500 shrink-0">{c.pct}%</span>
              <span className="w-24 text-right text-navy-700 shrink-0 whitespace-nowrap">{c.reservas} res · {c.plazas} pax</span>
            </div>
          ))}
        </div>
      </Section>

      {/* Evolución diaria */}
      {serieReciente.length > 0 && (
        <Section icon={TrendingUp} title="Evolución (últimos días)">
          <div className="space-y-1.5">
            {serieReciente.map(d => {
              const pct = (d.cobrado / maxSerieCobrado) * 100
              return (
                <div key={d.fecha} className="flex items-center gap-2 text-xs">
                  <span className="w-12 text-navy-500 shrink-0">{fmtFechaCorta(d.fecha)}</span>
                  <div className="flex-1 h-4 bg-navy-50 rounded overflow-hidden">
                    <div className="h-full bg-green-400 rounded" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-24 text-right text-navy-700 font-medium shrink-0 whitespace-nowrap">{formatMontoCurrency(d.cobrado)}</span>
                  <span className="w-10 text-right text-navy-400 shrink-0">{d.ocupacionPct != null ? `${d.ocupacionPct}%` : ''}</span>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* Cobertura de carga */}
      <Section icon={ClipboardList} title="Cobertura de carga">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <Kpi label="Cajas" value={String(cobertura.cajas)} />
          <Kpi label="Partes" value={String(cobertura.partes)} />
          <Kpi label="Cajas sin parte" value={String(cobertura.cajasSinParte.length)} tone={cobertura.cajasSinParte.length ? 'amber' : 'green'} />
          <Kpi label="Huecos de Nº caja" value={String(cobertura.huecosNroCaja.length)} tone={cobertura.huecosNroCaja.length ? 'amber' : 'green'} />
        </div>
        {cobertura.cajasSinParte.length > 0 && (
          <p className="text-xs text-amber-700 mb-1">Cajas sin parte: {cobertura.cajasSinParte.join(', ')}</p>
        )}
        {cobertura.partesSinCaja.length > 0 && (
          <p className="text-xs text-amber-700 mb-1">Partes sin caja: {cobertura.partesSinCaja.join(', ')}</p>
        )}
        {cobertura.huecosNroCaja.length > 0 && (
          <p className="text-xs text-amber-700 mb-1">Cajas que faltan cargar (Nº): {cobertura.huecosNroCaja.join(', ')}</p>
        )}
        <p className="text-[11px] font-bold uppercase tracking-wide text-navy-400 mt-2 mb-1">Última carga por conserje</p>
        <ul className="text-xs space-y-0.5">
          {cobertura.ultimaCargaPorConserje.map(u => (
            <li key={u.conserje} className="flex items-center justify-between">
              <span className="text-navy-600">{u.conserje}</span>
              <span className="text-navy-400">{fmtFechaCorta(u.ultima)}</span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  )
}
