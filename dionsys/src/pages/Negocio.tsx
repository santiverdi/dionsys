import { useMemo } from 'react'
import {
  TrendingUp, TrendingDown, Scale, Banknote, ArrowDownCircle, ArrowUpCircle,
  Truck, CalendarClock, AlertTriangle, BedDouble,
} from 'lucide-react'
import { useCajas } from '../context/CajaContext'
import { useOrders } from '../context/OrdersContext'
import { useStock } from '../context/StockContext'
import { useMaintenance } from '../context/MaintenanceContext'
import { useImpuestos } from '../context/ImpuestosContext'
import { useOccupancy } from '../context/OccupancyContext'
import {
  getResultadoMes, getIngresosMes, getTendencia, getCuentaCorriente,
  getGastoPorProveedor, getRevenueOcupacion,
} from '../lib/negocio'
import { getMonthlyExpenses } from '../utils/monthlyMetrics'
import { getCurrentMonth, getPreviousMonth, monthLabel } from '../utils/dateRange'
import { formatMontoCurrency } from '../utils/validators'

function Section({ icon: Icon, title, children }: { icon: typeof Scale; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-navy-100 p-4 mb-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-navy-500 mb-3 flex items-center gap-2">
        <Icon size={15} className="text-gold-600" /> {title}
      </h3>
      {children}
    </section>
  )
}

function fmtVto(s?: string): string {
  if (!s) return 'sin vto.'
  const d = new Date(s + 'T00:00:00')
  if (isNaN(d.getTime())) return s
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

export default function Negocio() {
  const { cajas } = useCajas()
  const { orders } = useOrders()
  const { pedidos } = useStock()
  const { tasks } = useMaintenance()
  const { pagos } = useImpuestos()
  const { records } = useOccupancy()

  const cur = useMemo(() => getCurrentMonth(), [])
  const prev = useMemo(() => getPreviousMonth(cur.year, cur.month), [cur])

  const resultado = useMemo(() => getResultadoMes(cur.year, cur.month, cajas, orders, pedidos, tasks, pagos), [cur, cajas, orders, pedidos, tasks, pagos])
  const resultadoPrev = useMemo(() => getResultadoMes(prev.year, prev.month, cajas, orders, pedidos, tasks, pagos), [prev, cajas, orders, pedidos, tasks, pagos])
  const ingresos = useMemo(() => getIngresosMes(cur.year, cur.month, cajas), [cur, cajas])
  const expenses = useMemo(() => getMonthlyExpenses(cur.year, cur.month, orders, pedidos, tasks, pagos), [cur, orders, pedidos, tasks, pagos])
  const tendencia = useMemo(() => getTendencia(6, cajas, orders, pedidos, tasks, pagos), [cajas, orders, pedidos, tasks, pagos])
  const cc = useMemo(() => getCuentaCorriente(orders, pedidos), [orders, pedidos])
  const proveedores = useMemo(() => getGastoPorProveedor(cur.year, cur.month, orders, pedidos), [cur, orders, pedidos])
  const revenue = useMemo(() => getRevenueOcupacion(cur.year, cur.month, cajas, records), [cur, cajas, records])

  const resDelta = resultado.resultado - resultadoPrev.resultado
  const maxTend = Math.max(...tendencia.flatMap(t => [t.ingresos, t.egresos]), 1)
  const maxProv = Math.max(...proveedores.map(p => p.monto), 1)
  const egresosCats = [
    { label: 'Pedido semanal', v: expenses.pedidosSemanales },
    { label: 'Recepción diaria', v: expenses.pedidosDistribuidor },
    { label: 'Mantenimiento', v: expenses.mantenimiento },
    { label: 'Impuestos', v: expenses.impuestosPagado },
  ].sort((a, b) => b.v - a.v)

  const sinDatos = ingresos.total === 0 && resultado.egresos === 0

  return (
    <div>
      <p className="text-sm text-navy-500 mb-4">
        Lo que entra (cajas) vs lo que sale (compras, impuestos, mantenimiento) — {monthLabel(cur.year, cur.month)}.
      </p>

      {sinDatos && (
        <div className="text-center py-10 bg-white rounded-xl border border-navy-100 mb-4">
          <Scale size={40} className="mx-auto text-navy-200 mb-2" />
          <p className="text-navy-400 text-sm">Sin cajas ni gastos cargados este mes todavía.</p>
        </div>
      )}

      {/* Resultado del mes */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="rounded-xl p-3 bg-green-50 border border-green-200">
          <p className="text-[10px] uppercase tracking-wide text-green-700 flex items-center gap-1"><ArrowDownCircle size={11} /> Ingresos</p>
          <p className="text-lg font-bold text-green-800 leading-tight">{formatMontoCurrency(resultado.ingresos)}</p>
          <p className="text-[10px] text-green-600/70">{ingresos.cajas} caja(s)</p>
        </div>
        <div className="rounded-xl p-3 bg-red-50 border border-red-200">
          <p className="text-[10px] uppercase tracking-wide text-red-700 flex items-center gap-1"><ArrowUpCircle size={11} /> Egresos</p>
          <p className="text-lg font-bold text-red-800 leading-tight">{formatMontoCurrency(resultado.egresos)}</p>
          <p className="text-[10px] text-red-600/70">sin retiros de caja</p>
        </div>
        <div className={`rounded-xl p-3 border ${resultado.resultado >= 0 ? 'bg-navy-800 border-navy-800' : 'bg-amber-100 border-amber-300'}`}>
          <p className={`text-[10px] uppercase tracking-wide flex items-center gap-1 ${resultado.resultado >= 0 ? 'text-gold-300' : 'text-amber-700'}`}><Scale size={11} /> Resultado</p>
          <p className={`text-lg font-bold leading-tight ${resultado.resultado >= 0 ? 'text-cream' : 'text-amber-900'}`}>{formatMontoCurrency(resultado.resultado)}</p>
          <p className={`text-[10px] ${resultado.resultado >= 0 ? 'text-cream/60' : 'text-amber-700'}`}>margen {resultado.margenPct}%</p>
        </div>
      </div>
      <p className="text-xs text-navy-400 mb-4 flex items-center gap-1.5">
        {resDelta >= 0 ? <TrendingUp size={13} className="text-green-600" /> : <TrendingDown size={13} className="text-red-600" />}
        Resultado {resDelta >= 0 ? 'mejor' : 'peor'} que {monthLabel(prev.year, prev.month)} en {formatMontoCurrency(Math.abs(resDelta))}.
      </p>

      {/* Tendencia */}
      <Section icon={TrendingUp} title="Tendencia (6 meses)">
        <div className="space-y-2">
          {tendencia.map(t => (
            <div key={t.label} className="text-xs">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-navy-500">{t.label}</span>
                <span className={`font-semibold ${t.resultado >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                  {t.resultado >= 0 ? '+' : ''}{formatMontoCurrency(t.resultado)}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <div className="flex-1 h-2.5 bg-navy-50 rounded-full overflow-hidden">
                  <div className="h-full bg-green-400" style={{ width: `${(t.ingresos / maxTend) * 100}%` }} />
                </div>
                <div className="flex-1 h-2.5 bg-navy-50 rounded-full overflow-hidden">
                  <div className="h-full bg-red-400" style={{ width: `${(t.egresos / maxTend) * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-navy-400 mt-2"><span className="text-green-600">█</span> ingresos · <span className="text-red-500">█</span> egresos</p>
      </Section>

      {/* Ingresos por medio + egresos por categoría */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Section icon={Banknote} title="Ingresos por medio de pago">
          <div className="space-y-1 text-xs">
            {([['Efectivo', ingresos.efectivo], ['Tarjetas', ingresos.tarjetas], ['Transf.', ingresos.transferencia], ['Cheques', ingresos.cheques], ['Otros', ingresos.otros]] as const).map(([l, v]) => (
              <div key={l} className="flex items-center justify-between">
                <span className="text-navy-600">{l}</span>
                <span className="font-semibold text-navy-800">{formatMontoCurrency(v)}</span>
              </div>
            ))}
          </div>
        </Section>
        <Section icon={ArrowUpCircle} title="Egresos por rubro">
          <div className="space-y-1 text-xs">
            {egresosCats.map(c => (
              <div key={c.label} className="flex items-center justify-between">
                <span className="text-navy-600">{c.label}</span>
                <span className="font-semibold text-navy-800">{formatMontoCurrency(c.v)}</span>
              </div>
            ))}
            {expenses.impuestosPendiente > 0 && (
              <div className="flex items-center justify-between text-amber-700 pt-1 border-t border-navy-50">
                <span>Impuestos pendientes</span>
                <span className="font-semibold">{formatMontoCurrency(expenses.impuestosPendiente)}</span>
              </div>
            )}
          </div>
        </Section>
      </div>

      {/* Revenue por ocupación */}
      <Section icon={BedDouble} title="Ingreso por ocupación (aprox.)">
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-navy-50 rounded-lg p-3">
            <p className="text-[10px] uppercase text-navy-500">Por huésped/noche</p>
            <p className="text-lg font-bold text-navy-800">{formatMontoCurrency(revenue.ingresoPorHuesped)}</p>
          </div>
          <div className="bg-navy-50 rounded-lg p-3">
            <p className="text-[10px] uppercase text-navy-500">Por habitación/noche</p>
            <p className="text-lg font-bold text-navy-800">{formatMontoCurrency(revenue.ingresoPorHabitacion)}</p>
          </div>
        </div>
        <p className="text-[10px] text-navy-400 mt-2">
          Ingreso del mes repartido sobre {revenue.diasConDatos} día(s) con ocupación cargada. Aproximado.
        </p>
      </Section>

      {/* Cuenta corriente */}
      <Section icon={CalendarClock} title="Cuenta corriente con proveedores">
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-navy-50 rounded-lg p-3">
            <p className="text-[10px] uppercase text-navy-500">Deuda pendiente</p>
            <p className="text-lg font-bold text-navy-800">{formatMontoCurrency(cc.totalPendiente)}</p>
            <p className="text-[10px] text-navy-400">{cc.items.length} factura(s)</p>
          </div>
          <div className={`rounded-lg p-3 ${cc.vencidas > 0 ? 'bg-red-50' : 'bg-navy-50'}`}>
            <p className={`text-[10px] uppercase ${cc.vencidas > 0 ? 'text-red-600' : 'text-navy-500'}`}>Ya vencido</p>
            <p className={`text-lg font-bold ${cc.vencidas > 0 ? 'text-red-700' : 'text-navy-800'}`}>{formatMontoCurrency(cc.vencidas)}</p>
          </div>
        </div>
        {cc.proximos.length > 0 ? (
          <>
            <p className="text-[11px] font-bold uppercase tracking-wide text-navy-400 mb-1.5">Vencen pronto (≤14 días)</p>
            <ul className="space-y-1 text-xs">
              {cc.proximos.map((d, i) => {
                const vencida = d.diasParaVto != null && d.diasParaVto < 0
                return (
                  <li key={i} className={`flex items-center justify-between gap-2 rounded-lg border p-2 ${vencida ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                    <span className="min-w-0 truncate text-navy-700">
                      {vencida && <AlertTriangle size={11} className="inline mr-1 text-red-600" />}
                      {d.supplierName} <span className="text-navy-400">· {d.origen}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="font-semibold text-navy-800">{formatMontoCurrency(d.monto)}</span>
                      <span className={`block text-[10px] ${vencida ? 'text-red-600' : 'text-amber-700'}`}>vto. {fmtVto(d.vencimiento)}{d.diasParaVto != null ? vencida ? ` (vencida ${-d.diasParaVto}d)` : ` (${d.diasParaVto}d)` : ''}</span>
                    </span>
                  </li>
                )
              })}
            </ul>
          </>
        ) : (
          <p className="text-xs text-navy-400">Sin vencimientos próximos.</p>
        )}
      </Section>

      {/* Gasto por proveedor */}
      {proveedores.length > 0 && (
        <Section icon={Truck} title="Gasto por proveedor (mes)">
          <div className="space-y-1.5">
            {proveedores.slice(0, 10).map(p => (
              <div key={p.proveedor} className="flex items-center gap-2 text-xs">
                <span className="w-28 sm:w-36 text-navy-600 shrink-0 truncate">{p.proveedor}</span>
                <div className="flex-1 h-3 bg-navy-50 rounded-full overflow-hidden">
                  <div className="h-full bg-gold-400 rounded-full" style={{ width: `${(p.monto / maxProv) * 100}%` }} />
                </div>
                <span className="w-28 text-right font-semibold text-navy-800 shrink-0 whitespace-nowrap">{formatMontoCurrency(p.monto)}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  )
}
