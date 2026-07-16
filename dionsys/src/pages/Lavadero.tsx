import { useMemo, useState } from 'react'
import {
  Shirt, ArrowUpCircle, ArrowDownCircle, Plus, Save, Trash2, X, CheckCircle2,
  Wallet, AlertTriangle, FileText, Circle,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLavadero } from '../context/LavaderoContext'
import { getBalanceRopa, getLavaderoMes, getDeudaLavadero, conciliarLiquidacion, PRENDAS_SUGERIDAS } from '../lib/lavadero'
import { getCurrentMonth } from '../utils/dateRange'
import { formatMontoCurrency } from '../utils/validators'
import type { TipoMovLavadero, LavaderoPrenda } from '../types'

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const hoyStr = () => ymd(new Date())

// La última quincena COMPLETA (la liquidación llega al terminar la quincena).
function quincenaAnterior(hoy = new Date()): { desde: string; hasta: string } {
  const y = hoy.getFullYear(), m = hoy.getMonth() // 0-based
  if (hoy.getDate() > 15) return { desde: ymd(new Date(y, m, 1)), hasta: ymd(new Date(y, m, 15)) }
  // Estamos en la 1ra quincena: la completa es la 2da del mes anterior.
  return { desde: ymd(new Date(y, m - 1, 16)), hasta: ymd(new Date(y, m, 0)) }
}

function fmtFecha(yyyyMmDd: string): string {
  const d = new Date(yyyyMmDd + 'T12:00:00')
  return isNaN(d.getTime()) ? yyyyMmDd : d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

const TIPO_LABEL: Record<TipoMovLavadero, string> = {
  envio_sucia: 'Salió ropa sucia',
  recibo_limpia: 'Volvió ropa limpia',
}

interface FilaPrenda { prenda: string; cantidad: string }

export default function Lavadero() {
  const { employee } = useAuth()
  const {
    movimientos, liquidaciones, addMovimiento, deleteMovimiento, addLiquidacion, deleteLiquidacion, togglePagada,
    prendasOcultas, ocultarPrenda, mostrarPrenda,
  } = useLavadero()
  const esAdmin = employee?.role === 'admin'

  // --- Form de remito (movimiento de ropa) ---
  // El remito real es MANUSCRITO (con lapicera): la carga tiene que ser copiarlo
  // de forma simple — la lista de prendas ya está armada y solo se ponen los
  // números al lado, como en el papel.
  const [tipo, setTipo] = useState<TipoMovLavadero>('envio_sucia')
  const [fecha, setFecha] = useState(hoyStr())
  const [remito, setRemito] = useState('')
  const [cants, setCants] = useState<Record<string, string>>({})
  const [extras, setExtras] = useState<FilaPrenda[]>([])
  const [saved, setSaved] = useState(false)

  const prendasVisibles = PRENDAS_SUGERIDAS.filter(p => !prendasOcultas.includes(p))

  const prendasValidas: LavaderoPrenda[] = [
    ...prendasVisibles
      .map(p => ({ prenda: p, cantidad: Math.max(0, Math.round(Number(cants[p]) || 0)) })),
    ...extras
      .map(f => ({ prenda: f.prenda.trim(), cantidad: Math.max(0, Math.round(Number(f.cantidad) || 0)) })),
  ].filter(p => p.prenda && p.cantidad > 0)
  const valido = !!fecha && prendasValidas.length > 0

  function guardar() {
    if (!valido) return
    addMovimiento({
      fecha, tipo, prendas: prendasValidas,
      ...(remito.trim() ? { remito: remito.trim() } : {}),
      createdBy: employee?.name ?? '',
    })
    setCants({})
    setExtras([])
    setRemito('')
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  function editExtra(i: number, patch: Partial<FilaPrenda>) {
    setExtras(f => f.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  }

  // --- Form de liquidación quincenal (solo admin) ---
  const quincena = useMemo(() => quincenaAnterior(), [])
  const [liqDesde, setLiqDesde] = useState(quincena.desde)
  const [liqHasta, setLiqHasta] = useState(quincena.hasta)
  const [liqTotal, setLiqTotal] = useState('')
  const [liqRemitos, setLiqRemitos] = useState('')
  const [liqSaved, setLiqSaved] = useState(false)

  const remitosLiq = liqRemitos.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)
  const liqValida = liqDesde && liqHasta && liqDesde <= liqHasta && Number(liqTotal.replace(',', '.')) > 0

  function copiasDelPeriodo(): string[] {
    return movimientos
      .filter(m => m.remito?.trim() && m.fecha >= liqDesde && m.fecha <= liqHasta)
      .map(m => m.remito!.trim())
  }

  function guardarLiquidacion() {
    if (!liqValida) return
    addLiquidacion({
      desde: liqDesde, hasta: liqHasta,
      total: Math.round(Number(liqTotal.replace(',', '.')) * 100) / 100,
      remitos: remitosLiq,
      pagada: false,
      createdBy: employee?.name ?? '',
    })
    setLiqTotal('')
    setLiqRemitos('')
    setLiqSaved(true)
    setTimeout(() => setLiqSaved(false), 2500)
  }

  // --- Resúmenes ---
  const balance = useMemo(() => getBalanceRopa(movimientos), [movimientos])
  const enLavaderoTotal = balance.reduce((s, b) => s + Math.max(0, b.enLavadero), 0)
  const cur = useMemo(() => getCurrentMonth(), [])
  const mesActual = useMemo(() => getLavaderoMes(cur.year, cur.month, movimientos, liquidaciones), [cur, movimientos, liquidaciones])
  const deuda = useMemo(() => getDeudaLavadero(liquidaciones), [liquidaciones])

  const inputCls = 'w-full rounded-lg border border-navy-200 px-2 py-1.5 text-sm text-navy-800 focus:outline-none focus:border-gold-400'

  return (
    <div>
      <h2 className="text-xl font-bold text-navy-800 mb-1">Lavadero</h2>
      {esAdmin ? (
        <p className="text-sm text-navy-500 mb-4">
          La ropa la carga la gobernanta con cada remito. Acá manejás la parte de plata: cuando llega
          la liquidación de la quincena, el sistema cruza los remitos facturados contra las copias
          cargadas, y queda como deuda hasta marcarla pagada.
        </p>
      ) : (
        <p className="text-sm text-navy-500 mb-4">
          Cargá la <strong>copia de cada remito</strong>: qué ropa sucia salió y qué ropa limpia volvió.
          Con eso el sistema controla que el lavadero devuelva todo y que la liquidación de la quincena
          coincida con las copias.
        </p>
      )}

      {/* Resumen arriba */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-white rounded-xl border border-navy-100 p-3">
          <p className="text-[10px] uppercase text-navy-500">En el lavadero</p>
          <p className="text-lg font-bold text-navy-800">{enLavaderoTotal}</p>
          <p className="text-[10px] text-navy-400">prendas sin devolver</p>
        </div>
        <div className="bg-white rounded-xl border border-navy-100 p-3">
          <p className="text-[10px] uppercase text-navy-500">Este mes</p>
          <p className="text-sm font-bold text-navy-800">{mesActual.enviadas} <span className="font-normal text-navy-400">salieron</span></p>
          <p className="text-sm font-bold text-navy-800">{mesActual.recibidas} <span className="font-normal text-navy-400">volvieron</span></p>
        </div>
        {esAdmin ? (
          <div className={`rounded-xl border p-3 ${deuda.total > 0 ? 'bg-amber-50 border-amber-200' : 'bg-white border-navy-100'}`}>
            <p className={`text-[10px] uppercase ${deuda.total > 0 ? 'text-amber-700' : 'text-navy-500'}`}>Deuda con el lavadero</p>
            <p className={`text-sm font-bold ${deuda.total > 0 ? 'text-amber-800' : 'text-navy-800'}`}>{formatMontoCurrency(deuda.total)}</p>
            <p className="text-[10px] text-navy-400">{deuda.liquidaciones} liquidación(es) sin pagar</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-navy-100 p-3">
            <p className="text-[10px] uppercase text-navy-500">Remitos este mes</p>
            <p className="text-lg font-bold text-navy-800">{mesActual.movimientos}</p>
            <p className="text-[10px] text-navy-400">cargados</p>
          </div>
        )}
      </div>

      {/* Carga de remito */}
      <div className="bg-white rounded-xl border border-navy-100 p-3 mb-4">
        <p className="text-xs font-bold uppercase tracking-wide text-navy-500 mb-2">Cargar remito (copia de la gobernanta)</p>
        <div className="grid grid-cols-2 gap-2 mb-2">
          {([['envio_sucia', ArrowUpCircle], ['recibo_limpia', ArrowDownCircle]] as const).map(([t, Icon]) => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-semibold transition-colors ${
                tipo === t
                  ? t === 'envio_sucia' ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-green-400 bg-green-50 text-green-800'
                  : 'border-navy-100 text-navy-500 hover:border-navy-200'
              }`}
            >
              <Icon size={16} /> {TIPO_LABEL[t]}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 mb-2">
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={inputCls} />
          <input
            type="text" value={remito} onChange={e => setRemito(e.target.value)}
            placeholder="Nº de remito" className={inputCls}
          />
        </div>
        {/* Lista fija de prendas: se copian los números del remito de papel */}
        <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 mb-2">
          {prendasVisibles.map(p => (
            <div key={p} className="flex items-center justify-between gap-2 py-0.5">
              <span className="text-sm text-navy-700">{p}</span>
              <span className="flex items-center gap-1 shrink-0">
                <input
                  type="number" min={0} inputMode="numeric" value={cants[p] ?? ''}
                  onChange={e => setCants(c => ({ ...c, [p]: e.target.value }))}
                  placeholder="0"
                  className="w-20 rounded-lg border border-navy-200 px-2 py-1.5 text-sm text-navy-800 text-center focus:outline-none focus:border-gold-400"
                />
                <button
                  onClick={() => ocultarPrenda(p)}
                  className="p-1.5 rounded-lg text-navy-400 hover:text-red-500 hover:bg-red-50 shrink-0"
                  title={`Sacar "${p}" de la lista`}
                >
                  <X size={14} />
                </button>
              </span>
            </div>
          ))}
        </div>
        {prendasOcultas.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mb-2">
            <span className="text-[11px] text-navy-400">Sacadas de la lista:</span>
            {prendasOcultas.map(p => (
              <button
                key={p}
                onClick={() => mostrarPrenda(p)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-full border border-navy-200 text-[11px] text-navy-500 hover:bg-navy-50"
                title={`Volver a mostrar "${p}"`}
              >
                {p} <Plus size={10} />
              </button>
            ))}
          </div>
        )}
        {/* Prendas que no están en la lista */}
        {extras.length > 0 && (
          <div className="space-y-1.5 mb-2">
            {extras.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text" value={f.prenda}
                  onChange={e => editExtra(i, { prenda: e.target.value })}
                  placeholder="Otra prenda" className={inputCls}
                />
                <input
                  type="number" min={1} inputMode="numeric" value={f.cantidad}
                  onChange={e => editExtra(i, { cantidad: e.target.value })}
                  placeholder="Cant." className="w-20 rounded-lg border border-navy-200 px-2 py-1.5 text-sm text-navy-800 text-center focus:outline-none focus:border-gold-400"
                />
                <button onClick={() => setExtras(fs => fs.filter((_, j) => j !== i))} className="p-1.5 rounded-lg text-navy-400 hover:text-red-500 hover:bg-red-50 shrink-0">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExtras(f => [...f, { prenda: '', cantidad: '' }])}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-navy-200 text-xs font-semibold text-navy-600 hover:bg-navy-50"
          >
            <Plus size={14} /> Otra prenda
          </button>
          <button
            onClick={guardar}
            disabled={!valido}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold ${
              valido ? 'bg-navy-800 text-cream hover:bg-navy-700' : 'bg-navy-100 text-navy-400 cursor-not-allowed'
            }`}
          >
            <Save size={14} /> Guardar remito
          </button>
          {saved && <span className="flex items-center gap-1 text-xs text-green-600 font-semibold"><CheckCircle2 size={14} /> Guardado</span>}
        </div>
        {valido && !remito.trim() && (
          <p className="text-[11px] text-amber-600 mt-1.5">Sin Nº de remito no se puede cruzar contra la liquidación de la quincena.</p>
        )}
      </div>

      {/* Balance por prenda */}
      {balance.length > 0 && (
        <div className="bg-white rounded-xl border border-navy-100 p-3 mb-4">
          <p className="text-xs font-bold uppercase tracking-wide text-navy-500 mb-2">En el lavadero, por prenda</p>
          <div className="overflow-x-auto -mx-3 px-3">
            <table className="w-full text-xs min-w-[400px]">
              <thead>
                <tr className="text-navy-500 border-b border-navy-100">
                  <th className="text-left py-1.5 pr-2">Prenda</th>
                  <th className="text-center px-2">Salieron</th>
                  <th className="text-center px-2">Volvieron</th>
                  <th className="text-center pl-2">En el lavadero</th>
                </tr>
              </thead>
              <tbody>
                {balance.map(b => (
                  <tr key={b.prenda} className="border-b border-navy-50 last:border-0">
                    <td className="py-1.5 pr-2 text-navy-700 font-semibold">{b.prenda}</td>
                    <td className="px-2 text-center text-navy-600">{b.enviadas}</td>
                    <td className="px-2 text-center text-navy-600">{b.recibidas}</td>
                    <td className={`pl-2 text-center font-bold ${
                      b.enLavadero > 0 ? 'text-amber-700' : b.enLavadero < 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {b.enLavadero}
                      {b.enLavadero < 0 && <span className="block text-[10px] font-normal">volvió más de lo que salió — revisar</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Liquidaciones quincenales — la parte de PLATA es solo del admin (Charo).
          La gobernanta solo carga ropa: ni ve montos ni liquidaciones. */}
      {esAdmin && (
      <div className="bg-white rounded-xl border border-navy-100 p-3 mb-4">
        <p className="text-xs font-bold uppercase tracking-wide text-navy-500 mb-1 flex items-center gap-1.5">
          <Wallet size={13} className="text-gold-600" /> Liquidaciones quincenales
        </p>
        <p className="text-[11px] text-navy-400 mb-2">
          A fin de quincena el lavadero manda la liquidación de los remitos originales. Cargala acá:
          el sistema la cruza con las copias y queda como deuda hasta que se paga (en efectivo de la
          caja fuerte; se pueden pagar dos quincenas juntas). Este costo entra solo como egreso del
          mes — no lo cargues además como factura de proveedor.
        </p>

        <div className="rounded-lg border border-navy-100 p-2.5 mb-3">
            <div className="flex items-center gap-2 mb-2">
              <input type="date" value={liqDesde} onChange={e => setLiqDesde(e.target.value)} className={inputCls} />
              <span className="text-xs text-navy-400 shrink-0">al</span>
              <input type="date" value={liqHasta} onChange={e => setLiqHasta(e.target.value)} className={inputCls} />
              <input
                type="number" min={0} step={1000} value={liqTotal}
                onChange={e => setLiqTotal(e.target.value)}
                placeholder="Total $" className="w-32 rounded-lg border border-navy-200 px-2 py-1.5 text-sm text-navy-800 focus:outline-none focus:border-gold-400 shrink-0"
              />
            </div>
            <textarea
              value={liqRemitos}
              onChange={e => setLiqRemitos(e.target.value)}
              placeholder="Nros de remito que lista la liquidación (separados por coma o uno por línea)"
              rows={2}
              className="w-full rounded-lg border border-navy-200 px-2 py-1.5 text-xs text-navy-800 focus:outline-none focus:border-gold-400 mb-2"
            />
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setLiqRemitos(copiasDelPeriodo().join(', '))}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-navy-200 text-xs font-semibold text-navy-600 hover:bg-navy-50"
                title="Completa con los remitos cargados en ese período"
              >
                <FileText size={13} /> Usar copias del período
              </button>
              <button
                onClick={guardarLiquidacion}
                disabled={!liqValida}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold ${
                  liqValida ? 'bg-navy-800 text-cream hover:bg-navy-700' : 'bg-navy-100 text-navy-400 cursor-not-allowed'
                }`}
              >
                <Save size={14} /> Guardar liquidación
              </button>
              {liqSaved && <span className="flex items-center gap-1 text-xs text-green-600 font-semibold"><CheckCircle2 size={14} /> Guardada</span>}
            </div>
        </div>

        {liquidaciones.length === 0 ? (
          <p className="text-xs text-navy-400">Sin liquidaciones cargadas todavía.</p>
        ) : (
          <ul className="space-y-2">
            {liquidaciones.map(liq => {
              const conc = conciliarLiquidacion(liq, movimientos)
              const ok = conc.remitosSinCopia.length === 0 && conc.copiasSinLiquidar.length === 0
              return (
                <li key={liq.id} className={`rounded-lg border p-2.5 text-xs ${liq.pagada ? 'border-navy-100' : 'border-amber-200 bg-amber-50/40'}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-semibold text-navy-800">
                      Quincena {fmtFecha(liq.desde)} al {fmtFecha(liq.hasta)}
                      <span className="font-normal text-navy-400"> · {liq.remitos.length} remito(s)</span>
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      <span className="font-bold text-navy-800">{formatMontoCurrency(liq.total)}</span>
                      {esAdmin && (
                        <button onClick={() => deleteLiquidacion(liq.id)} className="p-1 rounded text-navy-400 hover:text-red-500 hover:bg-red-50" title="Borrar liquidación">
                          <Trash2 size={13} />
                        </button>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span>
                      {ok ? (
                        <span className="inline-flex items-center gap-1 text-green-600 font-semibold"><CheckCircle2 size={12} /> Remitos coinciden con las copias</span>
                      ) : (
                        <span className="space-y-0.5 block">
                          {conc.remitosSinCopia.length > 0 && (
                            <span className="flex items-start gap-1 text-red-600 font-semibold">
                              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                              Facturan sin copia cargada: {conc.remitosSinCopia.join(', ')}
                            </span>
                          )}
                          {conc.copiasSinLiquidar.length > 0 && (
                            <span className="flex items-start gap-1 text-amber-700">
                              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                              Copias sin liquidar: {conc.copiasSinLiquidar.join(', ')}
                            </span>
                          )}
                        </span>
                      )}
                    </span>
                    <button
                      onClick={() => togglePagada(liq.id)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-lg font-semibold shrink-0 ${
                        liq.pagada ? 'text-green-700 bg-green-50 hover:bg-green-100' : 'text-amber-700 bg-amber-100 hover:bg-amber-200'
                      }`}
                      title={liq.pagada ? 'Marcar como impaga' : 'Marcar pagada (efectivo de caja fuerte)'}
                    >
                      {liq.pagada ? <CheckCircle2 size={13} /> : <Circle size={13} />}
                      {liq.pagada ? `Pagada${liq.fechaPago ? ` ${fmtFecha(liq.fechaPago)}` : ''}` : 'Pendiente de pago'}
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
      )}

      {/* Últimos movimientos */}
      <div className="bg-white rounded-xl border border-navy-100 p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-navy-500 mb-2">Remitos cargados ({movimientos.length})</p>
        {movimientos.length === 0 ? (
          <div className="text-center py-8">
            <Shirt size={40} className="mx-auto text-navy-200 mb-2" />
            <p className="text-sm text-navy-400">Todavía no hay remitos cargados.</p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {movimientos.slice(0, 30).map(m => (
              <li key={m.id} className={`rounded-lg border p-2.5 text-xs ${
                m.tipo === 'envio_sucia' ? 'border-amber-100 bg-amber-50/50' : 'border-green-100 bg-green-50/50'
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-navy-800">
                    {fmtFecha(m.fecha)} · {TIPO_LABEL[m.tipo]}
                    {m.remito ? <span className="font-normal text-navy-400"> · remito {m.remito}</span> : <span className="font-normal text-amber-600"> · sin remito</span>}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-navy-500">{m.createdBy}</span>
                    {esAdmin && (
                      <button onClick={() => deleteMovimiento(m.id)} className="p-1 rounded text-navy-400 hover:text-red-500 hover:bg-red-50" title="Borrar remito">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </span>
                </div>
                <p className="text-navy-600 mt-0.5">
                  {m.prendas.map(p => `${p.cantidad} ${p.prenda.toLowerCase()}`).join(' · ')}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
