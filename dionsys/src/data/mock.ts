import type { Employee, Distributor, Product, ReceptionProduct, DepositoItem } from '../types'

export const employees: Employee[] = [
  { id: 'c1', name: 'Leandro', pin: '1111', role: 'concierge', active: true },
  { id: 'c2', name: 'Santiago', pin: '2222', role: 'concierge', active: true },
  { id: 'c3', name: 'Gaston', pin: '3333', role: 'concierge', active: true },
  { id: 'c4', name: 'Valentin', pin: '4444', role: 'concierge', active: true },
  { id: '2', name: 'Maria (Mucama)', pin: '5678', role: 'mucama', active: true },
  { id: '3', name: 'Laura (Admin)', pin: '0000', role: 'admin', active: true },
  { id: '4', name: 'Julio (Mantenimiento)', pin: '9898', role: 'mantenimiento', active: true },
]

export const distributors: Distributor[] = [
  { id: '1', name: 'Distribuidora Norte', phone: '5491155001234', category: 'Limpieza', notes: 'Entrega martes y jueves' },
  { id: '2', name: 'Alimentos del Sur', phone: '5491155005678', category: 'Desayunador', notes: 'Entrega lunes a viernes' },
  { id: '3', name: 'Quimicos Express', phone: '5491155009999', category: 'Limpieza', notes: 'Pedido minimo $50.000' },
  { id: '4', name: 'Lacteos San Martin', phone: '5491155008888', category: 'Desayunador', notes: 'Entrega lunes y miercoles' },
  { id: '5', name: 'Panaderia Central', phone: '5491155007777', category: 'Desayunador', notes: 'Pedir antes de las 18hs' },
]

export const products: Product[] = [
  // Distribuidora Norte - Limpieza
  { id: '1', distributorId: '1', name: 'Lavandina 5L', unit: 'bidon', active: true },
  { id: '2', distributorId: '1', name: 'Detergente 1L', unit: 'botella', active: true },
  { id: '3', distributorId: '1', name: 'Jabon tocador', unit: 'unidad', active: true },
  { id: '4', distributorId: '1', name: 'Shampoo sachet', unit: 'caja x100', active: true },
  { id: '5', distributorId: '1', name: 'Papel higienico', unit: 'bolson x48', active: true },
  { id: '6', distributorId: '1', name: 'Desodorante ambiental', unit: 'unidad', active: true },

  // Alimentos del Sur - Desayunador
  { id: '7', distributorId: '2', name: 'Cafe molido 1kg', unit: 'paquete', active: true },
  { id: '8', distributorId: '2', name: 'Te surtido x100', unit: 'caja', active: true },
  { id: '9', distributorId: '2', name: 'Azucar 1kg', unit: 'paquete', active: true },
  { id: '10', distributorId: '2', name: 'Mermelada porcion', unit: 'caja x50', active: true },
  { id: '11', distributorId: '2', name: 'Galletitas dulces', unit: 'paquete', active: true },
  { id: '12', distributorId: '2', name: 'Galletitas saladas', unit: 'paquete', active: true },

  // Quimicos Express - Limpieza
  { id: '13', distributorId: '3', name: 'Desengrasante 5L', unit: 'bidon', active: true },
  { id: '14', distributorId: '3', name: 'Limpia vidrios 1L', unit: 'botella', active: true },
  { id: '15', distributorId: '3', name: 'Cloro concentrado 5L', unit: 'bidon', active: true },
  { id: '16', distributorId: '3', name: 'Cera para pisos 5L', unit: 'bidon', active: true },

  // Lacteos San Martin - Desayunador
  { id: '17', distributorId: '4', name: 'Leche entera 1L', unit: 'sachet', active: true },
  { id: '18', distributorId: '4', name: 'Manteca 200g', unit: 'unidad', active: true },
  { id: '19', distributorId: '4', name: 'Queso crema 300g', unit: 'pote', active: true },
  { id: '20', distributorId: '4', name: 'Yogur bebible', unit: 'botella', active: true },

  // Panaderia Central - Desayunador
  { id: '21', distributorId: '5', name: 'Medialunas x12', unit: 'docena', active: true },
  { id: '22', distributorId: '5', name: 'Pan lactal', unit: 'paquete', active: true },
  { id: '23', distributorId: '5', name: 'Tortas x6', unit: 'bandeja', active: true },
  { id: '24', distributorId: '5', name: 'Budines surtidos', unit: 'unidad', active: true },
]

// --- Proveedores del Deposito (para pedido semanal) ---
export interface DepositoSupplier {
  id: string
  name: string
  phone: string
  category: string
}

export const depositoSuppliers: DepositoSupplier[] = [
  { id: 'tpg', name: 'TPG', phone: '', category: 'Desayunador' },
  { id: 'la-paulina', name: 'La Paulina', phone: '', category: 'Desayunador' },
  { id: 'la-galletera', name: 'La Galletera', phone: '', category: 'Desayunador' },
  { id: 'reposmar', name: 'Reposmar', phone: '', category: 'Desayunador' },
  { id: 'cafe-virginia', name: 'Cafe La Virginia', phone: '', category: 'Desayunador' },
  { id: 'digamar', name: 'Digamar', phone: '', category: 'Desayunador' },
  { id: 'gervasi', name: 'Gervasi', phone: '', category: 'Limpieza' },
  { id: 'luseda', name: 'Luseda', phone: '', category: 'Limpieza' },
  { id: 'quimica-dem', name: 'Quimica Dem', phone: '', category: 'Limpieza' },
  { id: 'papelera-plata', name: 'Papelera del Plata', phone: '', category: 'Limpieza/General' },
]

// Mapeo de item del deposito → proveedor
export const depositoItemSupplier: Record<string, string> = {
  // === TPG ===
  'des-1': 'tpg',       // Harina
  'des-2': 'tpg',       // Azucar
  'des-3': 'tpg',       // Jugo pomelo
  'des-4': 'tpg',       // Jugo naranja
  'des-7': 'tpg',       // Te
  'des-8': 'tpg',       // Cacao
  'des-9': 'tpg',       // Dulce de leche individual
  'des-10': 'tpg',      // Mermelada individual
  'des-11': 'tpg',      // Manteca individual (blister)
  'des-16': 'tpg',      // Te manzanilla
  'des-17': 'tpg',      // Mate cocido
  'des-18': 'tpg',      // Te hierbas
  'des-19': 'tpg',      // Te frutas rojas
  'des-20': 'tpg',      // Te boldo
  'des-21': 'tpg',      // Te verde
  'des-22': 'tpg',      // Caramelo liquido
  'des-23': 'tpg',      // Esencia de vainilla
  'des-24': 'tpg',      // Cereales s/azucar
  'des-25': 'tpg',      // Cereales de color
  'des-26': 'tpg',      // Cereales c/azucar
  'des-27': 'tpg',      // Galletas de arroz
  'des-29': 'tpg',      // Manteca pilon
  'des-30': 'tpg',      // Dulce de leche repostero
  'des-36': 'tpg',      // Gelatina
  'des-50': 'tpg',      // Te tilo
  // === Cafe La Virginia ===
  'des-5': 'cafe-virginia',  // Cafe filtro
  'des-6': 'cafe-virginia',  // Edulcorante
  // === La Paulina ===
  'des-34': 'la-paulina',    // Jamon → Paleta
  'des-35': 'la-paulina',    // Queso → Queso untable
  // === La Galletera ===
  'des-13': 'la-galletera',  // Tapitas
  'des-28': 'la-galletera',  // Biscuit
  'des-39': 'la-galletera',  // Vainillas
  'des-40': 'la-galletera',  // Solitas (sin sal)
  // === Reposmar ===
  'des-12': 'reposmar',      // Pasas de uvas
  'des-14': 'reposmar',      // Chips de chocolate
  'des-15': 'reposmar',      // Aceite
  'des-29b': 'reposmar',     // (manteca pilon is TPG, but caramelo liq also Reposmar)
  'des-31': 'reposmar',      // Coco
  'des-33': 'reposmar',      // Membrillo
  'des-37': 'reposmar',      // Azucar impalpable
  'des-38': 'reposmar',      // Mix de semillas
  // === Digamar ===
  'des-41': 'digamar',       // Platos
  'des-42': 'digamar',       // Tazas
  'des-43': 'digamar',       // Cucharitas (metal)
  'des-44': 'digamar',       // Filtros de cafe
  // === Papelera del Plata ===
  'des-32': 'papelera-plata', // Servilletas
  'des-45': 'papelera-plata', // Cucharitas plasticas
  // === Gervasi ===
  'lim-2': 'gervasi',        // Papel higienico
  'lim-4': 'gervasi',        // Jabones
  'lim-9': 'gervasi',        // Perfumina
  // === Luseda ===
  'lim-1': 'luseda',         // Shampoo
  'lim-11': 'luseda',        // Crema enjuague
  'lim-23': 'luseda',        // Shampoo/duo
  // === Quimica Dem ===
  'lim-3': 'quimica-dem',    // Trapo de piso
  'lim-5': 'quimica-dem',    // Bolsitas higienicas
  'lim-7': 'quimica-dem',    // Toallas papel baño
  'lim-8': 'quimica-dem',    // Rejillas
  'lim-10': 'quimica-dem',   // Lustra mueble
  'lim-12': 'quimica-dem',   // Quita sarro
  'lim-13': 'quimica-dem',   // Secadores de piso
  'lim-15': 'quimica-dem',   // Escobillon
  'lim-16': 'quimica-dem',   // Jabon liquido
  'lim-17': 'quimica-dem',   // Esponjas acero
  'lim-18': 'quimica-dem',   // Detergente
  'lim-19': 'quimica-dem',   // Gel (alcohol en gel)
  'lim-20': 'quimica-dem',   // Gatillos
  'lim-21': 'quimica-dem',   // Esponjas verdes (cocina)
  'lim-22': 'quimica-dem',   // Venus
  'lim-24': 'quimica-dem',   // Pala
  'lim-25': 'quimica-dem',   // Escobilla de baño
  'lim-26': 'quimica-dem',   // Esponja vegetal
  'lim-27': 'quimica-dem',   // Franelas
  'lim-28': 'quimica-dem',   // Esponjas amarillas
  'lim-29': 'quimica-dem',   // Cloro
  'lim-30': 'quimica-dem',   // Suavizante
  'lim-31': 'quimica-dem',   // Jabon lavarropas
  'lim-32': 'quimica-dem',   // Jabon en pan
  'lim-33': 'quimica-dem',   // Botellitas
  'lim-34': 'quimica-dem',   // Guantes
  'lim-35': 'quimica-dem',   // Escobas
  // === Papelera del Plata (limpieza) ===
  'lim-6': 'papelera-plata',  // Bolsa camiseta
  'lim-14': 'papelera-plata', // Bolsa consorcio
  'lim-36': 'papelera-plata', // Bolsas para vasos
}

// --- Verduleria ---
export const verduleriaSupplier = {
  name: 'Gustavo',
  phone: '5492235038181',
  notes: 'Pedido de frutas para el desayunador.',
}

export const verduleriaProducts = [
  { id: 'verd-1', name: 'Manzana roja', unit: 'kg' },
  { id: 'verd-2', name: 'Manzana verde', unit: 'kg' },
  { id: 'verd-3', name: 'Naranjas', unit: 'kg' },
]

// --- Pedidos Recepcion ---

export const receptionSuppliers = {
  panaderia: {
    name: 'Piazza',
    phone: '5492235496418',
    notes: 'No abre domingos. Sabados = pedido doble.',
  },
  lacteos: {
    name: 'El Amanecer',
    phone: '5492235491842',
    notes: 'Pedidos: Lunes, Miercoles y Viernes.',
  },
}

export const lacteosProducts: ReceptionProduct[] = [
  { id: 'lac-1', name: 'Leche entera 1L', unit: 'sachet', supplier: 'lacteos' },
  { id: 'lac-2', name: 'Yogurt frutilla', unit: 'unidad', supplier: 'lacteos' },
  { id: 'lac-3', name: 'Yogurt vainilla', unit: 'unidad', supplier: 'lacteos' },
  { id: 'lac-4', name: 'Yogurt durazno', unit: 'unidad', supplier: 'lacteos' },
  { id: 'lac-5', name: 'Horma de queso', unit: 'unidad', supplier: 'lacteos' },
  { id: 'lac-6', name: 'Paleta', unit: 'unidad', supplier: 'lacteos' },
]

// --- Deposito: Stock en tiempo real (productos reales del Excel) ---
// stock = lo que hay ahora, stockIdeal = lo que deberia haber siempre

export const depositoItems: DepositoItem[] = [
  // ===== DESAYUNADOR =====
  { id: 'des-1', name: 'Harina', unit: 'kg', category: 'desayunador', stock: 0, stockIdeal: 8 },
  { id: 'des-2', name: 'Azucar', unit: 'kg', category: 'desayunador', stock: 0, stockIdeal: 8 },
  { id: 'des-3', name: 'Jugo pomelo', unit: 'caja', category: 'desayunador', stock: 0, stockIdeal: 2 },
  { id: 'des-4', name: 'Jugo naranja', unit: 'caja', category: 'desayunador', stock: 0, stockIdeal: 2 },
  { id: 'des-5', name: 'Cafe filtro', unit: 'kg', category: 'desayunador', stock: 0, stockIdeal: 2 },
  { id: 'des-6', name: 'Edulcorante', unit: 'caja', category: 'desayunador', stock: 0, stockIdeal: 2 },
  { id: 'des-7', name: 'Te', unit: 'caja', category: 'desayunador', stock: 0, stockIdeal: 2 },
  { id: 'des-8', name: 'Cacao', unit: 'kg', category: 'desayunador', stock: 0, stockIdeal: 1 },
  { id: 'des-9', name: 'Dulce de leche individual', unit: 'caja', category: 'desayunador', stock: 0, stockIdeal: 2 },
  { id: 'des-10', name: 'Mermelada individual', unit: 'caja', category: 'desayunador', stock: 0, stockIdeal: 2 },
  { id: 'des-11', name: 'Manteca individual', unit: 'caja', category: 'desayunador', stock: 0, stockIdeal: 2 },
  { id: 'des-12', name: 'Pasas de uvas', unit: 'kg', category: 'desayunador', stock: 0, stockIdeal: 1 },
  { id: 'des-13', name: 'Tapitas', unit: 'caja', category: 'desayunador', stock: 0, stockIdeal: 1 },
  { id: 'des-14', name: 'Chips de chocolate', unit: 'kg', category: 'desayunador', stock: 0, stockIdeal: 1 },
  { id: 'des-15', name: 'Aceite', unit: 'unidad', category: 'desayunador', stock: 0, stockIdeal: 2 },
  { id: 'des-16', name: 'Te manzanilla', unit: 'caja', category: 'desayunador', stock: 0, stockIdeal: 1 },
  { id: 'des-17', name: 'Mate cocido', unit: 'caja', category: 'desayunador', stock: 0, stockIdeal: 1 },
  { id: 'des-18', name: 'Te hierbas', unit: 'caja', category: 'desayunador', stock: 0, stockIdeal: 1 },
  { id: 'des-19', name: 'Te frutas rojas', unit: 'caja', category: 'desayunador', stock: 0, stockIdeal: 1 },
  { id: 'des-20', name: 'Te boldo', unit: 'caja', category: 'desayunador', stock: 0, stockIdeal: 1 },
  { id: 'des-21', name: 'Te verde', unit: 'caja', category: 'desayunador', stock: 0, stockIdeal: 1 },
  { id: 'des-22', name: 'Caramelo liquido', unit: 'unidad', category: 'desayunador', stock: 0, stockIdeal: 1 },
  { id: 'des-23', name: 'Esencia de vainilla', unit: 'unidad', category: 'desayunador', stock: 0, stockIdeal: 1 },
  { id: 'des-24', name: 'Cereales s/azucar', unit: 'unidad', category: 'desayunador', stock: 0, stockIdeal: 2 },
  { id: 'des-25', name: 'Cereales de color', unit: 'unidad', category: 'desayunador', stock: 0, stockIdeal: 2 },
  { id: 'des-26', name: 'Cereales c/azucar', unit: 'unidad', category: 'desayunador', stock: 0, stockIdeal: 2 },
  { id: 'des-27', name: 'Galletas de arroz', unit: 'caja', category: 'desayunador', stock: 0, stockIdeal: 2 },
  { id: 'des-28', name: 'Biscuit', unit: 'caja', category: 'desayunador', stock: 0, stockIdeal: 1 },
  { id: 'des-29', name: 'Manteca pilon', unit: 'kg', category: 'desayunador', stock: 0, stockIdeal: 1 },
  { id: 'des-30', name: 'Dulce de leche repostero', unit: 'kg', category: 'desayunador', stock: 0, stockIdeal: 1 },
  { id: 'des-31', name: 'Coco', unit: 'kg', category: 'desayunador', stock: 0, stockIdeal: 1 },
  { id: 'des-32', name: 'Servilletas', unit: 'caja', category: 'desayunador', stock: 0, stockIdeal: 4 },
  { id: 'des-33', name: 'Membrillo', unit: 'kg', category: 'desayunador', stock: 0, stockIdeal: 1 },
  { id: 'des-34', name: 'Jamon', unit: 'unidad', category: 'desayunador', stock: 0, stockIdeal: 1 },
  { id: 'des-35', name: 'Queso', unit: 'unidad', category: 'desayunador', stock: 0, stockIdeal: 1 },
  { id: 'des-36', name: 'Gelatina', unit: 'caja', category: 'desayunador', stock: 0, stockIdeal: 1 },
  { id: 'des-37', name: 'Azucar impalpable', unit: 'kg', category: 'desayunador', stock: 0, stockIdeal: 1 },
  { id: 'des-38', name: 'Mix de semillas', unit: 'kg', category: 'desayunador', stock: 0, stockIdeal: 1 },
  { id: 'des-39', name: 'Vainillas', unit: 'paquete', category: 'desayunador', stock: 0, stockIdeal: 1 },
  { id: 'des-40', name: 'Solitas (sin sal)', unit: 'paquete', category: 'desayunador', stock: 0, stockIdeal: 1 },
  { id: 'des-41', name: 'Platos', unit: 'unidad', category: 'desayunador', stock: 0, stockIdeal: 2 },
  { id: 'des-42', name: 'Tazas', unit: 'unidad', category: 'desayunador', stock: 0, stockIdeal: 2 },
  { id: 'des-43', name: 'Cucharitas (metal)', unit: 'unidad', category: 'desayunador', stock: 0, stockIdeal: 2 },
  { id: 'des-44', name: 'Filtros de cafe', unit: 'caja', category: 'desayunador', stock: 0, stockIdeal: 2 },
  { id: 'des-45', name: 'Cucharitas plasticas', unit: 'paquete', category: 'desayunador', stock: 0, stockIdeal: 1 },
  { id: 'des-50', name: 'Te tilo', unit: 'caja', category: 'desayunador', stock: 0, stockIdeal: 1 },

  // ===== LIMPIEZA =====
  { id: 'lim-1', name: 'Shampoo', unit: 'caja', category: 'limpieza', stock: 0, stockIdeal: 2 },
  { id: 'lim-2', name: 'Papel higienico', unit: 'bolson', category: 'limpieza', stock: 0, stockIdeal: 4 },
  { id: 'lim-3', name: 'Trapo de piso', unit: 'unidad', category: 'limpieza', stock: 0, stockIdeal: 6 },
  { id: 'lim-4', name: 'Jabones', unit: 'caja', category: 'limpieza', stock: 0, stockIdeal: 4 },
  { id: 'lim-5', name: 'Bolsitas higienicas', unit: 'paquete', category: 'limpieza', stock: 0, stockIdeal: 2 },
  { id: 'lim-6', name: 'Bolsa camiseta', unit: 'bolson', category: 'limpieza', stock: 0, stockIdeal: 10 },
  { id: 'lim-7', name: 'Toallas papel baño', unit: 'paquete', category: 'limpieza', stock: 0, stockIdeal: 2 },
  { id: 'lim-8', name: 'Rejillas', unit: 'unidad', category: 'limpieza', stock: 0, stockIdeal: 3 },
  { id: 'lim-9', name: 'Perfumina', unit: 'unidad', category: 'limpieza', stock: 0, stockIdeal: 2 },
  { id: 'lim-10', name: 'Lustra mueble', unit: 'unidad', category: 'limpieza', stock: 0, stockIdeal: 1 },
  { id: 'lim-11', name: 'Crema enjuague', unit: 'caja', category: 'limpieza', stock: 0, stockIdeal: 1 },
  { id: 'lim-12', name: 'Quita sarro', unit: 'unidad', category: 'limpieza', stock: 0, stockIdeal: 2 },
  { id: 'lim-13', name: 'Secadores de piso', unit: 'unidad', category: 'limpieza', stock: 0, stockIdeal: 2 },
  { id: 'lim-14', name: 'Bolsa consorcio', unit: 'unidad', category: 'limpieza', stock: 0, stockIdeal: 2 },
  { id: 'lim-15', name: 'Escobillon', unit: 'unidad', category: 'limpieza', stock: 0, stockIdeal: 2 },
  { id: 'lim-16', name: 'Jabon liquido', unit: 'unidad', category: 'limpieza', stock: 0, stockIdeal: 2 },
  { id: 'lim-17', name: 'Esponjas acero', unit: 'unidad', category: 'limpieza', stock: 0, stockIdeal: 2 },
  { id: 'lim-18', name: 'Detergente', unit: 'unidad', category: 'limpieza', stock: 0, stockIdeal: 3 },
  { id: 'lim-19', name: 'Gel', unit: 'unidad', category: 'limpieza', stock: 0, stockIdeal: 2 },
  { id: 'lim-20', name: 'Gatillos', unit: 'unidad', category: 'limpieza', stock: 0, stockIdeal: 3 },
  { id: 'lim-21', name: 'Esponjas verdes (cocina)', unit: 'unidad', category: 'limpieza', stock: 0, stockIdeal: 4 },
  { id: 'lim-22', name: 'Venus', unit: 'unidad', category: 'limpieza', stock: 0, stockIdeal: 2 },
  { id: 'lim-23', name: 'Shampoo/duo', unit: 'unidad', category: 'limpieza', stock: 0, stockIdeal: 2 },
  { id: 'lim-24', name: 'Pala', unit: 'unidad', category: 'limpieza', stock: 0, stockIdeal: 1 },
  { id: 'lim-25', name: 'Escobilla de baño', unit: 'unidad', category: 'limpieza', stock: 0, stockIdeal: 3 },
  { id: 'lim-26', name: 'Esponja vegetal', unit: 'unidad', category: 'limpieza', stock: 0, stockIdeal: 2 },
  { id: 'lim-27', name: 'Franelas', unit: 'unidad', category: 'limpieza', stock: 0, stockIdeal: 4 },
  { id: 'lim-28', name: 'Esponjas amarillas x12', unit: 'paquete', category: 'limpieza', stock: 0, stockIdeal: 1 },
  { id: 'lim-29', name: 'Cloro x5L', unit: 'bidon', category: 'limpieza', stock: 0, stockIdeal: 2 },
  { id: 'lim-30', name: 'Suavizante', unit: 'unidad', category: 'limpieza', stock: 0, stockIdeal: 1 },
  { id: 'lim-31', name: 'Jabon lavarropas', unit: 'unidad', category: 'limpieza', stock: 0, stockIdeal: 1 },
  { id: 'lim-32', name: 'Jabon en pan', unit: 'unidad', category: 'limpieza', stock: 0, stockIdeal: 2 },
  { id: 'lim-33', name: 'Botellitas', unit: 'unidad', category: 'limpieza', stock: 0, stockIdeal: 2 },
  { id: 'lim-34', name: 'Guantes', unit: 'par', category: 'limpieza', stock: 0, stockIdeal: 3 },
  { id: 'lim-35', name: 'Escobas', unit: 'unidad', category: 'limpieza', stock: 0, stockIdeal: 2 },
  { id: 'lim-36', name: 'Bolsas para vasos', unit: 'paquete', category: 'limpieza', stock: 0, stockIdeal: 1 },
]
