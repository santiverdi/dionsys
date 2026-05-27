export interface ValidationResult<T = unknown> {
  ok: boolean
  value?: T
  error?: string
}

/**
 * Acepta formatos: "1234", "1234.56", "1234,56", "1.234,56", "1.234.567"
 * Rechaza: vacío, negativo, cero, NaN, > 999.999.999
 */
export function validateMonto(input: string): ValidationResult<number> {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, error: 'Ingresá un monto' }

  let normalized: string
  if (trimmed.includes(',')) {
    normalized = trimmed.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(trimmed)) {
    normalized = trimmed.replace(/\./g, '')
  } else {
    normalized = trimmed
  }

  const n = parseFloat(normalized)
  if (isNaN(n)) return { ok: false, error: 'Monto inválido' }
  if (n <= 0) return { ok: false, error: 'El monto debe ser mayor a 0' }
  if (n > 999_999_999) return { ok: false, error: 'Monto demasiado grande' }
  return { ok: true, value: Math.round(n * 100) / 100 }
}

export function validateCantidad(input: number | string, opts: { allowZero?: boolean } = {}): ValidationResult<number> {
  const n = typeof input === 'string' ? parseFloat(input.replace(',', '.')) : input
  if (isNaN(n)) return { ok: false, error: 'Cantidad inválida' }
  if (!isFinite(n)) return { ok: false, error: 'Cantidad inválida' }
  if (n < 0) return { ok: false, error: 'No puede ser negativa' }
  if (n === 0 && !opts.allowZero) return { ok: false, error: 'Debe ser mayor a 0' }
  if (n > 10_000) return { ok: false, error: 'Cantidad demasiado grande' }
  return { ok: true, value: n }
}

export function validateGuests(input: number, maxGuests = 200): ValidationResult<number> {
  if (typeof input !== 'number' || isNaN(input)) return { ok: false, error: 'Número inválido' }
  if (input < 0) return { ok: false, error: 'No puede ser negativo' }
  if (input > maxGuests) return { ok: false, error: `Máximo ${maxGuests} huéspedes` }
  return { ok: true, value: Math.floor(input) }
}

export function validateRooms(input: number, capacity = 53): ValidationResult<number> {
  if (typeof input !== 'number' || isNaN(input)) return { ok: false, error: 'Número inválido' }
  if (input < 0) return { ok: false, error: 'No puede ser negativo' }
  if (input > capacity) return { ok: false, error: `Máximo ${capacity} habitaciones` }
  return { ok: true, value: Math.floor(input) }
}

export function validatePin(input: string): ValidationResult<string> {
  const trimmed = input.trim()
  if (!trimmed) return { ok: false, error: 'Ingresá el PIN' }
  if (!/^\d{4}$/.test(trimmed)) return { ok: false, error: 'El PIN debe tener 4 dígitos' }
  return { ok: true, value: trimmed }
}

export function formatMonto(n: number): string {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function formatMontoCurrency(n: number): string {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 2 })
}
