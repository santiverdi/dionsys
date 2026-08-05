import { useState, useMemo, useRef } from 'react'
import { useSueldos } from '../context/SueldosContext'
import { useAuth } from '../context/AuthContext'
import { validateMonto, formatMontoCurrency } from '../utils/validators'
import { uploadFactura, downloadUrl } from '../lib/facturaStorage'
import { extractRecibo, extractVEP, type ExtractedRecibo } from '../lib/invoiceExtract'
import { explotarSiEsMultipagina } from '../lib/pdfPages'
import { monthLabel, monthKey, getPreviousMonth, getNextMonth, getCurrentMonth } from '../utils/dateRange'
import ConfirmDialog from '../components/ConfirmDialog'
import {
  Users, UserPlus, Plus, Save, Trash2, ChevronLeft, ChevronRight,
  Paperclip, X, Loader2, Eye, Download, Wallet,
  FileUp, CheckCircle2, AlertTriangle, ChevronDown, ChevronUp, Landmark,
} from 'lucide-react'
import type {
  EmpleadoNomina, PagoSueldo, TipoPagoSueldo, MedioPagoSueldo, ReciboLinea,
} from '../types'
import { TIPO_PAGO_SUELDO_LABELS, TIPOS_PAGO_EMPLEADO } from '../types'

const TIPOS = TIPOS_PAGO_EMPLEADO

// Las cargas sociales no son de nadie en particular: se pagan por toda la nómina
// junta. Se guardan como PagoSueldo con empleadoId vacío y este nombre de snapshot.
const CARGAS_NOMBRE = 'Cargas sociales (AFIP)'

function formatDateAR(s: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const [y, m, d] = s.split('-')
  return `${Number(d)}/${Number(m)}/${y}`
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Normaliza un nombre para matchear: minúsculas, sin tildes ni puntuación.
function normName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

// Matchea el nombre leído del recibo contra la nómina: coincide si comparten
// al menos 2 palabras, o 1 sola cuando alguno de los dos nombres tiene una sola palabra.
function matchEmpleado(nombre: string, lista: { id: string; nombre: string }[]): string | null {
  const tokens = new Set(normName(nombre).split(' ').filter(t => t.length > 2))
  if (tokens.size === 0) return null
  let best: { id: string; hits: number } | null = null
  for (const e of lista) {
    const eTokens = normName(e.nombre).split(' ').filter(t => t.length > 2)
    const hits = eTokens.filter(t => tokens.has(t)).length
    const needed = Math.min(2, Math.min(tokens.size, eTokens.length))
    if (hits >= needed && (!best || hits > best.hits)) best = { id: e.id, hits }
  }
  return best?.id ?? null
}

function parseImporte(s: string): number | null {
  const n = parseFloat(s)
  return isNaN(n) || n <= 0 ? null : Math.round(n * 100) / 100
}

/** YYYY-MM de una fecha YYYY-MM-DD (o '' si la fecha no sirve). */
function mesDeFecha(fecha: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha.slice(0, 7) : ''
}

/** "2026-06" → "Junio 2026", para mostrar el período del VEP. */
function periodoLabel(periodo: string): string {
  if (!/^\d{4}-\d{2}$/.test(periodo)) return periodo
  const [y, m] = periodo.split('-')
  return monthLabel(Number(y), Number(m))
}

// El VEP también puede ser de IVA, Ganancias, etc. No bloqueamos la carga (el
// papel puede venir cortado o con otra nomenclatura), pero avisamos si no se
// parece a seguridad social para que no entre un impuesto que no es sueldo.
function pareceSeguridadSocial(codigo: string, texto: string): boolean {
  if (/^35\d/.test(codigo.trim())) return true
  const t = `${codigo} ${texto}`.toLowerCase()
  return t.includes('931') || t.includes('seguridad social') || t.includes('seg. social')
    || t.includes('seg social') || t.includes('aportes') || t.includes('contribuciones')
}

// Resultado del escaneo de UN recibo (para el panel de revisión).
interface ScanResult {
  id: string
  fileName: string
  status: 'procesando' | 'cargado' | 'revisar' | 'error'
  error?: string
  empleadoLeido?: string
  empleadoNombre?: string       // nombre final (matcheado o asignado)
  asignarId?: string            // select de asignación manual
  tipo?: TipoPagoSueldo         // sueldo / vacaciones / aguinaldo, según la liquidación
  mes?: string
  neto?: number
  bruto?: number
  cuil?: string
  fechaPago?: string
  desglose?: ReciboLinea[]
  reciboUrl?: string
  reciboNombre?: string
  warning?: string
}

// Qué tipo de pago es según la liquidación que dice el recibo. La contadora
// liquida las vacaciones en un recibo aparte del mensual, y el mismo empleado
// puede tener los dos en el mismo mes.
const TIPO_POR_LIQUIDACION: Record<ExtractedRecibo['liquidacion'], TipoPagoSueldo> = {
  mensual: 'sueldo',
  vacaciones: 'vacaciones',
  sac: 'aguinaldo',
  final: 'extra',
}

/** Clave de un pago para detectar duplicados: mismo empleado, mes y tipo. */
function clavePago(empleadoId: string, mes: string, tipo: TipoPagoSueldo): string {
  return `${empleadoId}|${mes}|${tipo}`
}

// El VEP de cargas sociales leído por IA, ya en el panel de revisión. Nunca se
// guarda solo: el importe y sobre todo la FECHA DE PAGO (que decide el mes del
// gasto) se confirman a mano, porque el comprobante puede venir sin fecha.
interface VepDraft {
  fileName: string
  importe: string
  fechaPago: string
  periodo: string
  nroVep: string
  impuesto: string
  codigoImpuesto: string
  comprobanteUrl?: string
  comprobanteNombre?: string
  error?: string
}

export default function Sueldos() {
  const { empleados, pagos, addEmpleado, deleteEmpleado, addPago, deletePago } = useSueldos()
  const { employee } = useAuth()

  const [mesActual, setMesActual] = useState(() => getCurrentMonth())
  const mesStr = monthKey(mesActual.year, mesActual.month)
  const hoyMes = getCurrentMonth()
  const esMesActual = mesActual.year === hoyMes.year && mesActual.month === hoyMes.month

  // --- Nómina (alta/baja) ---
  const [showNominaForm, setShowNominaForm] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoPuesto, setNuevoPuesto] = useState('')
  const [confirmDeleteEmpleado, setConfirmDeleteEmpleado] = useState<EmpleadoNomina | null>(null)

  // --- Carga de pago ---
  const [showPagoForm, setShowPagoForm] = useState(false)
  const [pagoEmpleadoId, setPagoEmpleadoId] = useState('')
  const [pagoTipo, setPagoTipo] = useState<TipoPagoSueldo>('sueldo')
  const [pagoMonto, setPagoMonto] = useState('')
  const [pagoFecha, setPagoFecha] = useState(todayStr())
  const [pagoMedio, setPagoMedio] = useState<MedioPagoSueldo>('efectivo')
  const [pagoNotas, setPagoNotas] = useState('')
  const [pagoError, setPagoError] = useState('')
  const [reciboUrl, setReciboUrl] = useState('')
  const [reciboNombre, setReciboNombre] = useState('')
  const [subiendoRecibo, setSubiendoRecibo] = useState(false)
  const [reciboError, setReciboError] = useState('')
  const reciboInputRef = useRef<HTMLInputElement>(null)

  const [confirmDeletePago, setConfirmDeletePago] = useState<PagoSueldo | null>(null)

  // --- Escaneo de recibos con IA ---
  const scanInputRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [prepMsg, setPrepMsg] = useState('')
  const [scanResults, setScanResults] = useState<ScanResult[]>([])
  const [expandedPagoId, setExpandedPagoId] = useState<string | null>(null)

  // --- Cargas sociales (VEP) ---
  const vepInputRef = useRef<HTMLInputElement>(null)
  const [leyendoVep, setLeyendoVep] = useState(false)
  const [vepDraft, setVepDraft] = useState<VepDraft | null>(null)

  const empleadosActivos = useMemo(() => empleados.filter(e => e.activo), [empleados])

  const pagosDelMes = useMemo(() => pagos.filter(p => p.mes === mesStr), [pagos, mesStr])

  const totalMes = useMemo(() => pagosDelMes.reduce((s, p) => s + p.monto, 0), [pagosDelMes])

  // Totales del mes por tipo.
  const totalesPorTipo = useMemo(() => {
    const map: Record<TipoPagoSueldo, number> = { sueldo: 0, vacaciones: 0, adelanto: 0, aguinaldo: 0, extra: 0, cargas: 0 }
    for (const p of pagosDelMes) map[p.tipo] += p.monto
    return map
  }, [pagosDelMes])

  // Las cargas sociales van aparte del agrupado por empleado: no son de nadie.
  const cargasDelMes = useMemo(() => pagosDelMes.filter(p => p.tipo === 'cargas'), [pagosDelMes])
  const totalCargas = totalesPorTipo.cargas
  const totalPersonal = totalMes - totalCargas

  // Pagos del mes agrupados por empleado (usa el snapshot del nombre para no perder
  // los pagos de un empleado dado de baja).
  const grupos = useMemo(() => {
    const byEmp = new Map<string, { nombre: string; pagos: PagoSueldo[]; subtotal: number }>()
    for (const p of pagosDelMes) {
      if (p.tipo === 'cargas') continue
      const key = p.empleadoId || p.empleadoNombre
      const g = byEmp.get(key) ?? { nombre: p.empleadoNombre, pagos: [], subtotal: 0 }
      g.pagos.push(p)
      g.subtotal += p.monto
      byEmp.set(key, g)
    }
    return [...byEmp.values()].sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [pagosDelMes])

  function handleMes(delta: number) {
    setMesActual(prev => delta < 0 ? getPreviousMonth(prev.year, prev.month) : getNextMonth(prev.year, prev.month))
  }

  function handleAgregarEmpleado() {
    if (!nuevoNombre.trim()) return
    addEmpleado({ nombre: nuevoNombre.trim(), puesto: nuevoPuesto.trim(), activo: true })
    setNuevoNombre('')
    setNuevoPuesto('')
    setShowNominaForm(false)
  }

  function clearRecibo() {
    setReciboUrl('')
    setReciboNombre('')
    setReciboError('')
    setSubiendoRecibo(false)
  }

  async function handleAdjuntarRecibo(file: File) {
    setReciboError('')
    setSubiendoRecibo(true)
    try {
      const { url, nombre } = await uploadFactura(file)
      setReciboUrl(url)
      setReciboNombre(nombre)
    } catch (e) {
      setReciboError(e instanceof Error ? e.message : 'No se pudo adjuntar el recibo.')
    } finally {
      setSubiendoRecibo(false)
    }
  }

  function resetPagoForm() {
    setPagoEmpleadoId('')
    setPagoTipo('sueldo')
    setPagoMonto('')
    setPagoFecha(todayStr())
    setPagoMedio('efectivo')
    setPagoNotas('')
    setPagoError('')
    clearRecibo()
  }

  // Convierte los items de la IA al desglose tipado, descartando basura.
  const toDesglose = (ex: ExtractedRecibo): ReciboLinea[] =>
    ex.items
      .map(it => ({ descripcion: it.descripcion, tipo: it.tipo, importe: parseImporte(it.importe) }))
      .filter((it): it is ReciboLinea => it.importe !== null && it.descripcion !== '')

  const cargarDesdeScan = (r: ScanResult, empleadoId: string, empleadoNombre: string) => {
    addPago({
      empleadoId,
      empleadoNombre,
      mes: r.mes ?? mesStr,
      tipo: r.tipo ?? 'sueldo',
      monto: r.neto ?? 0,
      fecha: r.fechaPago || todayStr(),
      medio: 'efectivo',
      notas: undefined,
      reciboUrl: r.reciboUrl,
      reciboNombre: r.reciboNombre,
      desglose: r.desglose?.length ? r.desglose : undefined,
      bruto: r.bruto,
      cuil: r.cuil || undefined,
      createdBy: employee?.name,
      createdAt: new Date().toISOString(),
    })
  }

  const handleScanFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setScanning(true)
    // La contadora manda todos los recibos del mes en UN PDF, uno por página: hay
    // que abrirlo en páginas antes de leer, o se cargaría solo el primero.
    setPrepMsg('Abriendo el PDF en páginas…')
    const lista: File[] = []
    for (const f of Array.from(files)) lista.push(...await explotarSiEsMultipagina(f))
    setPrepMsg(lista.length > 1 ? `${lista.length} recibos para leer` : '')
    // Lo ya cargado, para no duplicar. Se arranca con lo que hay guardado y se va
    // sumando lo de esta tanda: `pagos` queda congelado durante todo el bucle, así
    // que sin esto dos páginas del mismo empleado entrarían las dos sin avisar.
    const yaVistos = new Set(
      pagos.filter(p => p.empleadoId).map(p => clavePago(p.empleadoId, p.mes, p.tipo)),
    )
    for (const file of lista) {
      const rid = crypto.randomUUID()
      setScanResults(prev => [...prev, { id: rid, fileName: file.name, status: 'procesando' }])
      const patch = (upd: Partial<ScanResult>) =>
        setScanResults(prev => prev.map(r => r.id === rid ? { ...r, ...upd } : r))
      try {
        // Subimos el archivo y lo leemos con IA en paralelo.
        const [subida, ex] = await Promise.all([uploadFactura(file), extractRecibo(file)])
        const neto = parseImporte(ex.neto)
        const desglose = toDesglose(ex)
        const mes = /^\d{4}-\d{2}$/.test(ex.periodo) ? ex.periodo : mesStr

        // Control de consistencia: haberes - deducciones vs neto leído.
        let warning: string | undefined
        if (neto !== null && desglose.length > 0) {
          const calc = desglose.reduce((s, it) => s + (it.tipo === 'deduccion' ? -it.importe : it.importe), 0)
          if (Math.abs(calc - neto) > Math.max(1, neto * 0.01)) {
            warning = `El desglose suma ${formatMontoCurrency(calc)} pero el neto leído es ${formatMontoCurrency(neto)}. Revisá el recibo.`
          }
        }

        // Vacaciones y aguinaldo se liquidan en un recibo aparte del mensual: el
        // tipo sale de ahí, y es lo que evita que el segundo recibo del mismo mes
        // parezca un duplicado del primero.
        const tipo = TIPO_POR_LIQUIDACION[ex.liquidacion] ?? 'sueldo'

        const base: Partial<ScanResult> = {
          empleadoLeido: ex.empleado,
          tipo, mes, neto: neto ?? undefined, bruto: parseImporte(ex.bruto) ?? undefined,
          cuil: ex.cuil, fechaPago: ex.fechaPago,
          desglose, reciboUrl: subida.url, reciboNombre: subida.nombre, warning,
        }

        const matchId = ex.empleado ? matchEmpleado(ex.empleado, empleadosActivos) : null
        const clave = matchId ? clavePago(matchId, mes, tipo) : ''
        const yaCargado = !!clave && yaVistos.has(clave)

        if (matchId && neto !== null && !warning && !yaCargado) {
          const emp = empleados.find(e => e.id === matchId)!
          yaVistos.add(clave)
          patch({ ...base, status: 'cargado', empleadoNombre: emp.nombre })
          cargarDesdeScan({ ...base, id: rid, fileName: file.name, status: 'cargado' } as ScanResult, emp.id, emp.nombre)
        } else {
          patch({
            ...base,
            status: 'revisar',
            asignarId: matchId ?? '',
            warning: yaCargado
              ? `Ya hay un pago de tipo "${TIPO_PAGO_SUELDO_LABELS[tipo]}" para este empleado en ${mes}. Confirmá solo si corresponde (quedarían dos).`
              : warning ?? (neto === null ? 'La IA no pudo leer el neto a cobrar.' : !matchId ? 'No encontré este nombre en la nómina: asignalo abajo.' : undefined),
          })
        }
      } catch (err) {
        patch({ status: 'error', error: err instanceof Error ? err.message : 'Falló la lectura del recibo.' })
      }
    }
    setScanning(false)
    setPrepMsg('')
    if (scanInputRef.current) scanInputRef.current.value = ''
  }

  const confirmarRevision = (r: ScanResult) => {
    const emp = empleados.find(e => e.id === r.asignarId)
    if (!emp || r.neto == null) return
    cargarDesdeScan(r, emp.id, emp.nombre)
    setScanResults(prev => prev.map(x => x.id === r.id ? { ...x, status: 'cargado', empleadoNombre: emp.nombre } : x))
  }

  // Alta rápida en la nómina con el nombre leído del recibo, y queda elegido en el
  // selector: solo falta confirmar la carga.
  const crearYAsignar = (r: ScanResult) => {
    if (!r.empleadoLeido) return
    const nuevo = addEmpleado({ nombre: r.empleadoLeido, puesto: '', activo: true })
    setScanResults(prev => prev.map(x =>
      x.id === r.id ? { ...x, asignarId: nuevo.id, warning: undefined } : x))
  }

  // Los recibos que quedaron sin empleado porque el nombre no está en la nómina.
  // La primera vez que se escanea el PDF de la contadora son TODOS: crearlos de a
  // uno es media hora de clics.
  const sinNomina = scanResults.filter(r =>
    r.status === 'revisar' && !r.asignarId && !!r.empleadoLeido)

  const crearTodosLosQueFaltan = () => {
    // Un mismo empleado puede venir en dos recibos (mensual + vacaciones): se crea
    // UNA sola vez y los dos renglones quedan apuntando al mismo id.
    const creados = new Map<string, string>()
    const asignaciones = new Map<string, string>()
    for (const r of sinNomina) {
      const clave = normName(r.empleadoLeido!)
      let id = creados.get(clave)
      if (!id) {
        id = addEmpleado({ nombre: r.empleadoLeido!, puesto: '', activo: true }).id
        creados.set(clave, id)
      }
      asignaciones.set(r.id, id)
    }
    setScanResults(prev => prev.map(x =>
      asignaciones.has(x.id) ? { ...x, asignarId: asignaciones.get(x.id), warning: undefined } : x))
  }

  // Lee el VEP/comprobante con IA y deja el borrador listo para revisar. No guarda
  // nada solo: el mes al que entra el gasto sale de la fecha de pago, y eso se
  // confirma a ojo antes de tocar los números del mes.
  const handleVepFile = async (file: File) => {
    setLeyendoVep(true)
    setVepDraft({
      fileName: file.name, importe: '', fechaPago: '', periodo: '',
      nroVep: '', impuesto: '', codigoImpuesto: '',
    })
    try {
      const [subida, ex] = await Promise.all([uploadFactura(file), extractVEP(file)])
      setVepDraft({
        fileName: file.name,
        importe: parseImporte(ex.importe) != null ? String(parseImporte(ex.importe)) : '',
        // Si el comprobante no dice cuándo se pagó, caemos a la fecha de generación
        // del VEP y, si tampoco está, a hoy. Siempre queda editable.
        fechaPago: ex.fechaPago || ex.fechaGeneracion || todayStr(),
        periodo: /^\d{4}-\d{2}$/.test(ex.periodo) ? ex.periodo : '',
        nroVep: ex.nroVep,
        impuesto: ex.impuesto,
        codigoImpuesto: ex.codigoImpuesto,
        comprobanteUrl: subida.url,
        comprobanteNombre: subida.nombre,
      })
    } catch (err) {
      setVepDraft({
        fileName: file.name, importe: '', fechaPago: todayStr(), periodo: '',
        nroVep: '', impuesto: '', codigoImpuesto: '',
        error: err instanceof Error ? err.message : 'No se pudo leer el comprobante. Cargá los datos a mano.',
      })
    } finally {
      setLeyendoVep(false)
      if (vepInputRef.current) vepInputRef.current.value = ''
    }
  }

  const guardarCargas = () => {
    if (!vepDraft) return
    const monto = validateMonto(vepDraft.importe)
    const mes = mesDeFecha(vepDraft.fechaPago)
    if (!monto.ok || monto.value == null || !mes) return
    addPago({
      empleadoId: '',
      empleadoNombre: CARGAS_NOMBRE,
      // El gasto pesa en el mes en que SALE LA PLATA, no en el período que cancela.
      mes,
      tipo: 'cargas',
      monto: monto.value,
      fecha: vepDraft.fechaPago,
      medio: 'transferencia',
      notas: vepDraft.impuesto || undefined,
      periodo: vepDraft.periodo || undefined,
      vepNro: vepDraft.nroVep || undefined,
      reciboUrl: vepDraft.comprobanteUrl,
      reciboNombre: vepDraft.comprobanteNombre,
      createdBy: employee?.name,
      createdAt: new Date().toISOString(),
    })
    setVepDraft(null)
    // Si el pago cayó en otro mes del que se está mirando, saltamos ahí: si no,
    // se guarda y parece que no pasó nada.
    if (mes !== mesStr) {
      const [y, m] = mes.split('-')
      setMesActual({ year: Number(y), month: Number(m) })
    }
  }

  function handleCargarPago() {
    setPagoError('')
    if (!pagoEmpleadoId) {
      setPagoError('Elegí un empleado')
      return
    }
    if (!pagoFecha) {
      setPagoError('Indicá la fecha del pago')
      return
    }
    const result = validateMonto(pagoMonto)
    if (!result.ok) {
      setPagoError(result.error ?? 'Monto inválido')
      return
    }
    const emp = empleados.find(e => e.id === pagoEmpleadoId)
    addPago({
      empleadoId: pagoEmpleadoId,
      empleadoNombre: emp?.nombre ?? '?',
      mes: mesStr,
      tipo: pagoTipo,
      monto: result.value!,
      fecha: pagoFecha,
      medio: pagoMedio,
      notas: pagoNotas.trim() || undefined,
      reciboUrl: reciboUrl || undefined,
      reciboNombre: reciboNombre || undefined,
      createdBy: employee?.name,
      createdAt: new Date().toISOString(),
    })
    resetPagoForm()
    setShowPagoForm(false)
  }

  // Controles del borrador de cargas sociales (se recalculan en cada tecleo).
  const vepMes = vepDraft ? mesDeFecha(vepDraft.fechaPago) : ''
  const vepMonto = vepDraft ? validateMonto(vepDraft.importe) : null
  const vepDuplicado = !!vepDraft?.periodo
    && pagos.some(p => p.tipo === 'cargas' && p.periodo === vepDraft.periodo)
  const vepNoEsSegSocial = !!vepDraft
    && !!(vepDraft.impuesto || vepDraft.codigoImpuesto)
    && !pareceSeguridadSocial(vepDraft.codigoImpuesto, vepDraft.impuesto)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Users className="text-gold-400" size={28} />
          <h1 className="text-2xl font-bold text-navy-800">Sueldos</h1>
        </div>
        <div className="flex gap-2 flex-wrap">
          <input
            ref={scanInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            onChange={e => void handleScanFiles(e.target.files)}
          />
          <button
            onClick={() => scanInputRef.current?.click()}
            disabled={scanning}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-gold-400 text-navy-900 hover:bg-gold-300 disabled:opacity-50 transition-colors"
            title="Subí el PDF que manda la contadora (o una foto): la IA lee cada recibo y carga el neto de cada empleado con su desglose"
          >
            {scanning ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />}
            {scanning ? 'Leyendo…' : 'Subir recibos (PDF)'}
          </button>
          <input
            ref={vepInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) void handleVepFile(f)
            }}
          />
          <button
            onClick={() => vepInputRef.current?.click()}
            disabled={leyendoVep}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-white border border-gold-400 text-navy-800 hover:bg-gold-50 disabled:opacity-50 transition-colors"
            title="Subí el VEP o el comprobante de pago de las cargas sociales: la IA lee el importe, el período y la fecha de pago"
          >
            {leyendoVep ? <Loader2 size={16} className="animate-spin" /> : <Landmark size={16} />}
            {leyendoVep ? 'Leyendo…' : 'Cargas sociales (VEP)'}
          </button>
          <button
            onClick={() => { const o = !showPagoForm; setShowPagoForm(o); setShowNominaForm(false); if (o) resetPagoForm() }}
            className="flex items-center gap-1.5 px-4 py-2 bg-navy-800 text-cream rounded-lg text-sm font-semibold hover:bg-navy-700 transition-colors"
          >
            <Plus size={16} />
            Cargar Pago
          </button>
          <button
            onClick={() => { setShowNominaForm(!showNominaForm); setShowPagoForm(false) }}
            className="flex items-center gap-1.5 px-4 py-2 bg-white border border-navy-200 text-navy-700 rounded-lg text-sm font-semibold hover:bg-navy-50 transition-colors"
          >
            <UserPlus size={16} />
            Gestionar Nómina
          </button>
        </div>
      </div>

      {/* Revisión del VEP de cargas sociales */}
      {vepDraft && (
        <div className="bg-white rounded-xl shadow-sm border border-gold-300 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-navy-800 text-sm flex items-center gap-1.5">
              <Landmark size={14} /> Cargas sociales — {vepDraft.fileName}
            </h3>
            <button onClick={() => setVepDraft(null)} className="text-navy-400 hover:text-navy-600" title="Descartar">
              <X size={16} />
            </button>
          </div>

          {leyendoVep ? (
            <p className="text-sm text-navy-500 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin" /> Leyendo el comprobante…
            </p>
          ) : (
            <>
              {vepDraft.error && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-300 rounded-lg p-2">
                  {vepDraft.error} Podés completar los datos abajo a mano.
                </p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-navy-500 font-medium">Importe pagado *</label>
                  <div className="relative mt-0.5">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-navy-400">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={vepDraft.importe}
                      onChange={e => setVepDraft({ ...vepDraft, importe: e.target.value })}
                      className="w-full pl-7 pr-3 py-2 border border-navy-200 rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-navy-500 font-medium">Fecha de pago *</label>
                  <input
                    type="date"
                    value={vepDraft.fechaPago}
                    onChange={e => setVepDraft({ ...vepDraft, fechaPago: e.target.value })}
                    className="w-full text-sm border border-navy-200 rounded-lg px-3 py-2 mt-0.5 text-navy-600"
                  />
                </div>
                <div>
                  <label className="text-xs text-navy-500 font-medium">Período que cancela</label>
                  <input
                    type="month"
                    value={vepDraft.periodo}
                    onChange={e => setVepDraft({ ...vepDraft, periodo: e.target.value })}
                    className="w-full text-sm border border-navy-200 rounded-lg px-3 py-2 mt-0.5 text-navy-600"
                  />
                </div>
              </div>

              {(vepDraft.nroVep || vepDraft.impuesto) && (
                <p className="text-xs text-navy-500">
                  {vepDraft.nroVep && <>VEP N° <strong>{vepDraft.nroVep}</strong></>}
                  {vepDraft.nroVep && vepDraft.impuesto && ' · '}
                  {vepDraft.impuesto}
                </p>
              )}

              {/* El mes del gasto lo decide la fecha de pago, no el mes que estás
                  mirando arriba ni el período del VEP. Se avisa antes de guardar. */}
              {vepMes ? (
                <p className="text-[11px] text-navy-500 bg-navy-50 border border-navy-100 rounded-lg p-2">
                  Se va a cargar como gasto de <strong>{periodoLabel(vepMes)}</strong> (el mes en que salió la plata)
                  {vepDraft.periodo && vepDraft.periodo !== vepMes && <> y corresponde al período <strong>{periodoLabel(vepDraft.periodo)}</strong></>}.
                </p>
              ) : (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-300 rounded-lg p-2">
                  Poné la fecha de pago: es la que decide en qué mes pesa el gasto.
                </p>
              )}

              {vepNoEsSegSocial && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-300 rounded-lg p-2 flex items-start gap-1.5">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <span>Este comprobante no parece de seguridad social ({vepDraft.impuesto || vepDraft.codigoImpuesto}). Si es IVA, Ganancias u otro impuesto, va en Impuestos y no acá.</span>
                </p>
              )}
              {vepDuplicado && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-300 rounded-lg p-2 flex items-start gap-1.5">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <span>Ya hay cargas sociales cargadas del período {periodoLabel(vepDraft.periodo)}. Guardá solo si es un pago aparte (quedarían dos).</span>
                </p>
              )}

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setVepDraft(null)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-navy-500 hover:bg-navy-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={guardarCargas}
                  disabled={!vepMonto?.ok || !vepMes}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-navy-800 text-cream hover:bg-navy-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Save size={14} /> Cargar cargas sociales
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Aviso mientras se abre un PDF de varios recibos (antes de tener resultados) */}
      {prepMsg && scanResults.length === 0 && (
        <p className="text-sm text-navy-500 flex items-center gap-2 bg-white rounded-xl border border-navy-100 p-3">
          <Loader2 size={14} className="animate-spin" /> {prepMsg}
        </p>
      )}

      {/* Resultados del escaneo de recibos */}
      {scanResults.length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gold-300 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-navy-800 text-sm flex items-center gap-1.5">
              <FileUp size={14} /> Recibos leídos
              {scanning && prepMsg && <span className="font-normal text-navy-400">— {prepMsg}</span>}
            </h3>
            {!scanning && (
              <button onClick={() => setScanResults([])} className="text-xs text-navy-400 hover:text-navy-600">Limpiar</button>
            )}
          </div>

          {/* Alta masiva: la primera vez que se escanea el PDF de la contadora,
              ningún nombre está en la nómina y crearlos de a uno es interminable. */}
          {!scanning && sinNomina.length > 1 && (
            <div className="flex items-center justify-between gap-2 flex-wrap rounded-lg border border-navy-200 bg-navy-50 p-2.5">
              <p className="text-xs text-navy-600">
                Hay <strong>{sinNomina.length}</strong> recibos con nombres que no están en la nómina.
              </p>
              <button
                onClick={crearTodosLosQueFaltan}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white border border-navy-300 text-navy-700 hover:bg-navy-100"
              >
                <UserPlus size={13} /> Crear los que faltan en la nómina
              </button>
            </div>
          )}
          {scanResults.map(r => (
            <div key={r.id} className={`rounded-lg border p-3 text-sm ${
              r.status === 'cargado' ? 'border-emerald-200 bg-emerald-50'
              : r.status === 'error' ? 'border-red-200 bg-red-50'
              : r.status === 'revisar' ? 'border-amber-200 bg-amber-50'
              : 'border-navy-100 bg-navy-50'
            }`}>
              <div className="flex items-center gap-2 flex-wrap">
                {r.status === 'procesando' && <Loader2 size={14} className="animate-spin text-navy-400" />}
                {r.status === 'cargado' && <CheckCircle2 size={14} className="text-emerald-600" />}
                {(r.status === 'revisar' || r.status === 'error') && <AlertTriangle size={14} className={r.status === 'error' ? 'text-red-500' : 'text-amber-500'} />}
                <span className="font-medium text-navy-800">
                  {r.status === 'procesando' ? `Leyendo ${r.fileName}…`
                    : r.status === 'error' ? r.fileName
                    : r.empleadoNombre ?? r.empleadoLeido ?? r.fileName}
                </span>
                {/* El tipo solo se muestra cuando NO es el sueldo mensual: es
                    justo el caso en que hay dos recibos del mismo empleado. */}
                {r.tipo && r.tipo !== 'sueldo' && (
                  <span className="text-[10px] bg-gold-100 text-gold-700 px-1.5 py-0.5 rounded-full font-medium">
                    {TIPO_PAGO_SUELDO_LABELS[r.tipo]}
                  </span>
                )}
                {r.neto != null && <span className="font-semibold text-navy-800">{formatMontoCurrency(r.neto)}</span>}
                {r.mes && <span className="text-xs text-navy-500">({r.mes})</span>}
                {r.desglose && r.desglose.length > 0 && (
                  <span className="text-xs text-navy-400">{r.desglose.length} renglones</span>
                )}
                {r.status === 'cargado' && <span className="text-xs font-semibold text-emerald-700">Cargado ✓</span>}
              </div>
              {r.error && <p className="text-xs text-red-600 mt-1">{r.error}</p>}
              {r.warning && r.status !== 'cargado' && <p className="text-xs text-amber-700 mt-1">{r.warning}</p>}
              {r.status === 'revisar' && (
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <select
                    value={r.asignarId ?? ''}
                    onChange={e => setScanResults(prev => prev.map(x => x.id === r.id ? { ...x, asignarId: e.target.value } : x))}
                    className="text-sm border border-navy-200 rounded-lg px-2 py-1.5 bg-white"
                  >
                    <option value="">Asignar empleado…</option>
                    {empleadosActivos.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
                  </select>
                  {r.empleadoLeido && !empleadosActivos.some(e => matchEmpleado(r.empleadoLeido!, [e])) && (
                    <button
                      onClick={() => crearYAsignar(r)}
                      className="text-xs px-2 py-1.5 rounded-lg border border-navy-200 text-navy-600 hover:bg-white"
                    >
                      + Crear "{r.empleadoLeido}" en la nómina
                    </button>
                  )}
                  <button
                    onClick={() => confirmarRevision(r)}
                    disabled={!r.asignarId || r.neto == null}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-navy-800 text-cream hover:bg-navy-700 disabled:opacity-40"
                  >
                    <Save size={12} /> Confirmar carga
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Form: Nueva alta de empleado + lista de nómina */}
      {showNominaForm && (
        <div className="bg-white rounded-xl shadow-sm border border-gold-300 p-4 space-y-3">
          <h3 className="font-semibold text-navy-800 text-sm">Nómina del personal</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-navy-500 font-medium">Nombre *</label>
              <input
                value={nuevoNombre}
                onChange={e => setNuevoNombre(e.target.value)}
                className="w-full text-sm border border-navy-200 rounded-lg px-3 py-2 mt-0.5"
                placeholder="Ej: Roxana Gómez"
                autoFocus
              />
            </div>
            <div>
              <label className="text-xs text-navy-500 font-medium">Puesto</label>
              <input
                value={nuevoPuesto}
                onChange={e => setNuevoPuesto(e.target.value)}
                className="w-full text-sm border border-navy-200 rounded-lg px-3 py-2 mt-0.5"
                placeholder="Ej: Encargada"
              />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={handleAgregarEmpleado}
              disabled={!nuevoNombre.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-navy-800 text-cream hover:bg-navy-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Save size={14} /> Agregar
            </button>
          </div>

          {empleadosActivos.length > 0 ? (
            <div className="divide-y divide-navy-100 border-t border-navy-100 pt-1">
              {empleadosActivos.map(emp => (
                <div key={emp.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <span className="text-sm font-medium text-navy-800">{emp.nombre}</span>
                    {emp.puesto && <span className="text-xs text-navy-400 ml-2">{emp.puesto}</span>}
                  </div>
                  <button
                    onClick={() => setConfirmDeleteEmpleado(emp)}
                    className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"
                    title="Dar de baja"
                  >
                    <Trash2 size={14} className="text-navy-300" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-navy-400 border-t border-navy-100 pt-3">Todavía no hay empleados en la nómina.</p>
          )}
        </div>
      )}

      {/* Form: Cargar pago */}
      {showPagoForm && (
        <div className="bg-white rounded-xl shadow-sm border border-navy-300 p-4 space-y-3">
          <h3 className="font-semibold text-navy-800 text-sm">Cargar Pago - {monthLabel(mesActual.year, mesActual.month)}</h3>
          {/* El pago se guarda con el mes que está seleccionado arriba, no con la
              fecha de hoy. Cargar en agosto el sueldo de julio sin mover el mes
              lo manda al mes equivocado y el resultado de julio queda mal. */}
          {esMesActual ? (
            <p className="text-[11px] text-navy-500 bg-navy-50 border border-navy-100 rounded-lg p-2">
              Se va a cargar en <strong>{monthLabel(mesActual.year, mesActual.month)}</strong>. Si estás
              cargando el sueldo de otro mes, cambiá el mes arriba <em>antes</em> de guardar.
            </p>
          ) : (
            <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-300 rounded-lg p-2">
              Este pago se va a cargar en <strong>{monthLabel(mesActual.year, mesActual.month)}</strong>,
              que no es el mes actual. Si es lo que querés, seguí.
            </p>
          )}
          {empleadosActivos.length === 0 ? (
            <p className="text-sm text-navy-400">
              Primero agregá empleados en <button onClick={() => { setShowPagoForm(false); setShowNominaForm(true) }} className="text-gold-600 font-semibold hover:text-gold-700">Gestionar Nómina</button>.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-navy-500 font-medium">Empleado *</label>
                  <select
                    value={pagoEmpleadoId}
                    onChange={e => setPagoEmpleadoId(e.target.value)}
                    className="w-full text-sm border border-navy-200 rounded-lg px-3 py-2 mt-0.5"
                  >
                    <option value="">Elegir empleado...</option>
                    {empleadosActivos.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-navy-500 font-medium">Tipo</label>
                  <select
                    value={pagoTipo}
                    onChange={e => setPagoTipo(e.target.value as TipoPagoSueldo)}
                    className="w-full text-sm border border-navy-200 rounded-lg px-3 py-2 mt-0.5"
                  >
                    {TIPOS.map(t => (
                      <option key={t} value={t}>{TIPO_PAGO_SUELDO_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-navy-500 font-medium">Importe *</label>
                  <div className="relative mt-0.5">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-navy-400">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="0,00"
                      value={pagoMonto}
                      onChange={e => setPagoMonto(e.target.value)}
                      className="w-full pl-7 pr-3 py-2 border border-navy-200 rounded-lg text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-navy-500 font-medium">Fecha *</label>
                  <input
                    type="date"
                    value={pagoFecha}
                    onChange={e => setPagoFecha(e.target.value)}
                    className="w-full text-sm border border-navy-200 rounded-lg px-3 py-2 mt-0.5 text-navy-600"
                  />
                </div>
                <div>
                  <label className="text-xs text-navy-500 font-medium">Medio</label>
                  <select
                    value={pagoMedio}
                    onChange={e => setPagoMedio(e.target.value as MedioPagoSueldo)}
                    className="w-full text-sm border border-navy-200 rounded-lg px-3 py-2 mt-0.5"
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="transferencia">Transferencia</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-navy-500 font-medium">Notas (opcional)</label>
                  <input
                    value={pagoNotas}
                    onChange={e => setPagoNotas(e.target.value)}
                    className="w-full text-sm border border-navy-200 rounded-lg px-3 py-2 mt-0.5"
                    placeholder="Ej: primera quincena"
                  />
                </div>
              </div>

              {/* Adjuntar recibo */}
              <div>
                <label className="text-xs text-navy-500 font-medium">Recibo (PDF o foto)</label>
                <input
                  ref={reciboInputRef}
                  type="file"
                  accept="application/pdf,image/*"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) handleAdjuntarRecibo(f)
                    e.target.value = ''
                  }}
                />
                <div className="mt-0.5 flex items-center gap-2 flex-wrap">
                  {reciboUrl ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-green-50 border border-green-300 rounded-lg text-xs text-green-700 max-w-full">
                      <Paperclip size={13} className="shrink-0" />
                      <span className="truncate">{reciboNombre || 'Recibo adjunto'}</span>
                      <button type="button" onClick={clearRecibo} className="text-green-500 hover:text-green-700 shrink-0" title="Quitar adjunto">
                        <X size={13} />
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => reciboInputRef.current?.click()}
                      disabled={subiendoRecibo}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-navy-200 text-navy-600 rounded-lg text-xs font-medium hover:bg-navy-50 disabled:opacity-50 disabled:cursor-wait"
                    >
                      {subiendoRecibo ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
                      {subiendoRecibo ? 'Subiendo…' : 'Adjuntar recibo'}
                    </button>
                  )}
                </div>
                {reciboError && <p className="text-xs text-amber-600 mt-1">{reciboError}</p>}
              </div>

              {pagoError && <p className="text-xs text-red-600 -mt-1">{pagoError}</p>}
              <div className="flex gap-2 justify-end pt-1">
                <button
                  onClick={() => { setShowPagoForm(false); resetPagoForm() }}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-navy-500 hover:bg-navy-50"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleCargarPago}
                  disabled={!pagoEmpleadoId || !pagoMonto || !pagoFecha || subiendoRecibo}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-navy-800 text-cream hover:bg-navy-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Save size={14} /> Cargar
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Navegación por mes + total */}
      <div className="bg-white rounded-xl shadow-sm border border-navy-100 p-4">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => handleMes(-1)} className="p-2 rounded-lg hover:bg-navy-50 transition-colors">
            <ChevronLeft size={20} className="text-navy-600" />
          </button>
          <h2 className="text-lg font-bold text-navy-800">{monthLabel(mesActual.year, mesActual.month)}</h2>
          <button onClick={() => handleMes(1)} className="p-2 rounded-lg hover:bg-navy-50 transition-colors">
            <ChevronRight size={20} className="text-navy-600" />
          </button>
        </div>
        <div className="bg-navy-50 rounded-lg p-3 text-center mb-3">
          <p className="text-xs text-navy-500 font-medium">Costo laboral del mes</p>
          <p className="text-2xl font-bold text-navy-800">{formatMontoCurrency(totalMes)}</p>
          <p className="text-[11px] text-navy-400 mt-0.5">
            {formatMontoCurrency(totalPersonal)} al personal + {formatMontoCurrency(totalCargas)} de cargas sociales
          </p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-center">
          {([...TIPOS, 'cargas'] as TipoPagoSueldo[]).map(t => (
            <div key={t} className={`rounded-lg p-2 ${t === 'cargas' ? 'bg-gold-50 border border-gold-200' : 'bg-navy-50'}`}>
              <p className="text-[10px] text-navy-500 font-medium">{TIPO_PAGO_SUELDO_LABELS[t]}</p>
              <p className="text-sm font-bold text-navy-800">{formatMontoCurrency(totalesPorTipo[t])}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Pagos del mes agrupados por empleado + cargas sociales */}
      {(grupos.length > 0 || cargasDelMes.length > 0) ? (
        <div className="space-y-3">
          <h3 className="font-semibold text-navy-800">Pagos de {monthLabel(mesActual.year, mesActual.month)}</h3>
          {grupos.map(g => (
            <div key={g.nombre} className="bg-white rounded-xl shadow-sm border border-navy-100 p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-navy-800 text-sm">{g.nombre}</h4>
                <span className="text-sm font-bold text-navy-800">{formatMontoCurrency(g.subtotal)}</span>
              </div>
              <div className="divide-y divide-navy-100">
                {g.pagos.map(p => (
                  <div key={p.id} className="py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] bg-gold-100 text-gold-700 px-1.5 py-0.5 rounded-full font-medium">
                            {TIPO_PAGO_SUELDO_LABELS[p.tipo]}
                          </span>
                          <span className="text-sm font-semibold text-navy-800">{formatMontoCurrency(p.monto)}</span>
                          <span className="text-xs text-navy-400">{formatDateAR(p.fecha)}</span>
                          <span className="text-[10px] bg-navy-100 text-navy-500 px-1.5 py-0.5 rounded-full">{p.medio}</span>
                        </div>
                        {p.notas && <p className="text-xs text-navy-400 italic mt-0.5">{p.notas}</p>}
                        {p.reciboUrl && (
                          <div className="flex items-center gap-3 mt-1">
                            <a href={p.reciboUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800">
                              <Eye size={13} /> Ver recibo
                            </a>
                            <a href={downloadUrl(p.reciboUrl, p.reciboNombre || 'recibo')} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800">
                              <Download size={13} /> Descargar
                            </a>
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {p.desglose && p.desglose.length > 0 && (
                          <button
                            onClick={() => setExpandedPagoId(expandedPagoId === p.id ? null : p.id)}
                            className="p-1 rounded text-navy-400 hover:text-navy-700 hover:bg-navy-50"
                            title="Ver desglose del recibo"
                          >
                            {expandedPagoId === p.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        )}
                        <button
                          onClick={() => setConfirmDeletePago(p)}
                          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
                          title="Borrar pago"
                        >
                          <Trash2 size={14} className="text-navy-300" />
                        </button>
                      </div>
                    </div>
                    {expandedPagoId === p.id && p.desglose && (
                      <div className="mt-2 rounded-lg bg-navy-50 p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-x-4">
                        <div>
                          <p className="text-[10px] font-semibold text-emerald-700 uppercase mb-1">Haberes</p>
                          {p.desglose.filter(d => d.tipo !== 'deduccion').map((d, i) => (
                            <div key={i} className="flex justify-between text-xs text-navy-700 py-0.5">
                              <span>{d.descripcion}{d.tipo === 'haber_nr' ? ' (no rem.)' : ''}</span>
                              <span className="font-medium">{formatMontoCurrency(d.importe)}</span>
                            </div>
                          ))}
                        </div>
                        <div>
                          <p className="text-[10px] font-semibold text-red-600 uppercase mb-1">Deducciones</p>
                          {p.desglose.filter(d => d.tipo === 'deduccion').map((d, i) => (
                            <div key={i} className="flex justify-between text-xs text-navy-700 py-0.5">
                              <span>{d.descripcion}</span>
                              <span className="font-medium">−{formatMontoCurrency(d.importe)}</span>
                            </div>
                          ))}
                          {p.bruto != null && (
                            <p className="text-[10px] text-navy-400 mt-1.5">Bruto remunerativo: {formatMontoCurrency(p.bruto)}</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Cargas sociales: no van agrupadas por empleado porque se pagan por
              toda la nómina junta. El período que cancelan puede ser de otro mes. */}
          {cargasDelMes.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gold-300 p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-navy-800 text-sm flex items-center gap-1.5">
                  <Landmark size={14} className="text-gold-500" /> Cargas sociales
                </h4>
                <span className="text-sm font-bold text-navy-800">{formatMontoCurrency(totalCargas)}</span>
              </div>
              <div className="divide-y divide-navy-100">
                {cargasDelMes.map(p => (
                  <div key={p.id} className="py-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-navy-800">{formatMontoCurrency(p.monto)}</span>
                        <span className="text-xs text-navy-400">Pagado el {formatDateAR(p.fecha)}</span>
                        {p.periodo && (
                          <span className="text-[10px] bg-gold-100 text-gold-700 px-1.5 py-0.5 rounded-full font-medium">
                            Período {periodoLabel(p.periodo)}
                          </span>
                        )}
                        {p.vepNro && (
                          <span className="text-[10px] bg-navy-100 text-navy-500 px-1.5 py-0.5 rounded-full">VEP {p.vepNro}</span>
                        )}
                      </div>
                      {p.notas && <p className="text-xs text-navy-400 italic mt-0.5">{p.notas}</p>}
                      {p.reciboUrl && (
                        <div className="flex items-center gap-3 mt-1">
                          <a href={p.reciboUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800">
                            <Eye size={13} /> Ver comprobante
                          </a>
                          <a href={downloadUrl(p.reciboUrl, p.reciboNombre || 'vep')} className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800">
                            <Download size={13} /> Descargar
                          </a>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => setConfirmDeletePago(p)}
                      className="p-1.5 rounded-lg hover:bg-red-50 transition-colors shrink-0"
                      title="Borrar pago de cargas sociales"
                    >
                      <Trash2 size={14} className="text-navy-300" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-navy-100 p-8 text-center">
          <Wallet size={40} className="text-navy-200 mx-auto mb-3" />
          <p className="text-navy-500 text-sm">No hay pagos cargados en {monthLabel(mesActual.year, mesActual.month)}.</p>
        </div>
      )}

      {/* Confirmaciones */}
      <ConfirmDialog
        open={confirmDeleteEmpleado !== null}
        title="Dar de baja empleado"
        message={confirmDeleteEmpleado ? `Se saca a "${confirmDeleteEmpleado.nombre}" de la nómina activa. Sus pagos ya cargados se conservan.` : ''}
        confirmLabel="Dar de baja"
        onConfirm={() => { if (confirmDeleteEmpleado) deleteEmpleado(confirmDeleteEmpleado.id); setConfirmDeleteEmpleado(null) }}
        onCancel={() => setConfirmDeleteEmpleado(null)}
      />
      <ConfirmDialog
        open={confirmDeletePago !== null}
        title="Borrar pago"
        message={confirmDeletePago ? `Se borra el pago de ${formatMontoCurrency(confirmDeletePago.monto)} de "${confirmDeletePago.empleadoNombre}". Esta acción no se puede deshacer.` : ''}
        confirmLabel="Borrar"
        onConfirm={() => { if (confirmDeletePago) deletePago(confirmDeletePago.id); setConfirmDeletePago(null) }}
        onCancel={() => setConfirmDeletePago(null)}
      />
    </div>
  )
}
