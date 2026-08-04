// El desayuno como unidad de negocio: qué se gastó, cuánto sale por huésped y
// cuánto consume cada uno de cada producto. Ver src/lib/desayunoCosto.ts.

import { useMemo } from 'react'
import { AlertTriangle, Croissant, Milk, Package, TrendingUp } from 'lucide-react'
import { useOrders } from '../context/OrdersContext'
import { useStock } from '../context/StockContext'
import { usePartes } from '../context/ParteContext'
import { useCajas } from '../context/CajaContext'
import { getCostoDesayuno } from '../lib/desayunoCosto'
import { getCosteoDeposito } from '../lib/costoUnitario'
import { formatMontoCurrency } from '../utils/validators'

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

export default function CostoDesayuno({ year, month }: { year: number; month: number }) {
  const { orders } = useOrders()
  const { pedidos, movements, items, suppliers } = useStock()
  const { partes } = usePartes()
  const { cajas } = useCajas()

  // Precios por unidad sacados de las facturas de los pedidos ya cargados.
  const costeo = useMemo(() => getCosteoDeposito(pedidos, items, movements), [pedidos, items, movements])
  const r = useMemo(
    () => getCostoDesayuno(year, month, {
      orders, pedidos, movements, items, suppliers, partes, cajas, precios: costeo.precios,
    }),
    [year, month, orders, pedidos, movements, items, suppliers, partes, cajas, costeo],
  )

  if (r.compras.total === 0 && r.consumo.length === 0) {
    return <p className="text-xs text-navy-400">Sin compras ni movimientos de desayunador en este mes.</p>
  }

  const maxSalida = Math.max(...r.consumo.map(c => c.salidas), 1)
  // Si se compró mucho más de lo que salió, el gasto del mes es stock, no consumo.
  const stockeando = r.totalEntradas > r.totalSalidas * 1.3 && r.totalSalidas > 0

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <Dato
          label="Comprado en el mes"
          value={formatMontoCurrency(r.compras.total)}
          sub={`caja ${formatMontoCurrency(r.compras.caja)} · pedidos ${formatMontoCurrency(r.compras.panaderia + r.compras.lacteos)} · depósito ${formatMontoCurrency(r.compras.deposito)}`}
        />
        <Dato
          label="Por huésped (comprado)"
          value={r.desayunos > 0 ? formatMontoCurrency(r.costoPorHuesped) : '—'}
          sub={r.desayunos > 0 ? `${r.desayunos} desayunos` : 'sin partes cargados'}
        />
        <Dato
          label="Consumido del depósito"
          value={r.costoConsumido > 0 ? formatMontoCurrency(r.costoConsumido) : '—'}
          sub={r.productosSinCostear > 0
            ? `${r.productosCosteados} de ${r.productosCosteados + r.productosSinCostear} productos con precio`
            : r.costoConsumido > 0 ? 'todos los productos con precio' : 'sin precios todavía'}
          tone={r.productosSinCostear > 0 ? 'amber' : 'green'}
        />
        <Dato
          label="Por huésped (consumido)"
          value={r.costoConsumidoPorHuesped > 0 ? formatMontoCurrency(r.costoConsumidoPorHuesped) : '—'}
          sub="lo que realmente salió"
          tone="green"
        />
      </div>

      {r.desayunos === 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 mb-3">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            No hay partes de la noche cargados en este mes, así que no se sabe cuánta gente desayunó.
            El consumo se ve en unidades, pero no se puede repartir por huésped.
          </span>
        </div>
      )}

      {r.sinClasificar > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 mb-3">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>
            <strong>{formatMontoCurrency(r.sinClasificar)} sin poder asignar a un rubro.</strong> Son
            pedidos cargados con un monto total pero sin la factura de cada proveedor, o proveedores
            sin rubro cargado. Esa plata no está contada como desayuno — puede que parte lo sea.
          </span>
        </div>
      )}

      {stockeando && (
        <p className="text-[11px] text-navy-500 mb-3 flex items-start gap-1.5">
          <TrendingUp size={12} className="shrink-0 mt-0.5 text-navy-400" />
          Entró bastante más mercadería de la que salió ({r.totalEntradas} vs {r.totalSalidas} unidades):
          parte del gasto de este mes es stock para el mes que viene, no consumo.
        </p>
      )}

      {r.verduleria > 0 && (
        <p className="text-[11px] text-navy-400 mb-3">
          La verdulería ({formatMontoCurrency(r.verduleria)}) se compra por recepción igual que el pan,
          pero no cuenta como desayuno. Si tiene que contar, avisá y la sumo.
        </p>
      )}

      {r.consumo.length > 0 && (
        <>
          <p className="text-[11px] font-bold uppercase tracking-wide text-navy-400 mb-1.5 flex items-center gap-1.5">
            <Package size={12} /> Consumo por producto {r.desayunos > 0 && '— y cuánto se lleva cada huésped'}
          </p>
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-xs min-w-[420px]">
              <thead>
                <tr className="text-navy-500 border-b border-navy-100">
                  <th className="text-left py-1.5 pr-2">Producto</th>
                  <th className="px-2 text-left">Salió del depósito</th>
                  <th className="px-2 text-center">Entró</th>
                  <th className="px-2 text-right">Por huésped</th>
                  <th className="pl-2 text-right">Costó</th>
                </tr>
              </thead>
              <tbody>
                {r.consumo.map(c => (
                  <tr key={c.item} className="border-b border-navy-50 last:border-0">
                    <td className="py-1.5 pr-2 text-navy-700 font-semibold">{c.item}</td>
                    <td className="px-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-navy-50 rounded-full overflow-hidden min-w-[40px]">
                          <div className="h-full bg-gold-400 rounded-full" style={{ width: `${(c.salidas / maxSalida) * 100}%` }} />
                        </div>
                        <span className="font-semibold text-navy-800 whitespace-nowrap">{c.salidas} {c.unidad}</span>
                      </div>
                    </td>
                    <td className="px-2 text-center text-navy-500 whitespace-nowrap">{c.entradas || '—'}</td>
                    <td className="px-2 text-right text-navy-700 whitespace-nowrap">
                      {r.desayunos > 0
                        ? <>{c.porHuesped} <span className="text-navy-400">({c.porCada100} c/100)</span></>
                        : '—'}
                    </td>
                    <td className="pl-2 text-right whitespace-nowrap">
                      {c.costo != null ? (
                        <>
                          <span className="font-semibold text-navy-800">{formatMontoCurrency(c.costo)}</span>
                          <span className="block text-[10px] text-navy-400">
                            {formatMontoCurrency(c.precioUnitario!)}/{c.unidad}
                          </span>
                        </>
                      ) : (
                        <span className="text-navy-300">sin precio</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Lo que salió de la caja y NO se reconoció como desayuno. Está a la vista
          para poder cazar el proveedor que falta en la lista. */}
      {r.cajaSinClasificar.length > 0 && (
        <details className="mt-3 rounded-lg bg-navy-50 p-2.5">
          <summary className="text-[11px] font-bold uppercase tracking-wide text-navy-500 cursor-pointer">
            Gastos de caja que no conté como desayuno ({r.cajaSinClasificar.length})
          </summary>
          <p className="text-[10px] text-navy-400 mt-1 mb-1.5">
            Reconozco a Piazza (panadería) y El Amanecer (lácteos). Si acá abajo ves otro proveedor de
            desayuno, decímelo y lo agrego — no lo adivino solo para no meter limpieza o mantenimiento
            adentro del desayuno.
          </p>
          <ul className="text-[11px] space-y-0.5 max-h-48 overflow-y-auto">
            {r.cajaSinClasificar.slice(0, 25).map((g, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-navy-600">{g.observacion}</span>
                <span className="shrink-0 text-navy-700">{formatMontoCurrency(g.total)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      {/* Termómetro del costeo: de dónde salen los precios y cuánto falta. */}
      <div className="mt-3 rounded-lg bg-navy-50 p-2.5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-navy-500 mb-1">
          Precios sacados de las facturas
        </p>
        <p className="text-[11px] text-navy-600">
          {costeo.itemsCosteados > 0
            ? <>Hay precio para <strong>{costeo.itemsCosteados} producto(s)</strong> del depósito, sacado de
              las facturas de los pedidos. Se costeó {formatMontoCurrency(costeo.montoCosteado)} de compras.</>
            : <>Todavía no se pudo sacar el precio de ningún producto.</>}
          {costeo.montoSinCostear > 0 && (
            <> Quedaron <strong>{formatMontoCurrency(costeo.montoSinCostear)}</strong> sin bajar a productos.</>
          )}
        </p>
        {costeo.sinCostear.length > 0 && (
          <p className="text-[10px] text-navy-400 mt-1">
            Los motivos más pesados: {[...new Set(costeo.sinCostear.slice(0, 5).map(s => s.motivo))].join(', ')}.
            Una factura sin renglones, o con renglones que no se pueden asociar a un solo producto, no se
            reparte a ojo: queda sin costear.
          </p>
        )}
      </div>

      <p className="text-[10px] text-navy-400 mt-2 flex items-start gap-1.5">
        <Croissant size={12} className="shrink-0 mt-0.5" />
        <span>
          "Comprado" es lo que se pagó este mes; "consumido" es lo que salió del depósito valorizado al
          precio de la última factura de cada producto. No son lo mismo, y esa diferencia es stock.
          Los desayunos salen de los partes de la noche (la gente que durmió).
        </span>
        <Milk size={12} className="shrink-0 mt-0.5" />
      </p>
    </div>
  )
}
