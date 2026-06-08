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
