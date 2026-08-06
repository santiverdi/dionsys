// Caja de Administración: la plata que se mueve FUERA de la caja del conserje.
//
// Charo lleva su libro de caja en Excel todos los días y lo va a seguir
// haciendo: acá se SUBE esa planilla y el sistema la lee. Nadie recarga
// movimientos a mano (misma regla que la caja del PMS y los grupos).

import { useMemo, useRef, useState } from 'react'
import {
  Wallet, Upload, Loader2, AlertTriangle, Trash2, Search, Calendar,
  ArrowDownCircle, ArrowUpCircle, FileSpreadsheet,
} from 'lucide-react'
import { useLibroCaja } from '../context/LibroCajaContext'
import { useAuth } from '../context/AuthContext'
import { parseLibroCajaExcel } from '../lib/parseLibroCaja'
import { motivoNoContar } from '../lib/libroCajaConceptos'
import { pagosDelSistema, cruzarLibro } from '../lib/libroCajaCruce'
import { useOrders } from '../context/OrdersContext'
import { useStock } from '../context/StockContext'
import { useMaintenance } from '../context/MaintenanceContext'
import { useImpuestos } from '../context/ImpuestosContext'
import { useSueldos } from '../context/SueldosContext'
import { formatMontoCurrency } from '../utils/validators'
import { monthLabel } from '../utils/dateRange'
import type { LibroCajaMes } from '../types'

function fmtFecha(s: string): string {
  const [, m, d] = s.split('-')
  return `${d}/${m}`
}

function mesLabel(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return monthLabel(y, m)
}

export default function CajaAdmin() {
  const { meses, importarMes, borrarMes } = useLibroCaja()
  const { employee } = useAuth()
  // Para cruzar contra lo que ya está cargado en las otras pantallas.
  const { orders } = useOrders()
  const { pedidos } = useStock()
  const { tasks } = useMaintenance()
  const { pagos, servicios } = useImpuestos()
  const { pagos: pagosSueldos } = useSueldos()

  const [subiendo, setSubiendo] = useState(false)
  const [error, setError] = useState('')
  const [mesElegido, setMesElegido] = useState<string | null>(null)
  const [filtroMedio, setFiltroMedio] = useState('')
  const [busqueda, setBusqueda] = useState('')
  const [confirmBorrar, setConfirmBorrar] = useState(false)
  // Concepto desplegado para ver el detalle que escribió Charo en cada fila.
  const inputRef = useRef<HTMLInputElement>(null)

  // Por defecto se mira el mes más nuevo que haya importado.
  const mes: LibroCajaMes | undefined = useMemo(
    () => meses.find(m => m.mes === mesElegido) ?? meses[0],
    [meses, mesElegido],
  )

  const movimientos = useMemo(() => {
    if (!mes) return []
    const q = busqueda.trim().toLowerCase()
    return mes.movimientos.filter(m => {
      if (filtroMedio && m.medio !== filtroMedio) return false
      if (!q) return true
      return `${m.concepto} ${m.detalle} ${m.medio}`.toLowerCase().includes(q)
    })
  }, [mes, filtroMedio, busqueda])

  // Qué entró y qué salió, por concepto: es la lectura que sirve del mes.
  const porConcepto = useMemo(() => {
    const map = new Map<string, { entradas: number; salidas: number }>()
    for (const m of movimientos) {
      const acc = map.get(m.concepto) ?? { entradas: 0, salidas: 0 }
      if (m.monto >= 0) acc.entradas += m.monto
      else acc.salidas += -m.monto
      map.set(m.concepto, acc)
    }
    return [...map.entries()]
      .map(([concepto, v]) => ({ concepto, ...v, neto: v.entradas - v.salidas }))
      .sort((a, b) => (b.entradas + b.salidas) - (a.entradas + a.salidas))
  }, [movimientos])

  const totales = useMemo(() => ({
    entradas: movimientos.filter(m => m.monto > 0).reduce((s, m) => s + m.monto, 0),
    salidas: movimientos.filter(m => m.monto < 0).reduce((s, m) => s - m.monto, 0),
  }), [movimientos])

  // --- Cruce automático contra lo que el sistema ya tiene cargado ---
  // Cada salida del libro se aparea con un pago ya cargado (mismo monto, fecha
  // cercana). Lo que aparea ya está contado; lo que no, es plata que el sistema
  // no conocía y suma a los egresos del mes. Sin marcar nada a mano.
  const cruce = useMemo(() => {
    if (!mes) return null
    const [y, m] = mes.mes.split('-').map(Number)
    const sistema = pagosDelSistema(y, m, { orders, pedidos, tasks, pagos, pagosSueldos, servicios })
    return cruzarLibro(mes.movimientos, sistema)
  }, [mes, orders, pedidos, tasks, pagos, pagosSueldos, servicios])

  // Lo que no es gasto (entradas, retiros, cambio): no se cruza ni suma.
  const noEsGasto = useMemo(() => {
    if (!mes) return []
    const map = new Map<string, { concepto: string; motivo: string; total: number }>()
    for (const m of mes.movimientos) {
      if (m.monto >= 0) continue
      const motivo = motivoNoContar(m.conceptoCod)
      if (!motivo) continue
      const acc = map.get(m.conceptoCod) ?? { concepto: m.concepto, motivo, total: 0 }
      acc.total += -m.monto
      map.set(m.conceptoCod, acc)
    }
    return [...map.values()].sort((a, b) => b.total - a.total)
  }, [mes])

  async function handleArchivo(file: File) {
    setError('')
    setSubiendo(true)
    try {
      const leido = await parseLibroCajaExcel(file, employee?.name)
      importarMes(leido)
      setMesElegido(leido.mes)
      setFiltroMedio('')
      setBusqueda('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No pude leer el archivo.')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-xl font-bold text-navy-800 flex items-center gap-2">
            <Wallet size={22} className="text-gold-600" /> Caja de Administración
          </h2>
          <p className="text-sm text-navy-500 mt-1">
            La plata que se mueve fuera de la caja del conserje. Se sube la planilla de Charo tal cual
            y el sistema la lee — no hay que cargar nada a mano.
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".xls,.xlsx,.xlsm"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0]
            if (f) handleArchivo(f)
            e.target.value = ''
          }}
        />
        <button
          onClick={() => inputRef.current?.click()}
          disabled={subiendo}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-navy-800 text-cream text-sm font-semibold hover:bg-navy-700 disabled:opacity-50 disabled:cursor-wait transition-colors shrink-0"
        >
          {subiendo ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
          {subiendo ? 'Leyendo…' : 'Subir planilla'}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700 mb-4">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="text-red-400 text-xs hover:text-red-600">Cerrar</button>
        </div>
      )}

      {!mes ? (
        <div className="text-center py-12 bg-white rounded-xl border border-navy-100">
          <FileSpreadsheet size={40} className="mx-auto text-navy-200 mb-2" />
          <p className="text-navy-500 text-sm">Todavía no subiste ninguna planilla.</p>
          <p className="text-navy-400 text-xs mt-1">
            Es el Excel del libro de caja (uno por mes, ej: "CAJA JULIO DION26.xls").
          </p>
        </div>
      ) : (
        <>
          {/* Meses importados */}
          <div className="flex items-center gap-2 flex-wrap mb-4">
            <Calendar size={14} className="text-navy-400" />
            {meses.map(m => (
              <button
                key={m.mes}
                onClick={() => { setMesElegido(m.mes); setConfirmBorrar(false) }}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                  m.mes === mes.mes ? 'bg-navy-800 text-cream' : 'bg-white border border-navy-200 text-navy-600 hover:bg-navy-50'
                }`}
              >
                {mesLabel(m.mes)}
              </button>
            ))}
          </div>

          {/* Saldos por medio: lo que hay en cada lado */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">
            {mes.medios.map(m => (
              <div key={m.cod} className="bg-white rounded-xl border border-navy-100 p-3">
                <p className="text-[10px] uppercase tracking-wide text-navy-500">{m.nombre}</p>
                <p className="text-lg font-bold text-navy-800 leading-tight">{formatMontoCurrency(m.saldoFinalCalculado)}</p>
                <p className="text-[10px] text-navy-400">
                  arrancó el mes en {formatMontoCurrency(m.saldoInicial)}
                </p>
              </div>
            ))}
            <div className="rounded-xl p-3 bg-navy-800 border border-navy-800">
              <p className="text-[10px] uppercase tracking-wide text-gold-300">Total</p>
              <p className="text-lg font-bold text-cream leading-tight">
                {formatMontoCurrency(mes.medios.reduce((s, m) => s + m.saldoFinalCalculado, 0))}
              </p>
              <p className="text-[10px] text-cream/60">{mes.movimientos.length} movimiento(s)</p>
            </div>
          </div>

          {/* Lo que avisó el lector: descuadres o filas salteadas */}
          {mes.avisos.length > 0 && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 mb-4">
              <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5 mb-1">
                <AlertTriangle size={14} /> Revisá esto de la planilla
              </p>
              <ul className="text-xs text-amber-800 space-y-0.5 list-disc list-inside">
                {mes.avisos.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            </div>
          )}

          {/* El cruce: qué de este libro ya estaba cargado y qué no. Se calcula
              solo, apareando pago contra pago. */}
          {cruce && (
            <section className="bg-white rounded-xl border border-navy-100 p-4 mb-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-navy-500 mb-1">
                Salidas del mes
              </h3>
              <p className="text-[11px] text-navy-400 mb-3">
                Cada pago del libro se busca entre los que el sistema ya tiene cargados (mismo importe,
                fecha cercana). Lo que aparece en los dos lados no se cuenta dos veces; lo que solo está
                acá suma a los egresos del mes.
              </p>

              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className="rounded-lg bg-navy-800 p-3">
                  <p className="text-[10px] uppercase text-gold-300">Suma a los egresos</p>
                  <p className="text-lg font-bold text-cream leading-tight">{formatMontoCurrency(cruce.totalSoloLibro)}</p>
                  <p className="text-[10px] text-cream/60">{cruce.soloLibro.length} pago(s) que el sistema no tenía</p>
                </div>
                <div className="rounded-lg bg-navy-50 border border-navy-100 p-3">
                  <p className="text-[10px] uppercase text-navy-500">Ya estaba cargado</p>
                  <p className="text-lg font-bold text-navy-800 leading-tight">{formatMontoCurrency(cruce.totalYaCargado)}</p>
                  <p className="text-[10px] text-navy-400">{cruce.yaCargados.length} pago(s) que ya contaba el sistema</p>
                </div>
              </div>

              {/* Lo que suma: acá está el detalle que escribió Charo, que es lo
                  único que dice qué fue cada gasto. */}
              <p className="text-[11px] font-bold uppercase tracking-wide text-navy-400 mb-1">
                Solo en el libro — suman
              </p>
              <ul className="text-xs space-y-0.5 mb-3 max-h-56 overflow-y-auto">
                {cruce.soloLibro.map((m, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 border-b border-navy-50 last:border-0 py-1">
                    <span className="min-w-0 truncate text-navy-600">
                      {fmtFecha(m.fecha)} · <span className="text-navy-700 font-medium">{m.detalle || m.concepto}</span>
                      <span className="text-navy-400"> · {m.concepto}</span>
                    </span>
                    <span className="shrink-0 font-semibold text-navy-800">{formatMontoCurrency(-m.monto)}</span>
                  </li>
                ))}
                {cruce.soloLibro.length === 0 && (
                  <li className="text-navy-400">Todo lo del libro ya estaba cargado en el sistema.</li>
                )}
              </ul>

              <details className="mb-2">
                <summary className="text-[11px] font-bold uppercase tracking-wide text-navy-400 cursor-pointer">
                  Ya estaba cargado ({cruce.yaCargados.length})
                </summary>
                <ul className="text-xs space-y-0.5 mt-1 max-h-56 overflow-y-auto">
                  {cruce.yaCargados.map((x, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 border-b border-navy-50 last:border-0 py-1">
                      <span className="min-w-0 truncate text-navy-500">
                        {fmtFecha(x.mov.fecha)} · {x.mov.detalle || x.mov.concepto}
                        <span className="text-navy-400"> → {x.pago.fuente}: {x.pago.detalle}</span>
                      </span>
                      <span className="shrink-0 text-navy-600">{formatMontoCurrency(-x.mov.monto)}</span>
                    </li>
                  ))}
                </ul>
              </details>

              {/* Al revés: cargado en el sistema y sin espejo en el libro. Puede
                  ser un pago que Charo no anotó, o un monto que no coincide. */}
              {cruce.soloSistema.length > 0 && (
                <details className="mb-2">
                  <summary className="text-[11px] font-bold uppercase tracking-wide text-amber-700 cursor-pointer">
                    Cargado en el sistema pero no está en el libro ({cruce.soloSistema.length})
                  </summary>
                  <p className="text-[10px] text-navy-400 mt-1">
                    O Charo no lo anotó, o el importe no coincide con el que se cargó. Vale la pena mirarlo.
                  </p>
                  <ul className="text-xs space-y-0.5 mt-1 max-h-56 overflow-y-auto">
                    {cruce.soloSistema.map((p, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 border-b border-navy-50 last:border-0 py-1">
                        <span className="min-w-0 truncate text-navy-500">
                          {fmtFecha(p.fecha)} · {p.detalle}
                          <span className="text-navy-400"> · {p.fuente}</span>
                        </span>
                        <span className="shrink-0 text-navy-600">{formatMontoCurrency(p.monto)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {noEsGasto.length > 0 && (
                <details>
                  <summary className="text-[11px] font-bold uppercase tracking-wide text-navy-400 cursor-pointer">
                    No son gasto ({noEsGasto.length})
                  </summary>
                  <ul className="text-xs space-y-0.5 mt-1">
                    {noEsGasto.map(c => (
                      <li key={c.concepto} className="flex items-center justify-between gap-2 border-b border-navy-50 last:border-0 py-1">
                        <span className="min-w-0 truncate text-navy-500">
                          {c.concepto} <span className="text-navy-400">— {c.motivo}</span>
                        </span>
                        <span className="shrink-0 text-navy-600">{formatMontoCurrency(c.total)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </section>
          )}

          {/* Filtros */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <button
              onClick={() => setFiltroMedio('')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                filtroMedio === '' ? 'bg-gold-400 text-navy-900' : 'bg-white border border-navy-200 text-navy-600 hover:bg-navy-50'
              }`}
            >
              Todos
            </button>
            {mes.medios.map(m => (
              <button
                key={m.cod}
                onClick={() => setFiltroMedio(m.nombre)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  filtroMedio === m.nombre ? 'bg-gold-400 text-navy-900' : 'bg-white border border-navy-200 text-navy-600 hover:bg-navy-50'
                }`}
              >
                {m.nombre}
              </button>
            ))}
            <div className="relative flex-1 min-w-[180px]">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-navy-300" />
              <input
                value={busqueda}
                onChange={e => setBusqueda(e.target.value)}
                placeholder="Buscar concepto o detalle…"
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-navy-200 text-xs"
              />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {/* Resumen por concepto */}
            <section className="bg-white rounded-xl border border-navy-100 p-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-navy-500 mb-3">
                Por concepto
              </h3>
              <div className="flex gap-2 mb-3">
                <div className="flex-1 rounded-lg bg-green-50 border border-green-200 p-2">
                  <p className="text-[10px] uppercase text-green-700 flex items-center gap-1"><ArrowDownCircle size={11} /> Entró</p>
                  <p className="text-sm font-bold text-green-800">{formatMontoCurrency(totales.entradas)}</p>
                </div>
                <div className="flex-1 rounded-lg bg-red-50 border border-red-200 p-2">
                  <p className="text-[10px] uppercase text-red-700 flex items-center gap-1"><ArrowUpCircle size={11} /> Salió</p>
                  <p className="text-sm font-bold text-red-800">{formatMontoCurrency(totales.salidas)}</p>
                </div>
              </div>
              <ul className="text-xs space-y-1">
                {porConcepto.map(c => (
                  <li key={c.concepto} className="flex items-center justify-between gap-2 border-b border-navy-50 last:border-0 py-1">
                    <span className="min-w-0 truncate text-navy-600">{c.concepto}</span>
                    <span className={`shrink-0 font-semibold ${c.neto >= 0 ? 'text-green-700' : 'text-navy-800'}`}>
                      {c.neto >= 0 ? '+' : '−'}{formatMontoCurrency(Math.abs(c.neto))}
                    </span>
                  </li>
                ))}
                {porConcepto.length === 0 && <li className="text-navy-400">Sin movimientos con ese filtro.</li>}
              </ul>
            </section>

            {/* Movimiento por movimiento */}
            <section className="bg-white rounded-xl border border-navy-100 p-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-navy-500 mb-3">
                Movimientos ({movimientos.length})
              </h3>
              <ul className="text-xs space-y-1 max-h-[28rem] overflow-y-auto">
                {movimientos.map((m, i) => (
                  <li key={i} className="flex items-start justify-between gap-2 border-b border-navy-50 last:border-0 py-1">
                    <span className="min-w-0">
                      <span className="text-navy-400">{fmtFecha(m.fecha)}</span>{' '}
                      <span className="text-navy-700 font-medium">{m.concepto}</span>
                      <span className="block text-[10px] text-navy-400 truncate">
                        {m.medio}{m.detalle ? ` · ${m.detalle}` : ''}
                      </span>
                    </span>
                    <span className={`shrink-0 font-semibold ${m.monto >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                      {m.monto >= 0 ? '+' : '−'}{formatMontoCurrency(Math.abs(m.monto))}
                    </span>
                  </li>
                ))}
                {movimientos.length === 0 && <li className="text-navy-400">Sin movimientos con ese filtro.</li>}
              </ul>
            </section>
          </div>

          <div className="flex items-center justify-between gap-3 flex-wrap mt-4">
            <p className="text-[10px] text-navy-400">
              {mes.archivo} · importado {new Date(mes.importadoAt).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
              {mes.importadoBy ? ` por ${mes.importadoBy}` : ''}. Subir la misma planilla de nuevo reemplaza el mes.
            </p>
            {confirmBorrar ? (
              <span className="flex items-center gap-1">
                <button
                  onClick={() => { borrarMes(mes.mes); setConfirmBorrar(false); setMesElegido(null) }}
                  className="px-2.5 py-1 bg-red-500 text-white rounded-lg text-xs font-semibold hover:bg-red-600"
                >
                  Borrar {mesLabel(mes.mes)}
                </button>
                <button onClick={() => setConfirmBorrar(false)} className="px-2.5 py-1 text-navy-400 rounded-lg text-xs hover:bg-navy-50">
                  No
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmBorrar(true)}
                className="flex items-center gap-1 text-xs text-navy-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50"
              >
                <Trash2 size={13} /> Borrar este mes
              </button>
            )}
          </div>

          {/* Este libro y la caja del conserje son la misma plata vista de los dos
              lados: dejarlo dicho evita que alguien sume los dos números. */}
          <p className="text-[10px] text-navy-400 mt-3 flex items-start gap-1.5">
            <Wallet size={12} className="shrink-0 mt-0.5" />
            <span>
              Los conceptos <strong>CAJA</strong> y <strong>CAJA DEBITO</strong> son el efectivo y las tarjetas
              que vienen de la caja del conserje, que el sistema ya tiene cargados por su lado. Es la misma
              plata vista desde el otro mostrador: se lee acá aparte y no se suma a los números del Dashboard.
            </span>
          </p>
        </>
      )}
    </div>
  )
}
