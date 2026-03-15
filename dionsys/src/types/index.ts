export type Role = 'concierge' | 'mucama' | 'admin' | 'mantenimiento'

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
  unit: string              // "kg", "caja", "unidad", "bidon", "bolson"
  category: 'desayunador' | 'limpieza'
  stock: number             // stock actual
  stockIdeal: number        // stock ideal/deseado para reponer
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
}

export interface PedidoSemanalItem {
  itemId: string
  name: string
  unit: string
  stockActual: number
  stockIdeal: number
  aPedir: number            // quantity to order
}

export interface PedidoSemanal {
  id: string
  date: string
  createdBy: string
  items: PedidoSemanalItem[]
  status: 'enviado' | 'borrado'
  deletedAt?: string
  deletedBy?: string
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
