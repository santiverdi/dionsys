import type { Turno } from '../context/OccupancyContext'
export type { Turno } from '../context/OccupancyContext'

export type Role = 'concierge' | 'mucama' | 'admin' | 'mantenimiento' | 'encargada'

export interface Employee {
  id: string
  name: string
  pin: string
  role: Role
  active: boolean
}

export interface Distributor {
  id: string
  name: string
  phone: string
  category: string
  notes: string
}

export interface Product {
  id: string
  distributorId: string
  name: string
  unit: string
  active: boolean
}

export interface OrderItem {
  productId: string
  productName: string
  quantity: number
  unit: string
  notes: string
}

export interface Order {
  id: string
  distributorId: string
  distributorName: string
  createdBy: string
  createdAt: string
  items: OrderItem[]
  status: 'pendiente' | 'enviado' | 'recibido' | 'borrado'
  notes: string
  type?: 'distribuidor' | 'recepcion'
  deletedAt?: string
  deletedBy?: string
  monto?: number
  montoCargadoBy?: string
  montoCargadoAt?: string
  receiptPhoto?: string
  // Boleta/factura de recepción cargada por el admin (la lee la IA). El total
  // queda también en `monto` para el gasto mensual; acá va el detalle completo.
  factura?: FacturaProveedor
}

export interface ReceptionProduct {
  id: string
  name: string
  unit: string
  supplier: 'panaderia' | 'lacteos'
}

export interface ConsumptionRecord {
  id: string
  date: string
  guests: number
  supplier: 'panaderia' | 'lacteos'
  items: { productName: string; quantity: number; unit: string }[]
  createdBy: string
}

// --- Deposito: Stock en tiempo real ---

export interface DepositoItem {
  id: string
  name: string
  unit: string              // unidad de CONSUMO: "kg", "caja", "unidad", "bidon", "bolson"
  category: 'desayunador' | 'limpieza'
  stock: number             // stock actual, en unidad de consumo
  stockIdeal: number        // stock ideal/deseado para reponer, en unidad de consumo
  packUnit?: string         // unidad de COMPRA opcional: "bolsa", "caja", "pack" (cómo se pide/recibe)
  packSize?: number         // cuántas unidades de consumo trae un packUnit (ej: bolsa de harina = 10 kg)
  supplierId?: string       // proveedor del deposito (override del mapeo estatico)
}

export interface StockMovement {
  id: string
  itemId: string
  itemName: string
  type: 'entrada' | 'salida'
  quantity: number
  date: string
  createdBy: string
  notes: string
  pedidoId?: string         // links 'entrada' movements to a PedidoSemanal when recibido
}

export interface PedidoSemanalItem {
  itemId: string
  name: string
  unit: string              // unidad de consumo (kg/unidad) — para referencia
  stockActual: number
  stockIdeal: number
  aPedir: number            // cantidad a pedir, en unidad de COMPRA (orderUnit)
  recibido?: number         // cantidad realmente recibida, en unidad de COMPRA (set al marcar recibido)
  orderUnit?: string        // snapshot de la unidad de compra al momento del pedido ("bolsa"/"caja"/unit)
  packSize?: number         // snapshot de cuántas unidades de consumo trae un orderUnit
}

export interface DepositoSupplier {
  id: string
  name: string
  phone: string
  category: string
}

export type TipoFactura = 'A' | 'B' | 'C' | ''

// Un renglón de la factura (lo lee la IA, item por item).
// concepto distingue un producto de un impuesto/percepción (IVA, IIBB, etc.).
export interface FacturaItemLinea {
  descripcion: string
  cantidad?: number
  importe: number           // importe del renglón
  concepto?: 'producto' | 'impuesto'
}

// Factura de UNA distribuidora dentro de un pedido semanal. Charo la carga al
// recibir la mercadería; la IA detecta tipo (A/B/C), monto, fecha y los renglones.
export type FormaPago = 'contado' | 'cuenta_corriente'

export interface FacturaProveedor {
  supplierId: string
  supplierName: string
  tipoFactura: TipoFactura
  monto: number
  fecha: string             // YYYY-MM-DD (fecha de la factura, para el reporte mensual)
  items?: FacturaItemLinea[] // detalle por renglón (para el gasto por producto)
  pago?: FormaPago          // contado | cuenta corriente (default: contado si falta)
  vencimiento?: string      // solo cuenta corriente: fecha de vencimiento del pago (YYYY-MM-DD)
  pagado?: boolean          // solo cuenta corriente: si ya se saldó
  fechaPago?: string        // YYYY-MM-DD en que se pagó (cuenta corriente saldada)
  facturaUrl?: string       // archivo en Supabase Storage
  facturaNombre?: string
  cargadoBy?: string
  cargadoAt?: string
}

// Referencia al egreso de la caja de recepción con el que se pagó una boleta
// suelta. Si está presente, esa plata YA está contada como gasto de la caja:
// la boleta aporta el detalle (proveedor, renglones) pero no suma de nuevo.
export interface CajaGastoRef {
  cajaId: string
  nroCaja: number
  fechaHora: string         // fechaHora del egreso dentro de la caja
  observacion: string
  total: number
}

// Boleta/factura cargada A MANO, sin pedido asociado (compra directa o proveedor
// fuera del circuito de pedidos). Vive en su propia colección; entra igual al
// gasto mensual, la cuenta corriente y el reporte para la contadora.
export interface FacturaManual extends FacturaProveedor {
  id: string
  // Pagada con plata de la caja de recepción (asociada a ese egreso).
  // Ausente = se pagó fuera de la caja (administración).
  pagoCaja?: CajaGastoRef
}

export interface PedidoSemanal {
  id: string
  date: string
  createdBy: string
  items: PedidoSemanalItem[]
  // armado = Roxana lo guardó · pedido = Charo lo pidió a las distribuidoras · recibido = llegó al depósito
  status: 'armado' | 'pedido' | 'recibido' | 'borrado'
  pedidoAt?: string
  pedidoBy?: string
  deletedAt?: string
  deletedBy?: string
  recibidoAt?: string
  recibidoBy?: string
  cerradoSinStock?: boolean  // cerrado como recibido SIN sumar stock (la mercadería ya se había cargado a mano)
  monto?: number
  montoCargadoBy?: string
  montoCargadoAt?: string
  receiptPhoto?: string
  facturas?: FacturaProveedor[]   // facturas por distribuidora (fuente del gasto mensual)
}

// --- Mantenimiento ---

export type MaintenanceTaskStatus = 'pendiente' | 'en_progreso' | 'completado'

export type MaterialSource = 'stock_propio' | 'compra_externa'

export interface MaintenanceMaterial {
  id: string
  name: string
  quantity: number
  unit: string
  source: MaterialSource
  cost?: number
  receiptPhoto?: string
}

// --- Control de Caja (parte diario) ---

export type MedioPago = 'efectivo' | 'tarjetas' | 'cheques' | 'transferencia' | 'otros'

// Una fila de movimiento dentro de una caja (ingreso/egreso/apertura/retiro).
export interface CajaMovimiento {
  fechaHora: string         // ISO
  usuario: string
  comp: string              // comprobante; en tarjetas suele traer "FB 3-527"
  habitacion: string        // "1001" o "205/202" (puede ser doble)
  observacion: string       // "Reserva 389 - Yamila..." / "Pago Reserva 492 /" / "RETIRO EFECTIVO"
  efectivo: number
  tarjetas: number
  cheques: number
  transferencia: number
  otros: number
  total: number
  // Derivados (parseados de observacion/comp):
  reserva?: string
  pasajero?: string
  facturaB?: string
}

// Una caja del PMS (Todoalojamiento) importada desde su Excel. Un turno ≈ una caja.
export interface CajaParte {
  id: string
  nroCaja: number
  puntoVenta: string        // "Recepcion"
  moneda: string            // "AR$"
  usuarioApertura: string
  usuarioCierre?: string
  aperturaAt: string        // ISO; deriva el turno
  cierreAt?: string         // ISO; ausente si la caja sigue abierta
  turno?: Turno             // derivado de la hora de apertura
  conserje?: string         // derivado de usuarioApertura (match con CONSERJES)
  aperturaMonto: number     // monto de apertura (efectivo)
  saldoFinal: number        // "Saldo total en caja"
  ingresos: CajaMovimiento[]
  egresos: CajaMovimiento[]
  retiros: CajaMovimiento[] // "Egreso al cerrar Caja" (tarjetas/transf. que no quedan en efectivo)
  importedBy: string
  importedAt: string
  sourceFileName?: string
}

// --- Parte de Habitaciones (parte diario) ---

export type EstadoHabitacion = 'sucia' | 'limpia' | 'mantenimiento'

// Una habitación ocupada en el parte. Una reserva puede ocupar varias (grupo).
export interface HabitacionOcupada {
  habitacion: string        // "201", "1002"
  reserva: string           // "2946"
  plazas: number
  canal: string             // origen de la reserva: "Booking.com", "WhatsApp", "Walk In", agencia…
  checkIn?: string          // ISO (fecha de check-in de la reserva)
  checkInActual?: string    // ISO (fecha/hora real de ingreso)
}

export interface HabitacionLibre {
  habitacion: string
  estado: EstadoHabitacion
}

// El "Parte Diario" del PMS (Todoalojamiento), un PDF por caja/turno. Liga con
// CajaParte por nroCaja. No tiene plata: es el movimiento de habitaciones.
export interface ParteHabitaciones {
  id: string
  nroCaja: number           // "Parte Diario Caja 80" → liga con CajaParte
  usuario: string
  fechaCaja: string         // ISO; "Fecha caja: 10/02/2026 06:52" — deriva turno
  turno?: Turno
  conserje?: string
  ocupadas: HabitacionOcupada[]
  libres: HabitacionLibre[]
  totalOcupadas: number     // del PDF ("Total habitaciones ocupadas")
  totalPlazas: number
  totalLibres: number
  sucias: number
  limpias: number
  mantenimiento: number
  importedBy: string
  importedAt: string
  sourceFileName?: string
}

// La "hoja de checkout" (sobre) escaneada que se adjunta a una salida del parte.
// Indica dónde se cobró y con qué medio; se guarda solo la URL (en Supabase Storage).
export interface CheckoutDoc {
  reserva: string
  url: string
  nombre: string
  scannedBy: string
  scannedAt: string   // ISO
}

// --- Impuestos y Servicios ---

export type FrecuenciaVto = 'mensual' | 'anual'

// Categoría de un ítem cargado en "Impuestos y Servicios". Sirve para separar en
// el reporte los impuestos reales (AFIP, ARBA, EDEA…) de los abonos de servicios
// (ascensores, NetMDQ…) y de los honorarios profesionales (contadora, técnicos).
// Retrocompat: un servicio SIN categoría cuenta como 'impuesto'.
export type CategoriaServicio = 'impuesto' | 'servicio' | 'profesional'

export const CATEGORIA_LABELS: Record<CategoriaServicio, string> = {
  impuesto: 'Impuesto',
  servicio: 'Servicio / abono',
  profesional: 'Profesional',
}

export interface ImpuestoServicio {
  id: string
  nombre: string
  nroCuenta: string
  urlPago: string
  frecuencia: FrecuenciaVto
  diaVto: number // dia del mes del vencimiento
  observaciones: string
  categoria?: CategoriaServicio // opcional; ausente = 'impuesto' (retrocompat)
}

export interface PagoMensual {
  id: string
  impuestoId: string
  mes: string // YYYY-MM — el mes de vtoActual, no el mes en que se cargó
  monto: number
  vtoActual: string // YYYY-MM-DD
  vtoSiguiente: string // YYYY-MM-DD
  pagado: boolean
  fechaPago?: string
  createdBy?: string
  createdAt?: string
  facturaUrl?: string // URL pública del archivo de factura adjunto (Supabase Storage)
  facturaNombre?: string // nombre original del archivo, para mostrar y descargar
}

export interface MaintenanceTask {
  id: string
  createdBy: string
  createdByRole: Role
  createdAt: string
  description: string
  issuePhoto: string
  location?: string
  selfInitiated: boolean

  status: MaintenanceTaskStatus
  completedBy?: string
  completedAt?: string
  completionPhoto?: string
  resolutionNotes?: string
  materials?: MaintenanceMaterial[]
}

// --- Sueldos / nómina ---
//
// La nómina es INDEPENDIENTE de Employee (usuarios con PIN del sistema): Roxana o
// Julio pueden cobrar sueldo sin tener acceso a la app. Por eso EmpleadoNomina es
// su propia entidad y PagoSueldo guarda un snapshot del nombre.

export interface EmpleadoNomina {
  id: string
  nombre: string
  puesto: string
  activo: boolean
}

// 'cargas' NO es un pago a un empleado: es el VEP de seguridad social que se paga
// a AFIP por toda la nómina junta. Va acá y no en Impuestos porque es parte del
// costo laboral del mes, y así suma solo en todos los reportes que ya leen PagoSueldo.
//
// 'vacaciones' es su propio tipo porque la contadora liquida las vacaciones en un
// recibo APARTE del mensual: el mismo empleado puede tener los dos en el mismo mes,
// y si no se distinguen el segundo parece un duplicado del primero.
export type TipoPagoSueldo = 'sueldo' | 'vacaciones' | 'adelanto' | 'aguinaldo' | 'extra' | 'cargas'

// Los tipos que sí son un pago a una persona de la nómina (el form de carga manual
// y el agrupado por empleado usan estos; 'cargas' va aparte).
export const TIPOS_PAGO_EMPLEADO: TipoPagoSueldo[] = ['sueldo', 'vacaciones', 'adelanto', 'aguinaldo', 'extra']

export type MedioPagoSueldo = 'efectivo' | 'transferencia'

// Un renglón del recibo de sueldo (lo lee la IA desde la foto del recibo).
export interface ReciboLinea {
  descripcion: string       // "Sueldo básico", "Antigüedad", "Jubilación", "Cuota sindical"…
  tipo: 'haber' | 'haber_nr' | 'deduccion'
  importe: number           // siempre positivo; el signo lo da `tipo`
}

export interface PagoSueldo {
  id: string
  empleadoId: string
  empleadoNombre: string // snapshot: si después se renombra/borra el empleado, el pago lo conserva
  mes: string // YYYY-MM
  tipo: TipoPagoSueldo
  monto: number
  fecha: string // YYYY-MM-DD
  medio: MedioPagoSueldo
  notas?: string
  reciboUrl?: string // archivo en Supabase Storage
  reciboNombre?: string
  desglose?: ReciboLinea[] // renglones del recibo leídos por IA (haberes/deducciones)
  bruto?: number           // total remunerativo del recibo, si la IA lo detectó
  cuil?: string            // CUIL leído del recibo
  // Solo para tipo 'cargas': el período fiscal que cancela el VEP (YYYY-MM). Es
  // distinto de `mes`: las cargas de junio se pagan en julio, y el gasto pesa en
  // JULIO (mes en que sale la plata), pero el período dice a qué mes corresponden.
  periodo?: string
  vepNro?: string          // número de VEP del comprobante
  createdBy?: string
  createdAt?: string
}

export const TIPO_PAGO_SUELDO_LABELS: Record<TipoPagoSueldo, string> = {
  sueldo: 'Sueldo',
  vacaciones: 'Vacaciones',
  adelanto: 'Adelanto',
  aguinaldo: 'Aguinaldo',
  extra: 'Extra',
  cargas: 'Cargas sociales',
}

// --- Lavadero (ropa blanca ALQUILADA, lavado tercerizado) ---
// La ropa no es del hotel: el lavadero alquila sábanas/fundas/pie de baño y la
// lava, en CUENTA CORRIENTE. Cada pedido/entrega va con REMITO: el original se
// lo queda el lavadero y la COPIA la gobernanta (eso es lo que se carga acá).
// A fin de quincena el lavadero manda la LIQUIDACIÓN de los remitos originales,
// que debe coincidir con las copias. Se paga en efectivo de la caja fuerte
// (a veces dos quincenas juntas, a 30 días).

// envio_sucia = retiro (remito) · recibo_limpia = la devolución de un retiro
// (no hay remito de limpia: Roxana cuenta al recibir) · cambio = canje 1 a 1
// de ropa manchada/rota del hotel por nueva del lavadero (no altera balance).
export type TipoMovLavadero = 'envio_sucia' | 'recibo_limpia' | 'cambio'

export interface LavaderoPrenda {
  prenda: string            // "Sábana", "Funda de almohada", "Pie de baño"…
  cantidad: number
}

// Un remito del lavadero (la copia de la gobernanta).
export interface LavaderoMovimiento {
  id: string
  fecha: string             // YYYY-MM-DD
  tipo: TipoMovLavadero
  prendas: LavaderoPrenda[]
  remito?: string           // nro de remito (clave para cruzar con la liquidación)
  retiroId?: string         // en recibo_limpia: id del retiro que se está devolviendo
  notas?: string
  createdBy: string
  createdAt: string         // ISO
}

// Liquidación quincenal del lavadero: lista los remitos ORIGINALES del período
// y el total a pagar. Queda en cuenta corriente hasta marcarla pagada.
export interface LavaderoLiquidacion {
  id: string
  nro?: string              // nro impreso de la liquidación (ej. "0025355")
  desde: string             // YYYY-MM-DD (inicio del período que liquida el lavadero)
  hasta: string             // YYYY-MM-DD (fin del período)
  total: number
  remitos: string[]         // nros de remito que lista la liquidación
  detalle?: LavaderoPrenda[] // cantidades por prenda que factura (para cruzar contra las copias)
  pagada: boolean
  fechaPago?: string        // YYYY-MM-DD (sale en efectivo de la caja fuerte)
  notas?: string
  createdBy: string
  createdAt: string         // ISO
}

// --- Grupos (contingentes que cobra el dueño POR FUERA de la caja) ---
// El dueño cobra los grupos él mismo (seña + saldo) y lo lleva en un Excel
// propio. Esa plata no pasa por la caja del PMS: sin esto el sistema no ve ni
// el ingreso comprometido ni lo que falta cobrar, y cuando el grupo se aloja
// sus habitaciones aparecen en el parte sin cobro en ninguna caja.
export interface Grupo {
  id: string
  nombre: string
  facturaPct: number        // qué parte se factura (0, 50, 100)
  ingreso: string           // YYYY-MM-DD (entrada del grupo)
  egreso: string            // YYYY-MM-DD (salida)
  noches: number
  plazasDoble: number       // personas en base doble
  precioDoble: number       // por persona por noche
  plazasSingle: number
  precioSingle: number
  total: number
  pagos: number[]           // señas y pagos parciales ya cobrados
  saldo: number             // total - pagos (negativo = pagó de más)
  importedBy: string
  importedAt: string        // ISO
  sourceFileName?: string
}
