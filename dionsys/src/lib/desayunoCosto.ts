// Qué gasta el desayuno solo, y cuánto consume cada huésped.
//
// Cruza tres cosas que hasta ahora vivían separadas:
//   - las COMPRAS (recepción diaria de panadería y lácteos + lo que se paga de
//     los proveedores de desayunador en el pedido semanal)
//   - las SALIDAS del depósito de los productos de desayunador (lo que
//     realmente se consumió, en unidades)
//   - los DESAYUNOS servidos, que salen de los partes de la noche (la gente que
//     durmió es la que desayuna: misma regla que desayuno.ts)
//
// QUÉ CUENTA COMO DESAYUNO (regla del sistema, decidida con el usuario):
//   - recepción diaria de panadería y lácteos: 100% desayuno
//   - productos del depósito con categoría 'desayunador'
//   - la VERDULERÍA queda AFUERA y se informa aparte: se compra por recepción
//     igual que el pan, pero no es desayuno. Si algún día lo fuera, se suma acá.
//
// LO QUE ESTO NO ES: no es un costeo por producto. La plata vive a nivel de
// factura (por proveedor) y el consumo a nivel de movimiento (por producto), y
// no hay precio unitario cargado en ningún lado. Entonces:
//   - la plata del mes son COMPRAS del mes, no el costo de lo consumido
//   - el consumo por huésped va en UNIDADES, no en pesos
// Mezclar las dos cosas daría un número inventado. Si algún mes se compra de más
// para stockear, el gasto sube sin que suba el consumo — por eso se muestran las
// entradas y las salidas juntas: si difieren mucho, el gasto no es consumo.

import type {
  Order, PedidoSemanal, StockMovement, DepositoItem, DepositoSupplier, ParteHabitaciones,
} from '../types'
import type { PrecioItem } from './costoUnitario'
import { partesNochePorDia } from './desayuno'
import { isInMonth, monthKey } from '../utils/dateRange'

// Los ids que usa la recepción diaria al crear la orden: 'panaderia' y
// 'lacteos' son desayuno; 'verduleria' no (PanaderiaCalc, LacteosOrder,
// VerduleriaOrder los escriben así).
const RECEPCION = { panaderia: 'panaderia', lacteos: 'lacteos', verduleria: 'verduleria' } as const

export interface ConsumoItem {
  item: string
  unidad: string
  salidas: number        // consumido del depósito en el mes
  entradas: number       // repuesto en el mes
  porHuesped: number     // salidas ÷ desayunos servidos
  porCada100: number     // lo mismo pero por cada 100 huéspedes (más legible)
  // Valorización: solo si el producto tiene precio derivado de una factura
  // (ver costoUnitario.ts). Sin precio quedan en undefined — nunca estimado.
  precioUnitario?: number
  precioFecha?: string
  costo?: number         // salidas × precio: lo que costó lo que se consumió
}

export interface CostoDesayuno {
  desayunos: number          // huéspedes que desayunaron en el mes (suma de los partes noche)
  nochesMedidas: number      // noches del mes con parte cargado
  compras: {
    panaderia: number
    lacteos: number
    deposito: number         // proveedores de desayunador del pedido semanal
    total: number
  }
  costoPorHuesped: number    // compras.total ÷ desayunos
  verduleria: number         // aparte: NO cuenta como desayuno
  sinClasificar: number      // plata de pedidos que no se pudo asignar a un rubro
  consumo: ConsumoItem[]     // por producto, de mayor a menor salida
  totalEntradas: number
  totalSalidas: number
  // Costo de lo CONSUMIDO (≠ compras del mes). Solo suma los productos con
  // precio conocido; los que no lo tienen se cuentan aparte para que se vea
  // cuánto del consumo todavía no está costeado.
  costoConsumido: number
  costoConsumidoPorHuesped: number
  productosCosteados: number
  productosSinCostear: number
}

const round = (n: number) => Math.round(n * 100) / 100
const round3 = (n: number) => Math.round(n * 1000) / 1000

// Un proveedor es de desayuno si su categoría lo dice. Sin categoría no se
// adivina: cae en "sin clasificar" y queda a la vista.
function esProveedorDesayuno(s?: DepositoSupplier): boolean | undefined {
  if (!s?.category) return undefined
  const c = s.category.toLowerCase()
  if (c.includes('desayun')) return true
  if (c.includes('limpie')) return false
  return undefined
}

export interface DesayunoInputs {
  orders: Order[]
  pedidos: PedidoSemanal[]
  movements: StockMovement[]
  items: DepositoItem[]
  suppliers: DepositoSupplier[]
  partes: ParteHabitaciones[]
  // Precios por unidad de consumo, derivados de las facturas de los pedidos
  // (getCosteoDeposito). Sin esto el consumo se muestra solo en unidades.
  precios?: Map<string, PrecioItem>
}

export function getCostoDesayuno(year: number, month: number, d: DesayunoInputs): CostoDesayuno {
  // --- Cuánta gente desayunó ---
  const mes = monthKey(year, month)
  let desayunos = 0, nochesMedidas = 0
  for (const [dia, parte] of partesNochePorDia(d.partes)) {
    if (dia.slice(0, 7) !== mes) continue
    nochesMedidas++
    desayunos += parte.totalPlazas || parte.ocupadas.reduce((s, o) => s + o.plazas, 0)
  }

  // --- Compras del mes ---
  let panaderia = 0, lacteos = 0, verduleria = 0, deposito = 0, sinClasificar = 0

  for (const o of d.orders) {
    if (o.status === 'borrado' || o.monto == null) continue
    if (!isInMonth(o.createdAt, year, month)) continue
    const id = (o.distributorId || '').toLowerCase()

    if (o.type === 'recepcion') {
      if (id.includes(RECEPCION.panaderia)) panaderia += o.monto
      else if (id.includes(RECEPCION.lacteos)) lacteos += o.monto
      else if (id.includes(RECEPCION.verduleria)) verduleria += o.monto
      else sinClasificar += o.monto
      continue
    }
    // Orden a distribuidora: se clasifica por la categoría del proveedor.
    const esDesayuno = esProveedorDesayuno(d.suppliers.find(s => s.id === o.distributorId))
    if (esDesayuno === true) deposito += o.monto
    else if (esDesayuno === undefined) sinClasificar += o.monto
  }

  for (const p of d.pedidos) {
    if (p.status === 'borrado') continue
    if (!isInMonth(p.date, year, month)) continue
    // Con facturas por proveedor se puede separar qué parte es de desayunador.
    if (p.facturas?.length) {
      for (const f of p.facturas) {
        const esDesayuno = esProveedorDesayuno(d.suppliers.find(s => s.id === f.supplierId))
        if (esDesayuno === true) deposito += f.monto
        else if (esDesayuno === undefined) sinClasificar += f.monto
      }
      continue
    }
    // Un pedido con monto pero sin facturas mezcla rubros y no se puede partir.
    if (p.monto != null) sinClasificar += p.monto
  }

  // --- Consumo del depósito (solo productos de desayunador) ---
  const porId = new Map(d.items.map(i => [i.id, i]))
  // Se agrupa por itemId (no por nombre) para poder buscarle el precio.
  const porItem = new Map<string, { nombre: string; unidad: string; salidas: number; entradas: number }>()
  let totalEntradas = 0, totalSalidas = 0

  for (const m of d.movements) {
    if (!isInMonth(m.date, year, month)) continue
    const item = porId.get(m.itemId)
    if (item?.category !== 'desayunador') continue

    const acc = porItem.get(m.itemId) ?? { nombre: item.name || m.itemName, unidad: item.unit, salidas: 0, entradas: 0 }
    if (m.type === 'salida') { acc.salidas += m.quantity; totalSalidas += m.quantity }
    else { acc.entradas += m.quantity; totalEntradas += m.quantity }
    porItem.set(m.itemId, acc)
  }

  let costoConsumido = 0, productosCosteados = 0, productosSinCostear = 0
  const consumo: ConsumoItem[] = [...porItem.entries()]
    .map(([itemId, v]) => {
      const precio = d.precios?.get(itemId)
      // Solo se valoriza lo que SALIÓ: es lo que se consumió.
      const costo = precio && v.salidas > 0 ? round(v.salidas * precio.precioPorUnidad) : undefined
      if (v.salidas > 0) {
        if (costo != null) { costoConsumido += costo; productosCosteados++ }
        else productosSinCostear++
      }
      return {
        item: v.nombre,
        unidad: v.unidad,
        salidas: round(v.salidas),
        entradas: round(v.entradas),
        porHuesped: desayunos > 0 ? round3(v.salidas / desayunos) : 0,
        porCada100: desayunos > 0 ? round((v.salidas / desayunos) * 100) : 0,
        ...(precio ? { precioUnitario: round(precio.precioPorUnidad), precioFecha: precio.fecha } : {}),
        ...(costo != null ? { costo } : {}),
      }
    })
    .sort((a, b) => b.salidas - a.salidas)

  const total = round(panaderia + lacteos + deposito)

  return {
    desayunos,
    nochesMedidas,
    compras: { panaderia: round(panaderia), lacteos: round(lacteos), deposito: round(deposito), total },
    costoPorHuesped: desayunos > 0 ? Math.round(total / desayunos) : 0,
    verduleria: round(verduleria),
    sinClasificar: round(sinClasificar),
    consumo,
    totalEntradas: round(totalEntradas),
    totalSalidas: round(totalSalidas),
    costoConsumido: round(costoConsumido),
    costoConsumidoPorHuesped: desayunos > 0 ? Math.round(costoConsumido / desayunos) : 0,
    productosCosteados,
    productosSinCostear,
  }
}
