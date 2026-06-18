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

// --- Impuestos y Servicios ---

export type FrecuenciaVto = 'mensual' | 'anual'

export interface ImpuestoServicio {
  id: string
  nombre: string
  nroCuenta: string
  urlPago: string
  frecuencia: FrecuenciaVto
  diaVto: number // dia del mes del vencimiento
  observaciones: string
}

export interface PagoMensual {
  id: string
  impuestoId: string
  mes: string // YYYY-MM
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
