import { useMemo, useState } from 'react'
import {
  Sparkles, TrendingUp, TrendingDown, Minus, ChevronLeft, ChevronRight,
  ArrowUpCircle, Package, Receipt, BedDouble, AlertTriangle, RefreshCw, Shirt,
} from 'lucide-react'
import { useCajas } from '../context/CajaContext'
import { usePartes } from '../context/ParteContext'
import { useOrders } from '../context/OrdersContext'
import { useStock } from '../context/StockContext'
import { useMaintenance } from '../context/MaintenanceContext'
import { useImpuestos } from '../context/ImpuestosContext'
import { useSueldos } from '../context/SueldosContext'
import { useOccupancy } from '../context/OccupancyContext'
import { useLavadero } from '../context/LavaderoContext'
import { getAnalisisMes, type RubroComparado } from '../lib/analisisMes'
import { analizarMesIA, getAnalisisCacheado, cachearAnalisis } from '../lib/analisisIA'
import { getCurrentMonth, getPreviousMonth, getNextMonth, monthLabel } from '../utils/dateRange'
import { formatMontoCurrency } from '../utils/validators'
import type { Delta } from '../utils/monthlyMetrics'

function DeltaBadge({ delta, malo = 'up', pct = true }: { delta: Delta; malo?: 'up' | 'down'; pct?: boolean }) {
  // malo: para egresos/costos subir es malo (rojo); para ingresos subir es bueno (verde).
  if (delta.direction === 'flat') {
    return <span className="inline-flex items-center gap-0.5 text-[11px] text-navy-400"><Minus size={11} /> sin cambio</span>
  }
  const up = delta.direction === 'up'
  const esMalo = (up && malo === 'up') || (!up && malo === 'down')
  const cls = esMalo ? 'text-red-600' : 'text-green-600'
  const Icon = up ? TrendingUp : TrendingDown
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${cls}`}>
      <Icon size={11} /> {up ? '+' : ''}{pct ? `${delta.pct}%` : formatMontoCurrency(delta.absolute)}
    </span>
  )
}

function FilaRubro({ r, malo = 'up' }: { r: RubroComparado; malo?: 'up' | 'down' }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs border-b border-navy-50 last:border-0 py-1.5">
      <span className="min-w-0 truncate text-navy-700">{r.rubro}</span>
      <span className="shrink-0 text-right">
        <span className="font-semibold text-navy-800">{formatMontoCurrency(r.actual)}</span>
        <span className="block">
          <DeltaBadge delta={r.delta} malo={malo} />
          <span className="text-[10px] text-navy-400"> · antes {formatMontoCurrency(r.anterior)}</span>
        </span>
      </span>
    </div>
  )
}

function Section({ icon: Icon, title, children }: { icon: typeof Sparkles; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-navy-100 p-4 mb-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-navy-500 mb-3 flex items-center gap-2">
        <Icon size={15} className="text-gold-600" /> {title}
      </h3>
      {children}
    </section>
  )
}

export default function AnalisisMes() {
  const { cajas } = useCajas()
  const { partes } = usePartes()
  const { orders } = useOrders()
  const { pedidos, movements } = useStock()
  const { tasks } = useMaintenance()
  const { pagos, servicios } = useImpuestos()
  const { pagos: pagosSueldos } = useSueldos()
  const { records } = useOccupancy()
  const { movimientos: lavaderoMovs, liquidaciones: lavaderoLiqs } = useLavadero()

  const actual = useMemo(() => getCurrentMonth(), [])
  const [{ year, month }, setMes] = useState(actual)
  const esMesActual = year === actual.year && month === actual.month

  const a = useMemo(
    () => getAnalisisMes(year, month, {
      cajas, orders, pedidos, tasks, pagos, pagosSueldos, servicios, movements, partes, records, lavaderoMovs, lavaderoLiqs,
    }),
    [year, month, cajas, orders, pedidos, tasks, pagos, pagosSueldos, servicios, movements, partes, records, lavaderoMovs, lavaderoLiqs],
  )

  // --- IA ---
  const [iaTexto, setIaTexto] = useState<string | null>(() => getAnalisisCacheado(a.mes)?.texto ?? null)
  const [iaBusy, setIaBusy] = useState(false)
  const [iaError, setIaError] = useState('')

  function cambiarMes(dir: -1 | 1) {
    const next = dir === -1 ? getPreviousMonth(year, month) : getNextMonth(year, month)
    setMes(next)
    setIaTexto(getAnalisisCacheado(`${next.year}-${String(next.month).padStart(2, '0')}`)?.texto ?? null)
    setIaError('')
  }

  async function generarIA() {
    setIaBusy(true)
    setIaError('')
    try {
      const texto = await analizarMesIA(a)
      setIaTexto(texto)
      cachearAnalisis(a.mes, texto)
    } catch (e) {
      setIaError(e instanceof Error ? e.message : 'No se pudo generar el análisis.')
    } finally {
      setIaBusy(false)
    }
  }

  const faltantes: string[] = []
  if (!a.costoHabitacion.sueldosCargados) faltantes.push('los sueldos del mes')
  if (!a.costoHabitacion.lavaderoCargado) faltantes.push('la liquidación del lavadero')

  return (
    <div>
      {/* Selector de mes */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <p className="text-sm text-navy-500">
          Qué subió y qué bajó contra {a.labelAnterior}, con el detalle de cada rubro.
        </p>
        <div className="flex items-center gap-1 bg-white border border-navy-100 rounded-xl px-1 py-1 shrink-0">
          <button onClick={() => cambiarMes(-1)} className="p-1.5 rounded-lg text-navy-500 hover:bg-navy-50"><ChevronLeft size={16} /></button>
          <span className="text-xs font-bold text-navy-800 capitalize w-28 text-center">{monthLabel(year, month)}</span>
          <button onClick={() => cambiarMes(1)} disabled={esMesActual} className={`p-1.5 rounded-lg ${esMesActual ? 'text-navy-200' : 'text-navy-500 hover:bg-navy-50'}`}><ChevronRight size={16} /></button>
        </div>
      </div>

      {/* Datos faltantes para que el análisis sea real */}
      {faltantes.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 p-3 mb-4 text-amber-800">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <p className="text-xs">
            <strong>Faltan cargar {faltantes.join(' y ')}.</strong> Hasta que no estén, los egresos y el
            costo por habitación dan de menos.
          </p>
        </div>
      )}

      {/* KPIs con delta */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div className="bg-white rounded-xl border border-navy-100 p-3">
          <p className="text-[10px] uppercase text-navy-500">Ingresos</p>
          <p className="text-base font-bold text-navy-800 leading-tight">{formatMontoCurrency(a.ingresos.actual)}</p>
          <DeltaBadge delta={a.ingresos.delta} malo="down" />
        </div>
        <div className="bg-white rounded-xl border border-navy-100 p-3">
          <p className="text-[10px] uppercase text-navy-500">Egresos</p>
          <p className="text-base font-bold text-navy-800 leading-tight">{formatMontoCurrency(a.egresos.actual)}</p>
          <DeltaBadge delta={a.egresos.delta} malo="up" />
        </div>
        <div className="bg-white rounded-xl border border-navy-100 p-3">
          <p className="text-[10px] uppercase text-navy-500">Resultado</p>
          <p className={`text-base font-bold leading-tight ${a.resultado.actual >= 0 ? 'text-green-700' : 'text-red-600'}`}>{formatMontoCurrency(a.resultado.actual)}</p>
          <DeltaBadge delta={a.resultado.delta} malo="down" />
        </div>
        <div className="bg-white rounded-xl border border-navy-100 p-3">
          <p className="text-[10px] uppercase text-navy-500">Costo por hab/noche</p>
          <p className="text-base font-bold text-navy-800 leading-tight">{a.costoHabitacion.actual > 0 ? formatMontoCurrency(a.costoHabitacion.actual) : '—'}</p>
          {a.costoHabitacion.actual > 0 && <DeltaBadge delta={a.costoHabitacion.delta} malo="up" />}
        </div>
      </div>

      {/* Análisis IA */}
      <Section icon={Sparkles} title="Análisis con IA">
        {iaTexto ? (
          <>
            <p className="text-sm text-navy-700 whitespace-pre-wrap leading-relaxed">{iaTexto}</p>
            <button
              onClick={generarIA}
              disabled={iaBusy}
              className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-navy-200 text-xs font-semibold text-navy-600 hover:bg-navy-50 disabled:opacity-60"
            >
              <RefreshCw size={13} className={iaBusy ? 'animate-spin' : ''} /> {iaBusy ? 'Analizando…' : 'Regenerar con los números de hoy'}
            </button>
          </>
        ) : (
          <div className="text-center py-4">
            <p className="text-xs text-navy-400 mb-3">
              La IA lee todos los números de {monthLabel(year, month)} (los de esta pantalla) y te escribe
              qué subió, qué bajó, alertas y recomendaciones.
            </p>
            <button
              onClick={generarIA}
              disabled={iaBusy}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-navy-800 text-cream text-sm font-bold hover:bg-navy-700 disabled:opacity-60"
            >
              <Sparkles size={16} className={iaBusy ? 'animate-pulse' : ''} />
              {iaBusy ? 'Analizando el mes…' : 'Generar análisis del mes'}
            </button>
          </div>
        )}
        {iaError && <p className="text-xs text-red-600 mt-2">{iaError}</p>}
      </Section>

      {/* Egresos por rubro */}
      <Section icon={ArrowUpCircle} title="Egresos por rubro — qué subió y qué bajó">
        {a.egresosPorRubro.length === 0
          ? <p className="text-xs text-navy-400">Sin egresos cargados en estos dos meses.</p>
          : a.egresosPorRubro.map(r => <FilaRubro key={r.rubro} r={r} malo="up" />)}
      </Section>

      {/* Impuestos y servicios, uno por uno */}
      <Section icon={Receipt} title="Impuestos y servicios, uno por uno">
        {a.serviciosDetalle.length === 0
          ? <p className="text-xs text-navy-400">Sin pagos de impuestos/servicios cargados en estos dos meses.</p>
          : a.serviciosDetalle.map(r => <FilaRubro key={r.rubro} r={r} malo="up" />)}
        {a.impuestosPendientes > 0 && (
          <p className="text-xs text-amber-700 mt-2 flex items-center gap-1.5">
            <AlertTriangle size={13} /> Quedan {formatMontoCurrency(a.impuestosPendientes)} de impuestos del mes sin pagar.
          </p>
        )}
      </Section>

      {/* Stock */}
      <Section icon={Package} title="Depósito — entradas, salidas y consumo">
        <div className="grid grid-cols-2 gap-2 mb-3">
          <div className="bg-navy-50 rounded-lg p-2.5">
            <p className="text-[10px] uppercase text-navy-500">Entradas (unidades)</p>
            <p className="text-sm font-bold text-navy-800">{a.stockEntradas.actual}</p>
            <DeltaBadge delta={a.stockEntradas.delta} malo="down" />
          </div>
          <div className="bg-navy-50 rounded-lg p-2.5">
            <p className="text-[10px] uppercase text-navy-500">Salidas (unidades)</p>
            <p className="text-sm font-bold text-navy-800">{a.stockSalidas.actual}</p>
            <DeltaBadge delta={a.stockSalidas.delta} malo="up" />
          </div>
        </div>
        {a.stockPorItem.length > 0 && (
          <>
            <p className="text-[11px] font-bold uppercase tracking-wide text-navy-400 mb-1">Consumo por producto (top)</p>
            {a.stockPorItem.map(s => (
              <div key={s.item} className="flex items-center justify-between gap-2 text-xs border-b border-navy-50 last:border-0 py-1.5">
                <span className="min-w-0 truncate text-navy-700">{s.item}</span>
                <span className="shrink-0 text-right">
                  <span className="font-semibold text-navy-800">{s.salidas}</span>
                  <span className="text-[10px] text-navy-400"> (antes {s.salidasAnterior}) </span>
                  <DeltaBadge delta={s.delta} malo="up" />
                </span>
              </div>
            ))}
          </>
        )}
      </Section>

      {/* Ocupación + lavadero */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Section icon={BedDouble} title="Ocupación">
          <p className="text-2xl font-bold text-navy-800">{a.ocupacionPromedioPct.actual}%</p>
          <DeltaBadge delta={a.ocupacionPromedioPct.delta} malo="down" />
          <p className="text-[10px] text-navy-400 mt-1">Promedio de los partes del mes (antes {a.ocupacionPromedioPct.anterior}%).</p>
        </Section>
        <Section icon={Shirt} title="Lavadero">
          <p className="text-xs text-navy-700 mb-1">
            {a.lavadero.enviadas} prendas salieron · {a.lavadero.recibidas} volvieron
          </p>
          <p className="text-xs text-navy-700">
            Costo del mes: <span className="font-semibold">{a.lavadero.costo != null ? formatMontoCurrency(a.lavadero.costo) : 'sin liquidación cargada'}</span>
          </p>
          {a.lavadero.deudaPendiente > 0 && (
            <p className="text-xs text-amber-700 mt-1">Deuda pendiente: {formatMontoCurrency(a.lavadero.deudaPendiente)}</p>
          )}
        </Section>
      </div>
    </div>
  )
}
