import { useMemo, useState } from 'react'
import {
  TrendingUp, TrendingDown, Scale, Banknote, ArrowDownCircle, ArrowUpCircle,
  Truck, AlertTriangle, BedDouble, Receipt, FileSpreadsheet,
  ChevronRight, Users, Building2, Croissant, LayoutGrid,
} from 'lucide-react'
import GruposPanel from '../components/GruposPanel'
import RendimientoHabitaciones from '../components/RendimientoHabitaciones'
import CostoDesayuno from '../components/CostoDesayuno'
import RetirosDeCaja from '../components/RetirosDeCaja'
import { CuentaCorrientePanel, GastoPorProveedorPanel } from '../components/ProveedoresPanel'
import { useCajas } from '../context/CajaContext'
import { usePartes } from '../context/ParteContext'
import { useOrders } from '../context/OrdersContext'
import { useStock } from '../context/StockContext'
import { useMaintenance } from '../context/MaintenanceContext'
import { useImpuestos } from '../context/ImpuestosContext'
import { useSueldos } from '../context/SueldosContext'
import { useOccupancy } from '../context/OccupancyContext'
import { useLavadero } from '../context/LavaderoContext'
import { useLibroCaja } from '../context/LibroCajaContext'
import { useMarcasLibroCaja, salidasMarcadasPorMes } from '../lib/libroCajaMarcas'
import {
  getResultadoMes, getIngresosMes, getTendencia, getCuentaCorriente,
  getGastoPorProveedor, getRevenueOcupacion, getGastosDeCajaDetalle, getRetirosDeCajaPorMes, getCostoHabitacion,
} from '../lib/negocio'
import { getMonthlyExpenses } from '../utils/monthlyMetrics'
import { exportMonthlyReport } from '../utils/monthlyExport'
import { getPreviousMonth, monthLabel, monthKey } from '../utils/dateRange'
import { formatMontoCurrency } from '../utils/validators'
import { employees } from '../data/mock'

// El dashboard es largo: en vez de un scroll infinito, cada tema es una pestaña.
// "Resumen" es la portada, con una caja por tema para entrar de un toque.
type TabId = 'resumen' | 'ingresos' | 'egresos' | 'caja' | 'habitaciones' | 'desayuno' | 'grupos' | 'proveedores'

const TABS: { id: TabId; label: string; icon: typeof Scale }[] = [
  { id: 'resumen', label: 'Resumen', icon: LayoutGrid },
  { id: 'ingresos', label: 'Ingresos', icon: Banknote },
  { id: 'egresos', label: 'Egresos', icon: ArrowUpCircle },
  { id: 'caja', label: 'Caja', icon: Receipt },
  { id: 'habitaciones', label: 'Habitaciones', icon: BedDouble },
  { id: 'desayuno', label: 'Desayuno', icon: Croissant },
  { id: 'grupos', label: 'Grupos', icon: Users },
  { id: 'proveedores', label: 'Proveedores', icon: Truck },
]

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

// Caja de la portada: el número que resume el tema y la puerta de entrada.
function Box({ icon: Icon, title, valor, hint, alerta, onClick }: {
  icon: typeof Scale; title: string; valor?: string; hint: string; alerta?: string; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-white rounded-xl border border-navy-100 p-3 hover:border-gold-400 hover:shadow-sm transition-all flex flex-col"
    >
      <p className="text-[10px] uppercase tracking-wide text-navy-500 flex items-center gap-1.5">
        <Icon size={12} className="text-gold-600 shrink-0" /> {title}
      </p>
      {valor && <p className="text-base font-bold text-navy-800 leading-tight mt-0.5">{valor}</p>}
      <p className="text-[10px] text-navy-400 mt-0.5 flex-1">{hint}</p>
      {alerta && (
        <p className="text-[10px] text-amber-700 font-semibold flex items-center gap-1 mt-1">
          <AlertTriangle size={10} className="shrink-0" /> {alerta}
        </p>
      )}
      <span className="text-[10px] font-semibold text-gold-600 inline-flex items-center gap-0.5 mt-1">
        Ver <ChevronRight size={11} />
      </span>
    </button>
  )
}

export default function Negocio({ year, month }: { year: number; month: number }) {
  const { cajas } = useCajas()
  const { partes } = usePartes()
  const { orders } = useOrders()
  const { pedidos, movements } = useStock()
  const { tasks } = useMaintenance()
  const { pagos, servicios } = useImpuestos()
  // Sueldos son solo-admin: en un dispositivo no-admin esta lista viene vacía y
  // suman 0 en los gastos (comportamiento correcto, ver ADMIN_ONLY_KEYS).
  const { pagos: pagosSueldos } = useSueldos()
  const { records } = useOccupancy()
  const { liquidaciones: lavaderoLiqs } = useLavadero()
  // Libro de caja de Administración: suman SOLO los pagos que se marcaron uno
  // por uno en esa pantalla. Sin marcas no entra nada al resultado del mes.
  const { meses: libroMeses } = useLibroCaja()
  const { marcas: libroMarcas } = useMarcasLibroCaja()
  const libroSalidas = useMemo(
    () => salidasMarcadasPorMes(libroMeses, libroMarcas),
    [libroMeses, libroMarcas],
  )

  const [tab, setTab] = useState<TabId>('resumen')

  const cur = useMemo(() => ({ year, month }), [year, month])
  const prev = useMemo(() => getPreviousMonth(cur.year, cur.month), [cur])
  // La tendencia termina en el mes que se está mirando (no en hoy), así al
  // retroceder de mes se ven los 6 meses que llegan hasta ese mes.
  const finTendencia = useMemo(() => new Date(cur.year, cur.month - 1, 15), [cur])

  const resultado = useMemo(() => getResultadoMes(cur.year, cur.month, cajas, orders, pedidos, tasks, pagos, pagosSueldos, lavaderoLiqs, libroSalidas), [cur, cajas, orders, pedidos, tasks, pagos, pagosSueldos, lavaderoLiqs, libroSalidas])
  const resultadoPrev = useMemo(() => getResultadoMes(prev.year, prev.month, cajas, orders, pedidos, tasks, pagos, pagosSueldos, lavaderoLiqs, libroSalidas), [prev, cajas, orders, pedidos, tasks, pagos, pagosSueldos, lavaderoLiqs, libroSalidas])
  const ingresos = useMemo(() => getIngresosMes(cur.year, cur.month, cajas), [cur, cajas])
  const expenses = useMemo(() => getMonthlyExpenses(cur.year, cur.month, orders, pedidos, tasks, pagos, pagosSueldos, servicios), [cur, orders, pedidos, tasks, pagos, pagosSueldos, servicios])
  const tendencia = useMemo(() => getTendencia(6, cajas, orders, pedidos, tasks, pagos, finTendencia, pagosSueldos, lavaderoLiqs, libroSalidas), [finTendencia, cajas, orders, pedidos, tasks, pagos, pagosSueldos, lavaderoLiqs, libroSalidas])
  const costoHab = useMemo(
    () => getCostoHabitacion(cur.year, cur.month, cajas, orders, pedidos, tasks, pagos, pagosSueldos, servicios, partes, records, lavaderoLiqs, undefined, libroSalidas),
    [cur, cajas, orders, pedidos, tasks, pagos, pagosSueldos, servicios, partes, records, lavaderoLiqs, libroSalidas],
  )
  const gastosCajaDetalle = useMemo(() => getGastosDeCajaDetalle(cur.year, cur.month, cajas), [cur, cajas])
  const retirosPorMes = useMemo(() => getRetirosDeCajaPorMes(cajas), [cajas])
  const cc = useMemo(() => getCuentaCorriente(orders, pedidos), [orders, pedidos])
  const proveedores = useMemo(() => getGastoPorProveedor(cur.year, cur.month, orders, pedidos), [cur, orders, pedidos])
  const revenue = useMemo(() => getRevenueOcupacion(cur.year, cur.month, cajas, records), [cur, cajas, records])

  const resDelta = resultado.resultado - resultadoPrev.resultado
  const maxTend = Math.max(...tendencia.flatMap(t => [t.ingresos, t.egresos]), 1)
  const egresosCats = [
    { label: 'Sueldos', v: expenses.sueldos },
    { label: 'Cargas sociales', v: expenses.cargasSociales },
    { label: 'Impuestos/cargas', v: expenses.impuestosPagado },
    { label: 'Servicios (luz/gas/agua)', v: expenses.serviciosPagado },
    { label: 'Profesionales/abonos', v: expenses.profesionalesPagado },
    { label: 'Pedido semanal', v: expenses.pedidosSemanales },
    { label: 'Recepción diaria', v: expenses.pedidosDistribuidor },
    { label: 'Mantenimiento', v: expenses.mantenimiento },
    { label: 'Gastos de caja', v: resultado.gastosCaja },
    { label: 'Lavadero (ropa)', v: resultado.lavadero },
    { label: 'Caja Administración (libro)', v: resultado.libro },
  ].filter(c => c.v > 0).sort((a, b) => b.v - a.v)

  const sinDatos = ingresos.total === 0 && resultado.egresos === 0
  const faltaCargar = !costoHab.sueldosCargados || !costoHab.lavaderoCargado
  const totalRetiros = retirosPorMes.find(m => m.key === monthKey(cur.year, cur.month))?.total ?? 0

  function handleExport() {
    exportMonthlyReport(cur.year, cur.month, {
      orders, pedidos, movements, tasks, pagos, records, employees, pagosSueldos, servicios,
    })
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4">
        <p className="text-sm text-navy-500">
          Lo que entra (cajas) vs lo que sale (sueldos, compras, impuestos, servicios, mantenimiento) — {monthLabel(cur.year, cur.month)}.
        </p>
        <button
          onClick={handleExport}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors shrink-0"
          title="Descargar el Excel del mes (incluye sueldos, servicios y profesionales)"
        >
          <FileSpreadsheet size={14} /> Excel
        </button>
      </div>

      {sinDatos && (
        <div className="text-center py-10 bg-white rounded-xl border border-navy-100 mb-4">
          <Scale size={40} className="mx-auto text-navy-200 mb-2" />
          <p className="text-navy-400 text-sm">Sin cajas ni gastos cargados en {monthLabel(cur.year, cur.month)}.</p>
        </div>
      )}

      {/* Resultado del mes: se ve siempre, en todas las pestañas. */}
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
      <p className="text-xs text-navy-400 mb-3 flex items-center gap-1.5">
        {resDelta >= 0 ? <TrendingUp size={13} className="text-green-600" /> : <TrendingDown size={13} className="text-red-600" />}
        Resultado {resDelta >= 0 ? 'mejor' : 'peor'} que {monthLabel(prev.year, prev.month)} en {formatMontoCurrency(Math.abs(resDelta))}.
      </p>

      {/* Pestañas: una por tema. En celular se desplazan de costado. */}
      <div className="overflow-x-auto -mx-1 px-1 mb-4">
        <div className="flex gap-1 bg-navy-100 rounded-xl p-1 w-max min-w-full">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                tab === t.id ? 'bg-white text-navy-800 shadow-sm' : 'text-navy-500 hover:text-navy-700'
              }`}
            >
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'resumen' && (
        <>
          {/* Una caja por tema: el número que lo resume y la puerta de entrada. */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
            <Box
              icon={Banknote} title="Ingresos" valor={formatMontoCurrency(ingresos.total)}
              hint={`${ingresos.cajas} caja(s) · por medio de pago y por ocupación`}
              onClick={() => setTab('ingresos')}
            />
            <Box
              icon={ArrowUpCircle} title="Egresos" valor={formatMontoCurrency(resultado.egresos)}
              hint={`${egresosCats.length} rubro(s) con gasto este mes`}
              alerta={expenses.impuestosPendiente > 0 ? `${formatMontoCurrency(expenses.impuestosPendiente)} sin pagar` : undefined}
              onClick={() => setTab('egresos')}
            />
            <Box
              icon={Receipt} title="Caja" valor={formatMontoCurrency(resultado.gastosCaja)}
              hint={`${gastosCajaDetalle.length} gasto(s) pagados de la caja · retiros: ${formatMontoCurrency(totalRetiros)}`}
              onClick={() => setTab('caja')}
            />
            <Box
              icon={BedDouble} title="Habitaciones"
              valor={costoHab.costoPorHabNoche > 0 ? formatMontoCurrency(costoHab.costoPorHabNoche) : '—'}
              hint="costo por hab/noche, ingreso por ocupación y rendimiento de cada habitación"
              alerta={faltaCargar ? 'faltan datos del mes' : undefined}
              onClick={() => setTab('habitaciones')}
            />
            <Box
              icon={Croissant} title="Desayuno"
              hint="lo que se compra para el desayuno y lo que consume cada huésped"
              onClick={() => setTab('desayuno')}
            />
            <Box
              icon={Users} title="Grupos"
              hint="los que cobra el dueño por fuera de la caja"
              onClick={() => setTab('grupos')}
            />
            <Box
              icon={Truck} title="Proveedores" valor={formatMontoCurrency(cc.totalPendiente)}
              hint={`${cc.items.length} factura(s) en cuenta corriente · gasto del mes por proveedor`}
              alerta={cc.vencidas > 0 ? `${formatMontoCurrency(cc.vencidas)} vencido` : undefined}
              onClick={() => setTab('proveedores')}
            />
          </div>

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
        </>
      )}

      {tab === 'ingresos' && (
        <>
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
        </>
      )}

      {tab === 'egresos' && (
        <Section icon={ArrowUpCircle} title="Egresos por rubro">
          <div className="space-y-1 text-xs">
            {egresosCats.length === 0 && (
              <p className="text-navy-400">Sin egresos cargados este mes.</p>
            )}
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
      )}

      {tab === 'caja' && (
        <>
          {/* Desglose de gastos de caja del mes (NO incluye retiros a caja fuerte) */}
          <Section icon={Receipt} title={`Gastos de caja — desglose (${gastosCajaDetalle.length})`}>
            {gastosCajaDetalle.length === 0 ? (
              <p className="text-xs text-navy-400">Sin gastos pagados de la caja este mes.</p>
            ) : (
              <ul className="space-y-1 text-xs">
                {gastosCajaDetalle.map((g, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 border-b border-navy-50 last:border-0 py-1">
                    <span className="min-w-0 truncate text-navy-700">
                      {g.observacion}
                      <span className="text-navy-400"> · Caja {g.nroCaja}{g.conserje ? ` · ${g.conserje}` : ''}</span>
                    </span>
                    <span className="shrink-0 font-semibold text-navy-800">{formatMontoCurrency(g.total)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-[10px] text-navy-400 mt-2">No incluye los retiros a la caja fuerte (no son gasto).</p>
          </Section>

          <Section icon={Banknote} title="Retiros de efectivo por mes">
            <RetirosDeCaja meses={retirosPorMes} mesKey={monthKey(cur.year, cur.month)} />
          </Section>
        </>
      )}

      {tab === 'habitaciones' && (
        <>
          <Section icon={BedDouble} title="Costo por habitación (mes)">
            {faltaCargar && (
              <div className="flex items-start gap-2 rounded-lg border-2 border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 mb-3">
                <AlertTriangle size={14} className="shrink-0 mt-0.5" />
                <span>
                  <strong>El costo da incompleto:</strong> falta cargar
                  {!costoHab.sueldosCargados ? ' los sueldos del mes' : ''}
                  {!costoHab.sueldosCargados && !costoHab.lavaderoCargado ? ' y' : ''}
                  {!costoHab.lavaderoCargado ? ' la liquidación del lavadero' : ''}.
                </span>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-navy-800 rounded-lg p-3">
                <p className="text-[10px] uppercase text-gold-300">Costo por habitación/noche</p>
                <p className="text-lg font-bold text-cream">{costoHab.costoPorHabNoche > 0 ? formatMontoCurrency(costoHab.costoPorHabNoche) : '—'}</p>
                <p className="text-[10px] text-cream/60">
                  {costoHab.noches.fuente === 'sin datos'
                    ? 'sin partes ni ocupación cargados'
                    : `${costoHab.nochesEstimadas} noches-hab (${costoHab.noches.dias} día(s) con dato, ${costoHab.noches.fuente === 'partes' ? 'de los partes' : 'de ocupación manual'})`}
                </p>
              </div>
              <div className="bg-navy-50 rounded-lg p-3">
                <p className="text-[10px] uppercase text-navy-500">Costos totales del mes</p>
                <p className="text-lg font-bold text-navy-800">{formatMontoCurrency(costoHab.costoTotal)}</p>
                <p className="text-[10px] text-navy-400">vs ingreso por hab/noche: {formatMontoCurrency(revenue.ingresoPorHabitacion)}</p>
              </div>
            </div>
            {costoHab.desglose.length > 0 && (
              <div className="space-y-1 text-xs">
                {costoHab.desglose.map(d => (
                  <div key={d.label} className="flex items-center justify-between">
                    <span className="text-navy-600">{d.label}</span>
                    <span className="font-semibold text-navy-800">{formatMontoCurrency(d.monto)}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Lo mismo pero SIN promediar: cada cobro del PMS trae su habitación, así
              que acá se ve cuál factura de verdad y cuál no se vende. */}
          <Section icon={Building2} title="Rendimiento por habitación">
            <RendimientoHabitaciones year={cur.year} month={cur.month} />
          </Section>
        </>
      )}

      {/* El desayuno como unidad aparte: lo que se compra para él y lo que se
          lleva cada huésped. Es el otro costo que escala con la gente, igual
          que el lavadero. */}
      {tab === 'desayuno' && (
        <Section icon={Croissant} title="Desayuno — gasto y consumo por huésped">
          <CostoDesayuno year={cur.year} month={cur.month} />
        </Section>
      )}

      {/* Grupos: lo que cobra el dueño por fuera de la caja. Es el espejo de la
          cuenta corriente: acá lo que NOS deben. */}
      {tab === 'grupos' && (
        <Section icon={Users} title="Grupos (cobrados por fuera de la caja)">
          <GruposPanel />
        </Section>
      )}

      {tab === 'proveedores' && (
        <>
          <Section icon={Truck} title="Cuenta corriente con proveedores">
            <CuentaCorrientePanel cc={cc} />
          </Section>
          <Section icon={Truck} title="Gasto por proveedor (mes)">
            <GastoPorProveedorPanel proveedores={proveedores} />
          </Section>
        </>
      )}
    </div>
  )
}
