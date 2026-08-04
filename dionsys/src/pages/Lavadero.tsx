import { useMemo, useState } from 'react'
import {
  Shirt, Plus, Save, Trash2, X, CheckCircle2,
  Wallet, AlertTriangle, FileText, Circle, Camera, Loader2,
  PackageCheck, Repeat, ChevronDown, ChevronUp,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLavadero } from '../context/LavaderoContext'
import { getStockRopa, getLavaderoMes, getDeudaLavadero, conciliarLiquidacion, conciliarPrendas, sumarPrendasPeriodo, prendaCanonica, getRetirosPendientes, PRENDAS_SUGERIDAS, PRENDAS_LIQUIDACION, type RetiroPendiente, type StockPrenda } from '../lib/lavadero'
import { extractRemitoLavadero, extractLiquidacionLavadero } from '../lib/invoiceExtract'
import LavaderoPrediccion from '../components/LavaderoPrediccion'
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

// Solo el RETIRO tiene remito. La limpia vuelve sin papel: Roxana la cuenta al
// recibir y "tilda" el retiro (recibo_limpia enlazado por retiroId). El cambio
// es canje 1 a 1 de ropa dañada del hotel por nueva.
const TIPO_LABEL: Record<TipoMovLavadero, string> = {
  envio_sucia: 'Retiro (se llevó sucia)',
  recibo_limpia: 'Volvió limpia',
  cambio: 'Cambio por rotura/mancha',
}

interface FilaPrenda { prenda: string; cantidad: string }

// A qué fila del form va una prenda leída de la foto. Por nombre canónico,
// salvo sábanas: canónicamente son todas "sábanas", así que grande/chica se
// distingue por el texto (SG/SCH); un total sin desglose va como fila extra.
function destinoPrenda(prenda: string, visibles: string[]): string | null {
  if (prendaCanonica(prenda) === 'sábanas') {
    const s = prenda.toLowerCase()
    const target = /sch|chica/.test(s) ? 'Sábanas chicas (SCH)'
      : /sg|grande/.test(s) ? 'Sábanas grandes (SG)' : null
    return target && visibles.includes(target) ? target : null
  }
  return visibles.find(v => prendaCanonica(v) === prendaCanonica(prenda)) ?? null
}

export default function Lavadero() {
  const { employee } = useAuth()
  const {
    movimientos, liquidaciones, addMovimiento, deleteMovimiento, setRemitoNro, addLiquidacion, deleteLiquidacion, togglePagada,
    prendasOcultas, ocultarPrenda, mostrarPrenda, base, setBasePrenda,
  } = useLavadero()
  const esAdmin = employee?.role === 'admin'

  // --- Form de remito de RETIRO (único papel que existe) ---
  // El remito real es MANUSCRITO (con lapicera): la carga tiene que ser copiarlo
  // de forma simple — la lista de prendas ya está armada y solo se ponen los
  // números al lado, como en el papel.
  const [fecha, setFecha] = useState(hoyStr())
  const [remito, setRemito] = useState('')
  const [cants, setCants] = useState<Record<string, string>>({})
  const [extras, setExtras] = useState<FilaPrenda[]>([])
  const [saved, setSaved] = useState(false)
  const [leyendoFoto, setLeyendoFoto] = useState(false)
  const [errorFoto, setErrorFoto] = useState('')

  const prendasVisibles = PRENDAS_SUGERIDAS.filter(p => !prendasOcultas.includes(p))

  // Foto del remito → la IA precarga el form. Es un BORRADOR: la letra es
  // manuscrita, siempre hay que revisar los números contra el papel antes
  // de guardar.
  async function leerFotoRemito(file: File) {
    setLeyendoFoto(true)
    setErrorFoto('')
    try {
      const r = await extractRemitoLavadero(file)
      if (/^\d{4}-\d{2}-\d{2}$/.test(r.fecha)) setFecha(r.fecha)
      if (r.nro) setRemito(r.nro)
      const nuevasCants: Record<string, string> = {}
      const nuevasExtras: FilaPrenda[] = []
      for (const p of r.prendas) {
        const cant = Math.max(0, Math.round(Number(p.cantidad) || 0))
        if (!p.prenda.trim() || cant <= 0) continue
        const destino = destinoPrenda(p.prenda, prendasVisibles)
        if (destino) nuevasCants[destino] = String(cant)
        else nuevasExtras.push({ prenda: p.prenda.trim(), cantidad: String(cant) })
      }
      if (Object.keys(nuevasCants).length === 0 && nuevasExtras.length === 0) {
        setErrorFoto('No se pudo leer ninguna cantidad de la foto. Cargalo a mano.')
      } else {
        setCants(nuevasCants)
        setExtras(nuevasExtras)
      }
    } catch (e) {
      setErrorFoto(e instanceof Error ? e.message : 'No se pudo leer la foto.')
    } finally {
      setLeyendoFoto(false)
    }
  }

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
      fecha, tipo: 'envio_sucia', prendas: prendasValidas,
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

  // --- Recepción de ropa lavada (no hay remito de limpia) ---
  // La misma ropa del retiro vuelve lavada: Roxana la cuenta al recibir y
  // tilda el retiro. Precargamos lo pendiente; si falta algo, corrige el
  // número y el resto queda pendiente en el mismo retiro.
  const retirosPendientes = useMemo(() => getRetirosPendientes(movimientos), [movimientos])
  const [recibirRetiroId, setRecibirRetiroId] = useState<string | null>(null)
  const [recibCants, setRecibCants] = useState<Record<string, string>>({})

  function toggleRecepcion(rp: RetiroPendiente) {
    if (recibirRetiroId === rp.retiro.id) { setRecibirRetiroId(null); return }
    setRecibirRetiroId(rp.retiro.id)
    const pre: Record<string, string> = {}
    for (const p of rp.prendas) if (p.pendiente > 0) pre[p.prenda] = String(p.pendiente)
    setRecibCants(pre)
  }

  function confirmarRecepcion(rp: RetiroPendiente) {
    const prendas = rp.prendas
      .filter(p => p.pendiente > 0)
      .map(p => ({
        prenda: p.prenda,
        cantidad: Math.max(0, Math.min(p.pendiente, Math.round(Number(recibCants[p.prenda]) || 0))),
      }))
      .filter(p => p.cantidad > 0)
    if (prendas.length === 0) return
    addMovimiento({
      fecha: hoyStr(), tipo: 'recibo_limpia', prendas,
      retiroId: rp.retiro.id,
      ...(rp.retiro.remito ? { remito: rp.retiro.remito } : {}),
      createdBy: employee?.name ?? '',
    })
    setRecibirRetiroId(null)
  }

  // --- Cambio por rotura/mancha (canje 1 a 1, no altera el balance) ---
  const [showCambio, setShowCambio] = useState(false)
  const [cambioFecha, setCambioFecha] = useState(hoyStr())
  const [cambioFilas, setCambioFilas] = useState<FilaPrenda[]>([{ prenda: '', cantidad: '' }])
  const [cambioSaved, setCambioSaved] = useState(false)

  const cambioValidas = cambioFilas
    .map(f => ({ prenda: f.prenda.trim(), cantidad: Math.max(0, Math.round(Number(f.cantidad) || 0)) }))
    .filter(p => p.prenda && p.cantidad > 0)

  function guardarCambio() {
    if (!cambioFecha || cambioValidas.length === 0) return
    addMovimiento({
      fecha: cambioFecha, tipo: 'cambio', prendas: cambioValidas,
      createdBy: employee?.name ?? '',
    })
    setCambioFilas([{ prenda: '', cantidad: '' }])
    setCambioSaved(true)
    setTimeout(() => setCambioSaved(false), 2500)
  }

  function editCambioFila(i: number, patch: Partial<FilaPrenda>) {
    setCambioFilas(f => f.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  }

  // --- Form de liquidación quincenal (solo admin) ---
  const quincena = useMemo(() => quincenaAnterior(), [])
  const [liqDesde, setLiqDesde] = useState(quincena.desde)
  const [liqHasta, setLiqHasta] = useState(quincena.hasta)
  const [liqNro, setLiqNro] = useState('')
  const [liqTotal, setLiqTotal] = useState('')
  const [liqRemitos, setLiqRemitos] = useState('')
  const [liqCants, setLiqCants] = useState<Record<string, string>>({})
  const [liqSaved, setLiqSaved] = useState(false)
  const [leyendoLiq, setLeyendoLiq] = useState(false)
  const [errorLiq, setErrorLiq] = useState('')

  // Foto de la liquidación → precarga el form. Igual que el remito, es un
  // BORRADOR: se revisa contra el papel antes de guardar. Acá importa doble,
  // porque de este número sale la deuda que se paga.
  async function leerFotoLiquidacion(file: File) {
    setLeyendoLiq(true)
    setErrorLiq('')
    try {
      const r = await extractLiquidacionLavadero(file)
      // El período manda: es lo que decide en qué mes cae el gasto. La fecha de
      // emisión del ticket (que suele ser posterior) no se usa.
      if (/^\d{4}-\d{2}-\d{2}$/.test(r.desde)) setLiqDesde(r.desde)
      if (/^\d{4}-\d{2}-\d{2}$/.test(r.hasta)) setLiqHasta(r.hasta)
      if (r.nro) setLiqNro(r.nro)
      const total = Number(String(r.total).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.'))
      if (total > 0) setLiqTotal(String(total))
      if (r.remitos?.length) setLiqRemitos(r.remitos.join(', '))

      const nuevas: Record<string, string> = {}
      for (const p of r.prendas ?? []) {
        const cant = Math.max(0, Math.round(Number(p.cantidad) || 0))
        if (!p.prenda?.trim() || cant <= 0) continue
        // La liquidación factura las sábanas juntas, así que el nombre canónico
        // alcanza para ubicar la fila (no hay que distinguir SG de SCH acá).
        const destino = PRENDAS_LIQUIDACION.find(v => prendaCanonica(v) === prendaCanonica(p.prenda))
        if (destino) nuevas[destino] = String(cant)
      }
      if (Object.keys(nuevas).length > 0) setLiqCants(nuevas)
      if (!total && !r.nro && Object.keys(nuevas).length === 0) {
        setErrorLiq('No se pudo leer la liquidación de la foto. Cargala a mano.')
      }
    } catch (e) {
      // El lector puede no tener habilitado todavía el modo 'liquidacion' (vive
      // fuera de este repo). Se avisa sin drama: cargarla a mano siempre funciona.
      const msg = e instanceof Error ? e.message : 'No se pudo leer la foto.'
      setErrorLiq(`${msg} Si el lector todavía no reconoce las liquidaciones, cargala a mano acá abajo.`)
    } finally {
      setLeyendoLiq(false)
    }
  }

  // Suma de las copias del período elegido, por prenda (lo que Charo sumaba a
  // mano en su Excel): se muestra al lado de cada casillero para comparar en
  // vivo contra lo que factura la liquidación.
  const sumasPeriodo = useMemo(
    () => sumarPrendasPeriodo(movimientos, liqDesde, liqHasta),
    [movimientos, liqDesde, liqHasta],
  )

  const remitosLiq = liqRemitos.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean)
  const detalleLiq: LavaderoPrenda[] = PRENDAS_LIQUIDACION
    .map(p => ({ prenda: p, cantidad: Math.max(0, Math.round(Number(liqCants[p]) || 0)) }))
    .filter(p => p.cantidad > 0)
  const liqValida = liqDesde && liqHasta && liqDesde <= liqHasta && Number(liqTotal.replace(',', '.')) > 0

  function copiasDelPeriodo(): string[] {
    return [...new Set(
      movimientos
        .filter(m => m.tipo === 'envio_sucia' && m.remito?.trim() && m.fecha >= liqDesde && m.fecha <= liqHasta)
        .map(m => m.remito!.trim()),
    )]
  }

  function guardarLiquidacion() {
    if (!liqValida) return
    addLiquidacion({
      desde: liqDesde, hasta: liqHasta,
      total: Math.round(Number(liqTotal.replace(',', '.')) * 100) / 100,
      remitos: remitosLiq,
      pagada: false,
      createdBy: employee?.name ?? '',
      ...(liqNro.trim() ? { nro: liqNro.trim() } : {}),
      ...(detalleLiq.length > 0 ? { detalle: detalleLiq } : {}),
    })
    setLiqNro('')
    setLiqTotal('')
    setLiqRemitos('')
    setLiqCants({})
    setLiqSaved(true)
    setTimeout(() => setLiqSaved(false), 2500)
  }

  // --- Agregar Nº de remito a un movimiento que quedó sin número (solo admin) ---
  const [editRemitoId, setEditRemitoId] = useState<string | null>(null)
  const [editRemitoVal, setEditRemitoVal] = useState('')

  function guardarRemitoNro(movId: string) {
    if (!editRemitoVal.trim()) return
    setRemitoNro(movId, editRemitoVal)
    setEditRemitoId(null)
    setEditRemitoVal('')
  }

  // --- Lista de remitos: del más nuevo al más viejo, expandible para checkear ---
  const [movAbierto, setMovAbierto] = useState<string | null>(null)
  const movsOrdenados = useMemo(
    () => [...movimientos].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.createdAt.localeCompare(a.createdAt)),
    [movimientos],
  )

  // --- Resúmenes ---
  // Stock: base alquilada por prenda + dónde está la ropa ahora.
  const [editBase, setEditBase] = useState(false)
  const stock = useMemo(() => getStockRopa(movimientos, base), [movimientos, base])
  // En modo edición se muestran también las prendas visibles sin fila todavía,
  // para poder cargarles la base inicial.
  const stockRows: StockPrenda[] = useMemo(() => {
    if (!editBase) return stock
    const norm = (s: string) => s.trim().toLowerCase()
    const con = new Set(stock.map(r => norm(r.prenda)))
    const faltantes = prendasVisibles
      .filter(p => !con.has(norm(p)))
      .map(p => ({ prenda: p, base: null, enviadas: 0, recibidas: 0, enLavadero: 0, enHotel: null }))
    return [...stock, ...faltantes]
  }, [stock, editBase, prendasVisibles])
  const enLavaderoTotal = stock.reduce((s, b) => s + Math.max(0, b.enLavadero), 0)
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
          Cargá la <strong>copia de cada remito de retiro</strong> (la sucia que se llevan). Cuando
          la ropa vuelve lavada, contala y tildá el retiro en "retiros sin devolver". Con eso el
          sistema controla que el lavadero devuelva todo y que la liquidación coincida con las copias.
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
        <p className="text-xs font-bold uppercase tracking-wide text-navy-500 mb-2">Cargar remito de retiro (la sucia que se llevan)</p>
        <label className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed text-sm font-semibold mb-2 transition-colors ${
          leyendoFoto
            ? 'border-navy-200 text-navy-400 cursor-wait'
            : 'border-gold-300 bg-gold-50/50 text-gold-700 hover:bg-gold-50 cursor-pointer'
        }`}>
          {leyendoFoto ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
          {leyendoFoto ? 'Leyendo el remito…' : 'Sacar foto al remito (carga sola)'}
          <input
            type="file" accept="image/*" capture="environment" className="hidden" disabled={leyendoFoto}
            onChange={e => {
              const f = e.target.files?.[0]
              e.target.value = ''
              if (f) leerFotoRemito(f)
            }}
          />
        </label>
        {errorFoto && (
          <p className="flex items-start gap-1 text-[11px] text-red-600 mb-2">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {errorFoto}
          </p>
        )}
        <p className="text-[11px] text-navy-400 mb-2">
          La foto solo precarga el formulario: revisá los números contra el papel antes de guardar.
        </p>
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

      {/* Retiros pendientes de devolución: la limpia vuelve SIN remito, se
          cuenta al recibir y se tilda acá. */}
      {retirosPendientes.length > 0 && (
        <div className="bg-white rounded-xl border border-navy-100 p-3 mb-4">
          <p className="text-xs font-bold uppercase tracking-wide text-navy-500 mb-1 flex items-center gap-1.5">
            <PackageCheck size={13} className="text-green-600" /> Ropa en el lavadero — retiros sin devolver ({retirosPendientes.length})
          </p>
          <p className="text-[11px] text-navy-400 mb-2">
            Cuando traen la ropa lavada, contala y tildá el retiro. Si falta algo, poné lo que
            realmente volvió: el resto queda pendiente en este mismo retiro.
          </p>
          <ul className="space-y-2">
            {retirosPendientes.map(rp => {
              const abierto = recibirRetiroId === rp.retiro.id
              return (
                <li key={rp.retiro.id} className="rounded-lg border border-amber-200 bg-amber-50/40 p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-navy-800">
                      Retiro del {fmtFecha(rp.retiro.fecha)}
                      {rp.retiro.remito ? <span className="font-normal text-navy-400"> · remito {rp.retiro.remito}</span> : ''}
                      <span className="font-normal text-amber-700"> · faltan volver {rp.totalPendiente}</span>
                    </span>
                    <button
                      onClick={() => toggleRecepcion(rp)}
                      className={`px-3 py-1.5 rounded-lg font-bold shrink-0 transition-colors ${
                        abierto ? 'bg-navy-100 text-navy-600 hover:bg-navy-200' : 'bg-green-600 text-white hover:bg-green-700'
                      }`}
                    >
                      {abierto ? 'Cancelar' : 'Volvió'}
                    </button>
                  </div>
                  {!abierto && (
                    <p className="text-navy-500 mt-1">
                      {rp.prendas.filter(p => p.pendiente > 0).map(p => `${p.pendiente} ${p.prenda.toLowerCase()}`).join(' · ')}
                    </p>
                  )}
                  {abierto && (
                    <div className="mt-2">
                      {rp.prendas.filter(p => p.pendiente > 0).map(p => (
                        <div key={p.prenda} className="flex items-center justify-between gap-2 py-0.5">
                          <span className="text-navy-700">
                            {p.prenda}
                            <span className="text-navy-400">
                              {' '}(se llevaron {p.enviada}{p.recibida > 0 ? `, ya volvieron ${p.recibida}` : ''})
                            </span>
                          </span>
                          <input
                            type="number" min={0} max={p.pendiente} inputMode="numeric"
                            value={recibCants[p.prenda] ?? ''}
                            onChange={e => setRecibCants(c => ({ ...c, [p.prenda]: e.target.value }))}
                            className="w-20 rounded-lg border border-navy-200 px-2 py-1 text-xs text-navy-800 text-center focus:outline-none focus:border-gold-400 shrink-0"
                          />
                        </div>
                      ))}
                      <button
                        onClick={() => confirmarRecepcion(rp)}
                        className="w-full mt-2 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold bg-green-600 text-white hover:bg-green-700 transition-colors"
                      >
                        <CheckCircle2 size={14} /> Confirmar lo que volvió
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Cambio por rotura/mancha: canje 1 a 1 (dañada del hotel por nueva
          del lavadero). No toca el balance, solo queda registrado. */}
      <div className="bg-white rounded-xl border border-navy-100 p-3 mb-4">
        <button onClick={() => setShowCambio(v => !v)} className="w-full flex items-center justify-between gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-navy-500 flex items-center gap-1.5">
            <Repeat size={13} className="text-blue-600" /> Cambio por rotura o mancha
          </span>
          {showCambio ? <ChevronUp size={14} className="text-navy-400" /> : <ChevronDown size={14} className="text-navy-400" />}
        </button>
        {showCambio && (
          <div className="mt-2">
            <p className="text-[11px] text-navy-400 mb-2">
              Cuando se entrega ropa del hotel manchada o rota y el lavadero la repone por nueva
              (misma cantidad). No cambia el balance: queda anotado el canje.
            </p>
            <input type="date" value={cambioFecha} onChange={e => setCambioFecha(e.target.value)} className={`${inputCls} mb-2`} />
            <div className="space-y-1.5 mb-2">
              {cambioFilas.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={f.prenda}
                    onChange={e => editCambioFila(i, { prenda: e.target.value })}
                    className={inputCls}
                  >
                    <option value="">Prenda…</option>
                    {PRENDAS_SUGERIDAS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <input
                    type="number" min={1} inputMode="numeric" value={f.cantidad}
                    onChange={e => editCambioFila(i, { cantidad: e.target.value })}
                    placeholder="Cant." className="w-20 rounded-lg border border-navy-200 px-2 py-1.5 text-sm text-navy-800 text-center focus:outline-none focus:border-gold-400 shrink-0"
                  />
                  <button onClick={() => setCambioFilas(fs => fs.length > 1 ? fs.filter((_, j) => j !== i) : fs)} className="p-1.5 rounded-lg text-navy-400 hover:text-red-500 hover:bg-red-50 shrink-0">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCambioFilas(f => [...f, { prenda: '', cantidad: '' }])}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-navy-200 text-xs font-semibold text-navy-600 hover:bg-navy-50"
              >
                <Plus size={14} /> Otra prenda
              </button>
              <button
                onClick={guardarCambio}
                disabled={!cambioFecha || cambioValidas.length === 0}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold ${
                  cambioFecha && cambioValidas.length > 0 ? 'bg-navy-800 text-cream hover:bg-navy-700' : 'bg-navy-100 text-navy-400 cursor-not-allowed'
                }`}
              >
                <Save size={14} /> Guardar cambio
              </button>
              {cambioSaved && <span className="flex items-center gap-1 text-xs text-green-600 font-semibold"><CheckCircle2 size={14} /> Guardado</span>}
            </div>
          </div>
        )}
      </div>

      {/* Stock por prenda: base alquilada + dónde está la ropa */}
      <div className="bg-white rounded-xl border border-navy-100 p-3 mb-4">
        <div className="flex items-center justify-between gap-2 mb-1">
          <p className="text-xs font-bold uppercase tracking-wide text-navy-500">Stock de ropa (base alquilada)</p>
          {/* La base es el eje de todo el control del lavadero y se toca muy de
              vez en cuando: la edita solo el admin. El resto la ve. */}
          {esAdmin && (
            <button
              onClick={() => setEditBase(v => !v)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
                editBase ? 'bg-navy-800 text-cream' : 'bg-navy-100 text-navy-600 hover:bg-navy-200'
              }`}
            >
              {editBase ? 'Listo' : 'Editar base'}
            </button>
          )}
        </div>
        <p className="text-[11px] text-navy-400 mb-2">
          La base es el total de ropa alquilada de cada prenda: con eso trabaja todo el ciclo.
          En el hotel = base − en el lavadero. Los cambios por rotura no la mueven;{' '}
          {esAdmin
            ? 'editala solo si el lavadero suma o quita ropa alquilada.'
            : 'si el lavadero sumó o quitó ropa alquilada, avisale a administración para que la corrija.'}
        </p>
        {stockRows.length === 0 ? (
          <p className="text-xs text-navy-400">
            {esAdmin
              ? 'Tocá "Editar base" y cargá cuántas prendas alquiladas hay de cada tipo.'
              : 'Todavía no está cargada la base de ropa alquilada. La carga administración.'}
          </p>
        ) : (
          <div className="overflow-x-auto -mx-3 px-3">
            <table className="w-full text-xs min-w-[400px]">
              <thead>
                <tr className="text-navy-500 border-b border-navy-100">
                  <th className="text-left py-1.5 pr-2">Prenda</th>
                  <th className="text-center px-2">Base</th>
                  <th className="text-center px-2">En el lavadero</th>
                  <th className="text-center pl-2">En el hotel</th>
                </tr>
              </thead>
              <tbody>
                {stockRows.map(b => (
                  <tr key={b.prenda} className="border-b border-navy-50 last:border-0">
                    <td className="py-1.5 pr-2 text-navy-700 font-semibold">{b.prenda}</td>
                    <td className="px-2 text-center">
                      {editBase && esAdmin ? (
                        <input
                          type="number" min={0} inputMode="numeric"
                          value={base[b.prenda] ?? ''}
                          onChange={e => setBasePrenda(b.prenda, Math.round(Number(e.target.value) || 0))}
                          placeholder="—"
                          className="w-20 rounded-lg border border-navy-200 px-2 py-1 text-xs text-navy-800 text-center focus:outline-none focus:border-gold-400"
                        />
                      ) : (
                        <span className="text-navy-800 font-semibold">{b.base ?? '—'}</span>
                      )}
                    </td>
                    <td className={`px-2 text-center font-bold ${
                      b.enLavadero > 0 ? 'text-amber-700' : b.enLavadero < 0 ? 'text-red-600' : 'text-green-600'
                    }`}>
                      {b.enLavadero}
                      {b.enLavadero < 0 && <span className="block text-[10px] font-normal">volvió más de lo que salió — revisar</span>}
                    </td>
                    <td className={`pl-2 text-center font-bold ${
                      b.enHotel == null ? 'text-navy-300 font-normal' : b.enHotel < 0 ? 'text-red-600' : 'text-navy-800'
                    }`}>
                      {b.enHotel ?? '—'}
                      {b.enHotel != null && b.enHotel < 0 && (
                        <span className="block text-[10px] font-normal">hay más en el lavadero que la base — revisar base o remitos</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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

        {/* Cuánta ropa justifica la ocupación del período que se está liquidando:
            se controla ANTES de pagar. Sigue las mismas fechas del form. */}
        <LavaderoPrediccion movimientos={movimientos} desde={liqDesde} hasta={liqHasta} />

        <div className="rounded-lg border border-navy-100 p-2.5 mb-3">
            {/* La liquidación es un ticket impreso: la IA la lee bastante mejor
                que el remito manuscrito. Igual precarga y no guarda: de este
                número sale la deuda que se paga. */}
            <label className={`w-full flex items-center justify-center gap-2 py-2 mb-2 rounded-lg border border-dashed cursor-pointer transition-colors ${
              leyendoLiq ? 'border-navy-200 text-navy-400' : 'border-gold-300 text-navy-600 hover:border-gold-400 hover:bg-gold-50'
            }`}>
              {leyendoLiq ? <Loader2 size={16} className="animate-spin" /> : <Camera size={16} />}
              <span className="text-sm font-medium">
                {leyendoLiq ? 'Leyendo la liquidación…' : 'Sacar foto a la liquidación (carga sola)'}
              </span>
              <input
                type="file" accept="image/*,application/pdf" capture="environment" className="hidden"
                disabled={leyendoLiq}
                onChange={e => { const f = e.target.files?.[0]; if (f) leerFotoLiquidacion(f); e.target.value = '' }}
              />
            </label>
            {errorLiq && <p className="text-xs text-red-600 mb-2">{errorLiq}</p>}

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
            <input
              type="text" value={liqNro} onChange={e => setLiqNro(e.target.value)}
              placeholder="Nº de liquidación (ej. 0025355)" className={`${inputCls} mb-2`}
            />
            {/* Cantidades por prenda como vienen impresas. Al lado de cada una
                se muestra la suma de las copias del período ("copias N"), que
                es el subtotal que Charo armaba a mano en el Excel: si el número
                tipeado no coincide, se marca al toque. */}
            <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1 mb-2">
              {PRENDAS_LIQUIDACION.map(p => {
                const copias = sumasPeriodo.get(prendaCanonica(p))?.retiradas ?? 0
                const tipeado = liqCants[p]?.trim()
                const coincide = tipeado ? Math.round(Number(tipeado) || 0) === copias : null
                return (
                  <div key={p} className="flex items-center justify-between gap-2 py-0.5">
                    <span className="text-xs text-navy-600">
                      {p}
                      <span className={`ml-1.5 ${
                        coincide === null ? 'text-navy-400' : coincide ? 'text-green-600 font-semibold' : 'text-red-600 font-semibold'
                      }`}>
                        · copias {copias}{coincide === null ? '' : coincide ? ' ✓' : ' ≠'}
                      </span>
                    </span>
                    <input
                      type="number" min={0} inputMode="numeric" value={liqCants[p] ?? ''}
                      onChange={e => setLiqCants(c => ({ ...c, [p]: e.target.value }))}
                      placeholder="0"
                      className="w-20 rounded-lg border border-navy-200 px-2 py-1 text-xs text-navy-800 text-center focus:outline-none focus:border-gold-400 shrink-0"
                    />
                  </div>
                )
              })}
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
              const concPrendas = conciliarPrendas(liq, movimientos)
              return (
                <li key={liq.id} className={`rounded-lg border p-2.5 text-xs ${liq.pagada ? 'border-navy-100' : 'border-amber-200 bg-amber-50/40'}`}>
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span className="font-semibold text-navy-800">
                      Período {fmtFecha(liq.desde)} al {fmtFecha(liq.hasta)}
                      <span className="font-normal text-navy-400">
                        {liq.nro ? ` · Nº ${liq.nro}` : ''} · {liq.remitos.length} remito(s)
                      </span>
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
                  {concPrendas.length > 0 && (
                    <table className="w-full my-1.5">
                      <thead>
                        <tr className="text-navy-400 border-b border-navy-100">
                          <th className="text-left py-0.5 pr-2 font-normal">Prenda</th>
                          <th className="text-center px-2 font-normal">Facturan</th>
                          <th className="text-center px-2 font-normal">Retiradas</th>
                          <th className="text-center pl-2 font-normal">Entregadas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {concPrendas.map(cp => {
                          const cuadra = cp.facturadas === cp.retiradas || cp.facturadas === cp.entregadas
                          return (
                            <tr key={cp.prenda} className="border-b border-navy-50 last:border-0">
                              <td className="py-0.5 pr-2 text-navy-700">{cp.prenda}</td>
                              <td className={`px-2 text-center font-bold ${cuadra ? 'text-navy-800' : 'text-red-600'}`}>{cp.facturadas}</td>
                              <td className="px-2 text-center text-navy-600">{cp.retiradas}</td>
                              <td className="pl-2 text-center text-navy-600">{cp.entregadas}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
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
            {movsOrdenados.slice(0, 30).map(m => (
              <li
                key={m.id}
                onClick={() => setMovAbierto(v => (v === m.id ? null : m.id))}
                className={`rounded-lg border p-2.5 text-xs cursor-pointer ${
                m.tipo === 'envio_sucia' ? 'border-amber-100 bg-amber-50/50'
                  : m.tipo === 'recibo_limpia' ? 'border-green-100 bg-green-50/50'
                  : 'border-blue-100 bg-blue-50/50'
              }`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-navy-800">
                    {fmtFecha(m.fecha)} · {TIPO_LABEL[m.tipo]}
                    {m.remito
                      ? <span className="font-normal text-navy-400"> · remito {m.remito}</span>
                      : m.tipo === 'envio_sucia'
                        ? esAdmin && editRemitoId !== m.id
                          ? (
                            <button
                              onClick={e => { e.stopPropagation(); setEditRemitoId(m.id); setEditRemitoVal('') }}
                              className="font-normal text-amber-600 underline decoration-dotted ml-1"
                              title="Agregar el Nº de remito que faltó cargar"
                            >
                              sin remito — agregar Nº
                            </button>
                          )
                          : <span className="font-normal text-amber-600"> · sin remito</span>
                        : null}
                  </span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-navy-500">{m.createdBy}</span>
                    {esAdmin && (
                      <button onClick={e => { e.stopPropagation(); deleteMovimiento(m.id) }} className="p-1 rounded text-navy-400 hover:text-red-500 hover:bg-red-50" title="Borrar remito">
                        <Trash2 size={13} />
                      </button>
                    )}
                    {movAbierto === m.id
                      ? <ChevronUp size={14} className="text-navy-400" />
                      : <ChevronDown size={14} className="text-navy-400" />}
                  </span>
                </div>
                {esAdmin && editRemitoId === m.id && !m.remito && (
                  <div className="flex items-center gap-2 mt-1.5" onClick={e => e.stopPropagation()}>
                    <input
                      type="text" value={editRemitoVal} autoFocus
                      onChange={e => setEditRemitoVal(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') guardarRemitoNro(m.id) }}
                      placeholder="Nº de remito" className={inputCls}
                    />
                    <button
                      onClick={() => guardarRemitoNro(m.id)}
                      disabled={!editRemitoVal.trim()}
                      className={`px-3 py-1.5 rounded-lg font-bold shrink-0 ${
                        editRemitoVal.trim() ? 'bg-navy-800 text-cream hover:bg-navy-700' : 'bg-navy-100 text-navy-400 cursor-not-allowed'
                      }`}
                    >
                      Guardar
                    </button>
                    <button onClick={() => setEditRemitoId(null)} className="p-1.5 rounded-lg text-navy-400 hover:bg-navy-50 shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                )}
                {movAbierto === m.id ? (
                  /* Vista grande para checkear contra el papel: una prenda por
                     renglón, cantidades al lado como en el remito. */
                  <div className="mt-2 bg-white rounded-lg border border-navy-100 px-3 py-1.5">
                    <ul className="divide-y divide-navy-50">
                      {m.prendas.map(p => (
                        <li key={p.prenda} className="flex items-center justify-between py-2 text-sm">
                          <span className="text-navy-700">{p.prenda}</span>
                          <span className="font-bold text-navy-900 text-lg tabular-nums">{p.cantidad}</span>
                        </li>
                      ))}
                      <li className="flex items-center justify-between py-2 text-sm">
                        <span className="font-semibold text-navy-500 uppercase text-[11px] tracking-wide">Total prendas</span>
                        <span className="font-bold text-navy-900 text-lg tabular-nums">
                          {m.prendas.reduce((s, p) => s + p.cantidad, 0)}
                        </span>
                      </li>
                    </ul>
                  </div>
                ) : (
                  <p className="text-navy-600 mt-0.5">
                    {m.prendas.map(p => `${p.cantidad} ${p.prenda.toLowerCase()}`).join(' · ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
