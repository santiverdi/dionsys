import type { DepositoItem } from '../types'
import { depositoItemSupplier } from '../data/mock'

/**
 * Resuelve el proveedor de un item: primero el override del item (supplierId),
 * después el mapeo estático histórico. Devuelve '' si no hay ninguno.
 */
export function resolveSupplierId(
  itemId: string,
  items: Pick<DepositoItem, 'id' | 'supplierId'>[],
): string {
  const item = items.find(i => i.id === itemId)
  return item?.supplierId ?? depositoItemSupplier[itemId] ?? ''
}

/** Cuántas unidades de consumo trae una unidad de compra. Default 1 (se compra y consume igual). */
export function getPackSize(item: Pick<DepositoItem, 'packSize'>): number {
  return item.packSize && item.packSize > 0 ? item.packSize : 1
}

/** Unidad en la que se PIDE y RECIBE el item (bolsa/caja). Cae a la unidad de consumo si no hay formato de compra. */
export function getOrderUnit(item: Pick<DepositoItem, 'unit' | 'packUnit'>): string {
  return item.packUnit?.trim() ? item.packUnit : item.unit
}

/** ¿El item tiene un formato de compra distinto a la unidad de consumo? */
export function hasPack(item: Pick<DepositoItem, 'packUnit' | 'packSize'>): boolean {
  return !!item.packUnit?.trim() && getPackSize(item) > 1
}

/** Convierte una cantidad en unidad de compra (packs) a unidad de consumo (base). */
export function packsToBase(packs: number, packSize?: number): number {
  return +(packs * (packSize && packSize > 0 ? packSize : 1)).toFixed(2)
}

/** Packs necesarios para cubrir el faltante hasta el stock ideal (redondea hacia arriba). */
export function packsToReachIdeal(stock: number, stockIdeal: number, packSize?: number): number {
  const gap = stockIdeal - stock
  if (gap <= 0) return 0
  const size = packSize && packSize > 0 ? packSize : 1
  return Math.ceil(gap / size)
}

/**
 * Etiqueta corta del formato de compra para mostrar al usuario.
 * Ej: { packUnit: 'bolsa', packSize: 10, unit: 'kg' } -> "bolsa de 10 kg"
 */
export function packLabel(item: Pick<DepositoItem, 'unit' | 'packUnit' | 'packSize'>): string | null {
  if (!hasPack(item)) return null
  return `${item.packUnit} de ${getPackSize(item)} ${item.unit}`
}
