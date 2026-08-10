// Pestaña "Tarifa" del Dashboard: la decisión de precio con datos.
//
// Arriba las sugerencias (lo accionable), abajo la evidencia: qué pasó con la
// ocupación en cada período de tarifa, qué noches se llenan y cuáles no, y
// cuántos cobros pagan el precio de lista vs el descuento por efectivo.
// No está partido por mes: cada período de tarifa es la unidad de comparación.

import { useMemo } from 'react'
import {
  Tag, TrendingUp, CalendarDays, AlertTriangle, BedDouble, Banknote,
  ArrowUpRight, Minus, LayoutList,
} from 'lucide-react'
import { useCajas } from '../context/CajaContext'
import { usePartes } from '../context/ParteContext'
import { useTarifas } from '../context/TarifasContext'
import { useOrders } from '../context/OrdersContext'
import { useStock } from '../context/StockContext'
import { useMaintenance } from '../context/MaintenanceContext'
import { useImpuestos } from '../context/ImpuestosContext'
import { useSueldos } from '../context/SueldosContext'
import { useOccupancy } from '../context/OccupancyContext'
import { useLavadero } from '../context/LavaderoContext'
import {
  getAnalisisTarifa, TIPO_NOCHE_LABELS,
  type SugerenciaTarifa, type OcupacionAgrupada, type NocheTarifa,
} from '../lib/analisisTarifa'
import { getCostoHabitacion } from '../lib/negocio'
import { getCurrentMonth } from '../utils/dateRange'
import { formatMontoCurrency } from '../utils/validators'

function Section({ icon: Icon, title, children }: { icon: typeof Tag; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-navy-100 p-4 mb-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-navy-500 mb-3 flex items-center gap-2">
        <Icon size={15} className="text-gold-600" /> {title}
      </h3>
      {children}
    </section>
  )
}

function fmtFecha(s: string): string {
  const d = new Date(`${s}T12:00:00`)
  return isNaN(d.getTime()) ? s : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

// Barra de ocupación: verde lleno, ámbar medio, rojo flojo.
function BarraOcupacion({ pct }: { pct: number }) {
  const color = pct >= 90 ? 'bg-green-500' : pct >= 60 ? 'bg-gold-400' : 'bg-red-400'
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-navy-50 rounded-full overflow-hidden min-w-[40px]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
      <span className="font-semibold text-navy-800 text-xs w-9 text-right">{pct}%</span>
    </div>
  )
}

const TIPO_CHIP: Record<NocheTarifa['tipo'], string> = {
  'finde-largo': 'bg-purple-100 text-purple-700',
  finde: 'bg-gold-100 text-gold-700',
  semana: 'bg-navy-50 text-navy-500',
}

const ACCION_UI = {
  'subir-fuerte': { label: 'Subir fuerte', cls: 'bg-green-50 border-green-300 text-green-800', icon: ArrowUpRight },
  subir: { label: 'Subir', cls: 'bg-green-50 border-green-200 text-green-700', icon: ArrowUpRight },
  mantener: { label: 'Mantener', cls: 'bg-navy-50 border-navy-200 text-navy-700', icon: Minus },
  'no-subir': { label: 'No subir', cls: 'bg-amber-50 border-amber-300 text-amber-800', icon: AlertTriangle },
} as const

function SugerenciaCard({ s }: { s: SugerenciaTarifa }) {
  const ui = ACCION_UI[s.accion]
  const sube = s.tarifaSugerida !== s.tarifaActual
  return (
    <div className={`rounded-xl border-2 p-3 ${ui.cls}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wide">{TIPO_NOCHE_LABELS[s.tipo]}</p>
        <span className="text-[10px] font-bold inline-flex items-center gap-1"><ui.icon size={12} /> {ui.label}</span>
      </div>
      <p className="text-lg font-bold leading-tight mt-1.5">
        {sube
          ? <>{formatMontoCurrency(s.tarifaActual)} → {formatMontoCurrency(s.tarifaSugerida)}</>
          : formatMontoCurrency(s.tarifaActual)}
        <span className="text-[10px] font-normal opacity-70"> /persona/noche</span>
      </p>
      <p className="text-[11px] mt-1 leading-snug">{s.motivo}</p>
      <p className="text-[10px] opacity-60 mt-1.5">
        {s.ocupacionPromPct}% de ocupación promedio · {s.nochesLlenas} de {s.noches} noche(s) llenas
      </p>
    </div>
  )
}

function FilaAgrupada({ g }: { g: OcupacionAgrupada }) {
  return (
    <div className="flex items-center gap-2 text-xs py-1">
      <span className="w-24 shrink-0 text-navy-600 capitalize">{g.label}</span>
      <div className="flex-1"><BarraOcupacion pct={g.ocupacionPromPct} /></div>
      <span className="w-24 shrink-0 text-right text-navy-400 text-[10px]">
        {g.nochesLlenas > 0 ? `${g.nochesLlenas}/${g.noches} llenas` : `${g.noches} noche(s)`}
      </span>
    </div>
  )
}

export default function AnalisisTarifa() {
  const { cajas } = useCajas()
  const { partes } = usePartes()
  const { tarifas } = useTarifas()
  const { orders } = useOrders()
  const { pedidos } = useStock()
  const { tasks } = useMaintenance()
  const { pagos, servicios } = useImpuestos()
  const { pagos: pagosSueldos } = useSueldos()
  const { records } = useOccupancy()
  const { liquidaciones: lavaderoLiqs } = useLavadero()

  // Piso de rentabilidad: el costo por hab-noche del mes en curso (el más
  // representativo de la estructura de costos de HOY).
  const cur = useMemo(() => getCurrentMonth(), [])
  const costoHab = useMemo(
    () => getCostoHabitacion(cur.year, cur.month, cajas, orders, pedidos, tasks, pagos, pagosSueldos, servicios, partes, records, lavaderoLiqs),
    [cur, cajas, orders, pedidos, tasks, pagos, pagosSueldos, servicios, partes, records, lavaderoLiqs],
  )

  const a = useMemo(
    () => getAnalisisTarifa(cajas, partes, tarifas, { costoPorHabNoche: costoHab.costoPorHabNoche }),
    [cajas, partes, tarifas, costoHab.costoPorHabNoche],
  )

  if (a.noches.length === 0) {
    return (
      <div className="text-center py-16">
        <LayoutList size={48} className="mx-auto text-navy-200 mb-3" />
        <p className="text-navy-500 font-semibold">Sin partes del turno noche importados</p>
        <p className="text-navy-400 text-sm mt-1">El análisis de tarifa necesita saber quién durmió cada noche.</p>
      </div>
    )
  }

  const ultimas = [...a.noches].slice(-30).reverse()

  return (
    <div>
      {a.avisos.map(av => (
        <div key={av} className="flex items-start gap-2 rounded-xl border-2 border-amber-300 bg-amber-50 text-amber-800 p-3 mb-3">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <p className="text-xs">{av}</p>
        </div>
      ))}

      <Section icon={Tag} title="Sugerencia de tarifa por tipo de noche">
        {a.referencia && (
          <p className="text-[11px] text-navy-400 mb-2">
            Basada en la ocupación real desde el {fmtFecha(a.referencia.desde)} a la tarifa vigente de {formatMontoCurrency(a.referencia.tarifaPorPersona)} por persona.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {a.sugerencias.map(s => <SugerenciaCard key={s.tipo} s={s} />)}
        </div>
        {a.pisoPorPersona != null && (
          <p className="text-[11px] text-navy-500 mt-3 flex items-center gap-1.5">
            <BedDouble size={13} className="text-gold-600 shrink-0" />
            Piso de rentabilidad: con los costos de este mes, una noche vendida por debajo de ≈{formatMontoCurrency(a.pisoPorPersona)} por persona pierde plata.
          </p>
        )}
      </Section>

      <Section icon={TrendingUp} title="Qué pasó en cada período de tarifa">
        <p className="text-[11px] text-navy-400 mb-2">
          Cada cambio de precio es una prueba: si la ocupación aguantó la suba, había margen. Comparar siempre el mismo tipo de noche.
        </p>
        <div className="space-y-3">
          {a.periodos.map(p => (
            <div key={p.desde} className="rounded-lg border border-navy-100 p-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-bold text-navy-800">
                  {fmtFecha(p.desde)} al {fmtFecha(p.hasta)}
                </p>
                <p className="text-xs font-bold text-gold-700">{formatMontoCurrency(p.tarifaPorPersona)} /persona</p>
              </div>
              {p.porTipo.map(g => <FilaAgrupada key={g.label} g={g} />)}
              <div className="border-t border-navy-50 mt-1 pt-1">
                <FilaAgrupada g={p.total} />
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section icon={CalendarDays} title="Ocupación por día de semana">
        {a.porDiaSemana.map(g => <FilaAgrupada key={g.label} g={g} />)}
      </Section>

      <Section icon={Banknote} title="A qué precio se cobra de verdad">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg bg-navy-50 p-2.5">
            <p className="text-lg font-bold text-navy-800">{a.cobros.aLista}</p>
            <p className="text-[10px] text-navy-500">a precio de lista</p>
            <p className="text-[10px] text-navy-400">{formatMontoCurrency(a.cobros.montoLista)}</p>
          </div>
          <div className="rounded-lg bg-green-50 p-2.5">
            <p className="text-lg font-bold text-green-800">{a.cobros.aEfectivo}</p>
            <p className="text-[10px] text-green-700">con descuento efectivo</p>
            <p className="text-[10px] text-green-600">{formatMontoCurrency(a.cobros.montoEfectivo)}</p>
          </div>
          <div className="rounded-lg bg-amber-50 p-2.5">
            <p className="text-lg font-bold text-amber-800">{a.cobros.fuera}</p>
            <p className="text-[10px] text-amber-700">fuera de tarifa</p>
            <p className="text-[10px] text-amber-600">{formatMontoCurrency(a.cobros.montoFuera)}</p>
          </div>
        </div>
        <p className="text-[11px] text-navy-500 mt-2">
          {a.cobros.pctEfectivo}% de los cobros comparables pagan el precio con descuento: la tarifa real promedio está más cerca del precio de efectivo que del de lista.
          {a.cobros.sinDatos > 0 && ` (${a.cobros.sinDatos} cobro(s) sin parte o sin tarifa para comparar.)`}
        </p>
      </Section>

      <Section icon={BedDouble} title="Últimas 30 noches">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-[10px] uppercase text-navy-400 border-b border-navy-100">
                <th className="py-1.5 pr-2">Noche</th>
                <th className="px-2">Tipo</th>
                <th className="px-2 w-1/3">Ocupación</th>
                <th className="px-2 text-center">Personas</th>
                <th className="pl-2 text-right">Tarifa</th>
              </tr>
            </thead>
            <tbody>
              {ultimas.map(n => (
                <tr key={n.fecha} className="border-b border-navy-50 last:border-0">
                  <td className="py-1.5 pr-2 font-semibold text-navy-800 whitespace-nowrap capitalize">
                    {new Date(`${n.fecha}T12:00:00`).toLocaleDateString('es-AR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                  </td>
                  <td className="px-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold whitespace-nowrap ${TIPO_CHIP[n.tipo]}`}>
                      {TIPO_NOCHE_LABELS[n.tipo]}
                    </span>
                  </td>
                  <td className="px-2"><BarraOcupacion pct={n.ocupacionPct} /></td>
                  <td className="px-2 text-center text-navy-600">{n.plazas}</td>
                  <td className="pl-2 text-right text-navy-600 whitespace-nowrap">
                    {n.tarifaPorPersona != null ? formatMontoCurrency(n.tarifaPorPersona) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  )
}
