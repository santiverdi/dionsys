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
import { useConceptosSalida, motivoNoContar, avisoConcepto, yaEnSistema, type RubroSistema } from '../lib/libroCajaConceptos'
import { useOrders } from '../context/OrdersContext'
import { useStock } from '../context/StockContext'
import { useMaintenance } from '../context/MaintenanceContext'
import { useImpuestos } from '../context/ImpuestosContext'
import { useSueldos } from '../context/SueldosContext'
import { getMonthlyExpenses, type MonthlyExpenses } from '../utils/monthlyMetrics'
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

/** Cuánto hay cargado en el sistema de ese rubro, en el mes que se está mirando. */
function montoDelRubro(rubro: RubroSistema, exp: MonthlyExpenses): number {
  switch (rubro) {
    case 'sueldos': return exp.sueldos
    case 'impuestos': return exp.impuestosPagado
    case 'servicios': return exp.serviciosPagado
    case 'profesionales': return exp.profesionalesPagado
    case 'mantenimiento': return exp.mantenimiento
    case 'compras': return exp.pedidosSemanales + exp.pedidosDistribuidor
  }
}

export default function CajaAdmin() {
  const { meses, importarMes, borrarMes } = useLibroCaja()
  const { marcas, marcar, olvidar } = useConceptosSalida()
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
  const [conceptoAbierto, setConceptoAbierto] = useState<string | null>(null)
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

  // Lo que el sistema ya tiene cargado en el mes del libro, por rubro.
  const expensesMes = useMemo(() => {
    const [y, m] = (mes?.mes ?? '0-0').split('-').map(Number)
    return getMonthlyExpenses(y, m, orders, pedidos, tasks, pagos, pagosSueldos, servicios)
  }, [mes, orders, pedidos, tasks, pagos, pagosSueldos, servicios])

  // --- Qué de todo esto es una salida de plata del mes ---
  // Se decide por CONCEPTO y vale para todos los meses. Sin marcar no cuenta:
  // lo que falta decidir queda a la vista con su monto.
  const salidasPorConcepto = useMemo(() => {
    if (!mes) return []
    const map = new Map<string, { concepto: string; total: number; movs: typeof mes.movimientos }>()
    for (const m of mes.movimientos) {
      if (m.monto >= 0) continue
      const acc = map.get(m.conceptoCod) ?? { concepto: m.concepto, total: 0, movs: [] }
      acc.total += -m.monto
      acc.movs.push(m)
      map.set(m.conceptoCod, acc)
    }
    return [...map.entries()]
      .map(([cod, v]) => {
        const motivo = motivoNoContar(cod)
        const decidido = cod in marcas
        // ¿El mismo gasto ya está cargado en otra pantalla ESTE mes? Si allá hay
        // plata cargada, marcarlo acá lo contaría dos veces; si allá está en cero,
        // este libro es el único que lo tiene.
        const otra = yaEnSistema(cod)
        const yaCargado = otra ? montoDelRubro(otra.rubro, expensesMes) : 0
        return {
          cod,
          ...v,
          cuenta: marcas[cod] === true,
          decidido,
          motivo,
          aviso: avisoConcepto(cod),
          pantalla: otra?.pantalla ?? '',
          yaCargado,
          // "Sin decidir" es lo que no tiene ni marca, ni motivo, ni un monto
          // cargado del otro lado: eso último ya es sugerencia suficiente.
          pendiente: !decidido && !motivo && yaCargado === 0,
        }
      })
      // Primero lo que falta decidir, después lo que suma, al final lo que no cuenta.
      .sort((a, b) => {
        const orden = (c: { pendiente: boolean; cuenta: boolean }) => c.pendiente ? 0 : c.cuenta ? 1 : 2
        return orden(a) - orden(b) || b.total - a.total
      })
  }, [mes, marcas, expensesMes])

  const salidasDelMes = useMemo(() => ({
    marcado: salidasPorConcepto.filter(c => c.cuenta).reduce((s, c) => s + c.total, 0),
    pendiente: salidasPorConcepto.filter(c => c.pendiente).reduce((s, c) => s + c.total, 0),
    sinDecidir: salidasPorConcepto.filter(c => c.pendiente).length,
  }), [salidasPorConcepto])

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

          {/* Qué de este libro es una salida de plata del mes. Se decide una vez
              por concepto y vale para todos los meses. */}
          <section className="bg-white rounded-xl border border-navy-100 p-4 mb-4">
            <h3 className="text-sm font-bold uppercase tracking-wide text-navy-500 mb-1">
              Salidas del mes
            </h3>
            <p className="text-[11px] text-navy-400 mb-3">
              No todo lo que sale en el libro es un gasto del hotel, y algunas cosas ya se cargan en otra
              pantalla. Marcá una vez qué concepto cuenta como salida: la decisión queda para todos los meses.
            </p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="rounded-lg bg-navy-800 p-3">
                <p className="text-[10px] uppercase text-gold-300">Salidas marcadas</p>
                <p className="text-lg font-bold text-cream leading-tight">{formatMontoCurrency(salidasDelMes.marcado)}</p>
                <p className="text-[10px] text-cream/60">de {mesLabel(mes.mes)}</p>
              </div>
              <div className={`rounded-lg p-3 border ${salidasDelMes.sinDecidir > 0 ? 'bg-amber-50 border-amber-300' : 'bg-navy-50 border-navy-100'}`}>
                <p className={`text-[10px] uppercase ${salidasDelMes.sinDecidir > 0 ? 'text-amber-700' : 'text-navy-500'}`}>Sin decidir</p>
                <p className={`text-lg font-bold leading-tight ${salidasDelMes.sinDecidir > 0 ? 'text-amber-900' : 'text-navy-800'}`}>
                  {formatMontoCurrency(salidasDelMes.pendiente)}
                </p>
                <p className={`text-[10px] ${salidasDelMes.sinDecidir > 0 ? 'text-amber-700' : 'text-navy-400'}`}>
                  {salidasDelMes.sinDecidir} concepto(s) sin marcar
                </p>
              </div>
            </div>

            <ul className="space-y-1">
              {salidasPorConcepto.map(c => (
                <li key={c.cod} className="border-b border-navy-50 last:border-0 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1">
                    <button
                      onClick={() => setConceptoAbierto(conceptoAbierto === c.cod ? null : c.cod)}
                      className="text-xs font-medium text-navy-700 hover:text-gold-600 text-left"
                      title="Ver qué anotó Charo en cada movimiento"
                    >
                      {c.concepto} <span className="text-navy-300">({c.movs.length})</span>
                    </button>
                    {c.aviso && (
                      <span className="block text-[10px] text-amber-700">{c.aviso}</span>
                    )}
                    {c.motivo && (
                      <span className="block text-[10px] text-navy-400">no lo cuento: {c.motivo}</span>
                    )}
                    {/* El cruce con la otra pantalla: el dato que decide. */}
                    {c.pantalla && c.yaCargado > 0 && (
                      <span className="block text-[10px] text-amber-700">
                        en {c.pantalla} ya hay {formatMontoCurrency(c.yaCargado)} cargados este mes —
                        si lo marcás, se cuenta dos veces
                      </span>
                    )}
                    {c.pantalla && c.yaCargado === 0 && (
                      <span className="block text-[10px] text-navy-400">
                        en {c.pantalla} no hay nada cargado este mes: acá está la única vez
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-navy-800 whitespace-nowrap">
                    {formatMontoCurrency(c.total)}
                  </span>
                  <span className="shrink-0 flex rounded-lg border border-navy-200 overflow-hidden">
                    <button
                      onClick={() => c.decidido && c.cuenta ? olvidar(c.cod) : marcar(c.cod, true)}
                      title="Cuenta como salida de plata del mes"
                      className={`px-2 py-1 text-[10px] font-semibold transition-colors ${
                        c.decidido && c.cuenta ? 'bg-navy-800 text-cream' : 'bg-white text-navy-500 hover:bg-navy-50'
                      }`}
                    >
                      Es salida
                    </button>
                    <button
                      onClick={() => c.decidido && !c.cuenta ? olvidar(c.cod) : marcar(c.cod, false)}
                      title="No cuenta: no es un gasto del hotel, o ya se carga en otra pantalla"
                      className={`px-2 py-1 text-[10px] font-semibold border-l border-navy-200 transition-colors ${
                        c.decidido && !c.cuenta ? 'bg-navy-200 text-navy-700' : 'bg-white text-navy-500 hover:bg-navy-50'
                      }`}
                    >
                      No
                    </button>
                  </span>
                  </div>
                  {/* Lo que escribió Charo al lado del código: muchas veces es lo
                      único que dice qué fue ese gasto. */}
                  {conceptoAbierto === c.cod && (
                    <ul className="mt-1 ml-2 border-l-2 border-navy-100 pl-2 space-y-0.5">
                      {c.movs.map((m, j) => (
                        <li key={j} className="flex items-center justify-between gap-2 text-[10px]">
                          <span className="min-w-0 truncate text-navy-500">
                            {fmtFecha(m.fecha)} · {m.medio}
                            {m.detalle ? ` · ${m.detalle}` : ' · (sin detalle)'}
                          </span>
                          <span className="shrink-0 text-navy-600">{formatMontoCurrency(-m.monto)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
              {salidasPorConcepto.length === 0 && (
                <li className="text-xs text-navy-400">Este mes no tiene salidas cargadas.</li>
              )}
            </ul>
          </section>

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
