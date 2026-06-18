import { useMemo, useState } from 'react'
import {
  ChevronLeft, ChevronRight, Wallet, BedDouble, ShoppingCart, AlertTriangle, CheckCircle2, LogOut,
} from 'lucide-react'
import { useCajas } from '../context/CajaContext'
import { usePartes } from '../context/ParteContext'
import { buildResumen } from '../lib/controlResumen'
import { isInMonth, monthLabel } from '../utils/dateRange'
import { formatMontoCurrency } from '../utils/validators'

const pad = (n: number) => String(n).padStart(2, '0')
function localDay(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
function addDays(dia: string, delta: number): string {
  const [y, m, d] = dia.split('-').map(Number)
  const date = new Date(y, m - 1, d + delta)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
function diaLabel(dia: string): string {
  const [y, m, d] = dia.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: '2-digit' })
}

function Chip({ label, value, tone = 'navy' }: { label: string; value: string; tone?: 'navy' | 'red' | 'amber' | 'green' }) {
  const cls = {
    navy: 'bg-navy-50 text-navy-800',
    red: 'bg-red-50 text-red-700',
    amber: 'bg-amber-50 text-amber-700',
    green: 'bg-green-50 text-green-700',
  }[tone]
  return (
    <div className={`rounded-lg p-2 ${cls}`}>
      <p className="text-[10px] uppercase opacity-70">{label}</p>
      <p className="text-sm font-bold">{value}</p>
    </div>
  )
}

export default function ControlResumenPanel() {
  const { cajas } = useCajas()
  const { partes } = usePartes()
  const [dia, setDia] = useState(() => (cajas[0] ? localDay(cajas[0].aperturaAt) : localDay(new Date().toISOString())))

  const [y, m] = dia.split('-').map(Number)

  const cajasDia = useMemo(() => cajas.filter(c => localDay(c.aperturaAt) === dia), [cajas, dia])
  const cajasMes = useMemo(() => cajas.filter(c => isInMonth(c.aperturaAt, y, m)), [cajas, y, m])
  const rDia = useMemo(() => buildResumen(cajasDia, cajas, partes), [cajasDia, cajas, partes])
  const rMes = useMemo(() => buildResumen(cajasMes, cajas, partes), [cajasMes, cajas, partes])

  if (cajas.length === 0) return null

  return (
    <div className="bg-white rounded-xl border border-navy-100 p-3 mb-4">
      {/* Total del mes */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-navy-100">
        <p className="text-xs font-bold uppercase tracking-wide text-navy-500">Resumen de control · {monthLabel(y, m)}</p>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-navy-600">
          <span>Cobrado mes: <strong className="text-navy-800">{formatMontoCurrency(rMes.totalCobrado)}</strong></span>
          <span>Compras: <strong className="text-navy-800">{formatMontoCurrency(rMes.totalCompras)}</strong></span>
          {rMes.checkoutsSinCobro > 0 && <span className="text-red-600">{rMes.checkoutsSinCobro} check-out sin cobro</span>}
          {rMes.descuadres > 0 && <span className="text-red-600">{rMes.descuadres} descuadre(s)</span>}
        </div>
      </div>

      {/* Navegación por día */}
      <div className="flex items-center justify-between my-2">
        <button onClick={() => setDia(addDays(dia, -1))} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600"><ChevronLeft size={18} /></button>
        <div className="text-center">
          <p className="font-bold text-navy-800 capitalize">{diaLabel(dia)}</p>
          <p className="text-[11px] text-navy-400">{rDia.nCajas} turno(s) con caja</p>
        </div>
        <button onClick={() => setDia(addDays(dia, 1))} className="p-1.5 rounded-lg hover:bg-navy-100 text-navy-600"><ChevronRight size={18} /></button>
      </div>

      {rDia.nCajas === 0 ? (
        <p className="text-center text-sm text-navy-400 py-3">Sin cajas cargadas este día.</p>
      ) : (
        <div className="space-y-3">
          {/* Dinero */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-navy-400 mb-1 flex items-center gap-1.5"><Wallet size={12} /> Dinero</p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              <Chip label="Cobrado" value={formatMontoCurrency(rDia.totalCobrado)} tone="green" />
              <Chip label="Efectivo" value={formatMontoCurrency(rDia.efectivo)} />
              <Chip label="Tarjetas" value={formatMontoCurrency(rDia.tarjetas)} />
              <Chip label="Transf." value={formatMontoCurrency(rDia.transferencia)} />
              <Chip label="Retiros efvo" value={formatMontoCurrency(rDia.retirosEfectivo)} />
              <Chip label="Tarj. sin FB" value={String(rDia.tarjetaSinFB)} tone={rDia.tarjetaSinFB > 0 ? 'red' : 'navy'} />
            </div>
            {rDia.descuadres > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-red-600 mt-1.5"><AlertTriangle size={13} /> {rDia.descuadres} descuadre(s) de continuidad entre turnos.</p>
            )}
          </div>

          {/* Habitaciones */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-navy-400 mb-1 flex items-center gap-1.5"><BedDouble size={12} /> Habitaciones</p>
            <div className="grid grid-cols-3 gap-2">
              <Chip label="Ocupación" value={rDia.ocupacionPct != null ? `${rDia.ocupacionPct}%` : '—'} />
              <Chip label="Ocupadas / libres" value={rDia.ocupadas != null ? `${rDia.ocupadas} / ${rDia.libres}` : '—'} />
              <Chip label="Check-outs" value={`${rDia.checkouts}${rDia.checkoutsSinCobro > 0 ? ` · ${rDia.checkoutsSinCobro} sin cobro` : ''}`} tone={rDia.checkoutsSinCobro > 0 ? 'red' : 'navy'} />
            </div>
            {rDia.partesFaltantes.length > 0 && (
              <p className="flex items-center gap-1.5 text-xs text-amber-600 mt-1.5"><LogOut size={13} /> Falta el parte de la(s) caja(s): {rDia.partesFaltantes.join(', ')}.</p>
            )}
          </div>

          {/* Compras externas */}
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-navy-400 mb-1 flex items-center gap-1.5">
              <ShoppingCart size={12} /> Compras externas desde caja · {formatMontoCurrency(rDia.totalCompras)}
            </p>
            {rDia.compras.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-green-700"><CheckCircle2 size={13} /> Sin salidas de caja para compras.</div>
            ) : (
              <ul className="text-xs divide-y divide-navy-50 border border-navy-100 rounded-lg">
                {rDia.compras.map((c, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 px-2.5 py-1.5">
                    <span className="text-navy-700 truncate">
                      <span className="font-semibold">{c.observacion}</span>
                      <span className="text-navy-400"> · Caja {c.nroCaja} · {c.conserje}</span>
                    </span>
                    <span className="font-bold text-navy-800 shrink-0">{formatMontoCurrency(c.monto)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
