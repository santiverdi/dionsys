// Proveedores: lo que les debemos (cuenta corriente) y lo que se les gastó en el
// mes. Van juntos porque son la misma pregunta desde dos lados.

import { AlertTriangle } from 'lucide-react'
import type { CuentaCorriente, GastoProveedor } from '../lib/negocio'
import { formatMontoCurrency } from '../utils/validators'

function fmtVto(s?: string): string {
  if (!s) return 'sin vto.'
  const d = new Date(s + 'T00:00:00')
  if (isNaN(d.getTime())) return s
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

export function CuentaCorrientePanel({ cc }: { cc: CuentaCorriente }) {
  return (
    <>
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
                    <span className={`block text-[10px] ${vencida ? 'text-red-600' : 'text-amber-700'}`}>
                      vto. {fmtVto(d.vencimiento)}{d.diasParaVto != null ? vencida ? ` (vencida ${-d.diasParaVto}d)` : ` (${d.diasParaVto}d)` : ''}
                    </span>
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      ) : (
        <p className="text-xs text-navy-400">Sin vencimientos próximos.</p>
      )}
    </>
  )
}

export function GastoPorProveedorPanel({ proveedores }: { proveedores: GastoProveedor[] }) {
  if (proveedores.length === 0) {
    return <p className="text-xs text-navy-400">Sin facturas de proveedores en este mes.</p>
  }
  const max = Math.max(...proveedores.map(p => p.monto), 1)
  return (
    <div className="space-y-1.5">
      {proveedores.slice(0, 10).map(p => (
        <div key={p.proveedor} className="flex items-center gap-2 text-xs">
          <span className="w-28 sm:w-36 text-navy-600 shrink-0 truncate">{p.proveedor}</span>
          <div className="flex-1 h-3 bg-navy-50 rounded-full overflow-hidden">
            <div className="h-full bg-gold-400 rounded-full" style={{ width: `${(p.monto / max) * 100}%` }} />
          </div>
          <span className="w-28 text-right font-semibold text-navy-800 shrink-0 whitespace-nowrap">{formatMontoCurrency(p.monto)}</span>
        </div>
      ))}
    </div>
  )
}
