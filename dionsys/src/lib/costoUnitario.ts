// Cuánto cuesta una unidad de cada producto del depósito, sacado de lo que YA se
// carga: la factura del proveedor dentro del pedido semanal.
//
// POR QUÉ SE PUEDE SIN CARGA NUEVA: un pedido ya guarda, por renglón, el `itemId`
// del producto, cuánto se RECIBIÓ (en bolsas/cajas) y el `packSize` para pasarlo
// a unidad de consumo. Al lado, en el mismo pedido, está la factura de cada
// proveedor. Entonces no hay que adivinar contra los 60 productos del depósito:
// los candidatos de una factura son SOLO los productos que ese proveedor trajo
// en ESE pedido, que son un puñado.
//
// DE DÓNDE SALE EL PRECIO (en orden de confianza):
//   1. proveedor con UN SOLO producto en el pedido → monto ÷ recibido. Exacto,
//      sin matcheo de texto posible de por medio.
//   2. renglón de la factura que matchea con UN SOLO producto candidato →
//      importe del renglón ÷ recibido de ese producto.
//   Todo lo demás queda SIN COSTEAR y se informa. Nunca se estima ni se reparte
//   un monto entre productos "a ojo": un costo inventado es peor que ninguno,
//   porque no se nota.
//
// POR QUÉ SE DIVIDE POR LA ENTRADA AL DEPÓSITO Y NO POR LA CANTIDAD DE LA
// FACTURA: la factura viene en la unidad del proveedor ("2 bolsones", "24 u.")
// y no hay forma confiable de traducirla. La ENTRADA sí es firme: es el
// movimiento que se generó al recibir el pedido, ya convertido a unidad de
// consumo con el packSize que regía en ese momento. Si el proveedor facturó
// algo que no llegó, el precio sale alto — y está bien: pagaste eso por lo que
// entró al depósito.
//
// USAR LA ENTRADA Y NO EL `recibido` DEL PEDIDO NO ES UN DETALLE: el `recibido`
// está en bolsas/cajas y hay que multiplicarlo por el packSize de HOY, que pudo
// cambiar después (los items se migran y se corrigen). La entrada ya guarda la
// cantidad en unidad de consumo tal como fue, así que no se distorsiona con el
// tiempo. El `recibido` queda solo de respaldo para los pedidos que se cerraron
// sin generar movimientos (`cerradoSinStock`: la mercadería se había cargado a
// mano).

import type { PedidoSemanal, DepositoItem, FacturaProveedor, StockMovement } from '../types'
import { resolveSupplierId, getPackSize } from '../utils/deposito'

export interface PrecioItem {
  itemId: string
  nombre: string
  unidad: string                  // unidad de CONSUMO (kg, unidad, caja…)
  precioPorUnidad: number         // $ por unidad de consumo
  fecha: string                   // fecha de la factura de la que salió
  origen: 'proveedor-un-producto' | 'renglon-de-factura'
  proveedor: string
  pedidoId: string
}

export interface SinCostear {
  proveedor: string
  monto: number
  motivo: 'sin factura' | 'sin renglones que matcheen' | 'sin recibir'
  pedidoId: string
  fecha: string
}

export interface CosteoDeposito {
  precios: Map<string, PrecioItem>   // itemId → precio MÁS RECIENTE
  sinCostear: SinCostear[]
  montoCosteado: number              // plata de facturas que se pudo bajar a productos
  montoSinCostear: number
  itemsCosteados: number
}

// Normaliza para comparar nombres: sin acentos, sin plurales obvios, sin ruido.
function norm(s: string): string {
  return (s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Palabras útiles de un nombre (descarta las cortas y los formatos de envase).
const RUIDO = new Set(['DE', 'LA', 'EL', 'X', 'U', 'UN', 'KG', 'GR', 'G', 'LT', 'L', 'ML', 'CC', 'CAJA', 'BOLSA', 'PACK', 'UNID', 'UNIDAD', 'UNIDADES'])
function tokens(s: string): string[] {
  return norm(s).split(' ').filter(t => t.length > 2 && !RUIDO.has(t))
}

// ¿El renglón de la factura habla de este producto? Alcanza con que compartan
// una palabra significativa; la ambigüedad se resuelve afuera exigiendo que el
// renglón matchee con UN SOLO candidato.
function matchea(descripcion: string, nombreItem: string): boolean {
  const a = tokens(descripcion)
  const b = tokens(nombreItem)
  if (!a.length || !b.length) return false
  return b.some(t => a.includes(t))
}

interface Candidato {
  itemId: string
  nombre: string
  unidad: string
  cantidad: number       // lo que ENTRÓ al depósito, en unidad de consumo
  desdeEntrada: boolean  // true = del movimiento real; false = estimado del pedido
}

function candidatosDe(
  pedido: PedidoSemanal,
  factura: FacturaProveedor,
  items: DepositoItem[],
  movements: StockMovement[],
): Candidato[] {
  const delProveedor = (itemId: string) => resolveSupplierId(itemId, items) === factura.supplierId
  const datosDe = (itemId: string) => items.find(i => i.id === itemId)

  // Lo que realmente entró al depósito por este pedido. Es la fuente preferida:
  // ya está en unidad de consumo y no se recalcula con el packSize de hoy.
  const entradas = new Map<string, number>()
  for (const m of movements) {
    if (m.type !== 'entrada' || m.pedidoId !== pedido.id) continue
    if (!delProveedor(m.itemId)) continue
    entradas.set(m.itemId, (entradas.get(m.itemId) ?? 0) + m.quantity)
  }
  if (entradas.size > 0) {
    return [...entradas.entries()]
      .filter(([, cantidad]) => cantidad > 0)
      .map(([itemId, cantidad]) => {
        const item = datosDe(itemId)
        const enPedido = pedido.items.find(it => it.itemId === itemId)
        return {
          itemId,
          nombre: item?.name || enPedido?.name || '',
          unidad: item?.unit ?? enPedido?.unit ?? '',
          cantidad,
          desdeEntrada: true,
        }
      })
  }

  // Respaldo: el pedido se cerró sin generar movimientos (la mercadería ya se
  // había cargado a mano). Se reconstruye desde lo recibido, que está en unidad
  // de compra y hay que convertir.
  return pedido.items
    .filter(it => delProveedor(it.itemId))
    .map(it => {
      const item = datosDe(it.itemId)
      const packs = it.recibido ?? it.aPedir ?? 0
      const packSize = it.packSize && it.packSize > 0 ? it.packSize : (item ? getPackSize(item) : 1)
      return {
        itemId: it.itemId,
        nombre: it.name || item?.name || '',
        unidad: item?.unit ?? it.unit,
        cantidad: packs * packSize,
        desdeEntrada: false,
      }
    })
    .filter(c => c.cantidad > 0)
}

export function getCosteoDeposito(
  pedidos: PedidoSemanal[],
  items: DepositoItem[],
  movements: StockMovement[] = [],
): CosteoDeposito {
  const precios = new Map<string, PrecioItem>()
  const sinCostear: SinCostear[] = []
  let montoCosteado = 0, montoSinCostear = 0

  // Guarda el precio solo si es más nuevo que el que ya había para ese producto.
  const guardar = (p: PrecioItem) => {
    const previo = precios.get(p.itemId)
    if (!previo || p.fecha.localeCompare(previo.fecha) >= 0) precios.set(p.itemId, p)
  }

  for (const pedido of [...pedidos].sort((a, b) => a.date.localeCompare(b.date))) {
    if (pedido.status === 'borrado') continue
    for (const f of pedido.facturas ?? []) {
      const fecha = f.fecha || pedido.date.slice(0, 10)
      const cands = candidatosDe(pedido, f, items, movements)

      if (cands.length === 0) {
        sinCostear.push({ proveedor: f.supplierName, monto: f.monto, motivo: 'sin recibir', pedidoId: pedido.id, fecha })
        montoSinCostear += f.monto
        continue
      }

      // 1) Un solo producto de ese proveedor: el monto entero es de ese producto.
      if (cands.length === 1) {
        const c = cands[0]
        guardar({
          itemId: c.itemId, nombre: c.nombre, unidad: c.unidad,
          precioPorUnidad: f.monto / c.cantidad,
          fecha, origen: 'proveedor-un-producto', proveedor: f.supplierName, pedidoId: pedido.id,
        })
        montoCosteado += f.monto
        continue
      }

      // 2) Varios productos: hay que apoyarse en los renglones de la factura.
      const renglones = (f.items ?? []).filter(l => l.concepto !== 'impuesto' && l.importe > 0)
      if (renglones.length === 0) {
        sinCostear.push({ proveedor: f.supplierName, monto: f.monto, motivo: 'sin factura', pedidoId: pedido.id, fecha })
        montoSinCostear += f.monto
        continue
      }

      let costeadoAca = 0
      for (const linea of renglones) {
        const matches = cands.filter(c => matchea(linea.descripcion, c.nombre))
        // Solo se acepta el match inequívoco: un renglón, un producto.
        if (matches.length !== 1) continue
        const c = matches[0]
        guardar({
          itemId: c.itemId, nombre: c.nombre, unidad: c.unidad,
          precioPorUnidad: linea.importe / c.cantidad,
          fecha, origen: 'renglon-de-factura', proveedor: f.supplierName, pedidoId: pedido.id,
        })
        costeadoAca += linea.importe
      }

      montoCosteado += costeadoAca
      const resto = f.monto - costeadoAca
      if (resto > 0.5) {
        sinCostear.push({ proveedor: f.supplierName, monto: resto, motivo: 'sin renglones que matcheen', pedidoId: pedido.id, fecha })
        montoSinCostear += resto
      }
    }
  }

  return {
    precios,
    sinCostear: sinCostear.sort((a, b) => b.monto - a.monto),
    montoCosteado: Math.round(montoCosteado * 100) / 100,
    montoSinCostear: Math.round(montoSinCostear * 100) / 100,
    itemsCosteados: precios.size,
  }
}
