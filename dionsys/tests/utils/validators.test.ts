import { describe, it, expect } from 'vitest'
import {
  validateMonto, validateCantidad, validateGuests, validateRooms, validatePin,
  formatMonto, formatMontoCurrency,
} from '../../src/utils/validators'

describe('validateMonto', () => {
  it('acepta números enteros simples', () => {
    expect(validateMonto('1234')).toEqual({ ok: true, value: 1234 })
  })
  it('acepta formato argentino con miles y decimales', () => {
    expect(validateMonto('1.234,56')).toEqual({ ok: true, value: 1234.56 })
  })
  it('acepta formato argentino con solo miles', () => {
    expect(validateMonto('1.234.567')).toEqual({ ok: true, value: 1234567 })
  })
  it('acepta formato con punto decimal estilo US', () => {
    expect(validateMonto('1234.56')).toEqual({ ok: true, value: 1234.56 })
  })
  it('acepta coma decimal sin miles', () => {
    expect(validateMonto('1234,56')).toEqual({ ok: true, value: 1234.56 })
  })
  it('rechaza vacío', () => {
    expect(validateMonto('')).toMatchObject({ ok: false })
    expect(validateMonto('   ')).toMatchObject({ ok: false })
  })
  it('rechaza cero y negativos', () => {
    expect(validateMonto('0')).toMatchObject({ ok: false })
    expect(validateMonto('-100')).toMatchObject({ ok: false })
  })
  it('rechaza texto inválido', () => {
    expect(validateMonto('abc')).toMatchObject({ ok: false })
  })
  it('rechaza montos absurdamente grandes', () => {
    expect(validateMonto('9999999999')).toMatchObject({ ok: false })
  })
  it('redondea a 2 decimales', () => {
    expect(validateMonto('1234.567')).toEqual({ ok: true, value: 1234.57 })
  })
})

describe('validateCantidad', () => {
  it('acepta enteros positivos', () => {
    expect(validateCantidad(5)).toEqual({ ok: true, value: 5 })
  })
  it('acepta decimales', () => {
    expect(validateCantidad(2.5)).toEqual({ ok: true, value: 2.5 })
  })
  it('acepta strings parseables', () => {
    expect(validateCantidad('3,5')).toEqual({ ok: true, value: 3.5 })
  })
  it('rechaza negativos', () => {
    expect(validateCantidad(-1)).toMatchObject({ ok: false })
  })
  it('rechaza cero por defecto', () => {
    expect(validateCantidad(0)).toMatchObject({ ok: false })
  })
  it('acepta cero si allowZero', () => {
    expect(validateCantidad(0, { allowZero: true })).toEqual({ ok: true, value: 0 })
  })
  it('rechaza NaN', () => {
    expect(validateCantidad(NaN)).toMatchObject({ ok: false })
    expect(validateCantidad('xyz')).toMatchObject({ ok: false })
  })
})

describe('validateGuests', () => {
  it('acepta dentro de rango', () => {
    expect(validateGuests(40)).toEqual({ ok: true, value: 40 })
    expect(validateGuests(0)).toEqual({ ok: true, value: 0 })
  })
  it('rechaza negativos', () => {
    expect(validateGuests(-1)).toMatchObject({ ok: false })
  })
  it('rechaza > maxGuests', () => {
    expect(validateGuests(250)).toMatchObject({ ok: false })
  })
  it('floor decimales', () => {
    expect(validateGuests(40.7)).toEqual({ ok: true, value: 40 })
  })
})

describe('validateRooms', () => {
  it('rechaza > capacity', () => {
    expect(validateRooms(54, 53)).toMatchObject({ ok: false })
  })
  it('acepta dentro de rango', () => {
    expect(validateRooms(30, 53)).toEqual({ ok: true, value: 30 })
  })
})

describe('validatePin', () => {
  it('acepta 4 dígitos', () => {
    expect(validatePin('1234')).toEqual({ ok: true, value: '1234' })
  })
  it('rechaza menos de 4', () => {
    expect(validatePin('123')).toMatchObject({ ok: false })
  })
  it('rechaza más de 4', () => {
    expect(validatePin('12345')).toMatchObject({ ok: false })
  })
  it('rechaza no-dígitos', () => {
    expect(validatePin('12ab')).toMatchObject({ ok: false })
  })
  it('rechaza vacío', () => {
    expect(validatePin('')).toMatchObject({ ok: false })
  })
})

describe('formatMonto / formatMontoCurrency', () => {
  it('formato básico es-AR', () => {
    expect(formatMonto(1234.5)).toContain('1.234,50')
  })
  it('currency incluye símbolo', () => {
    expect(formatMontoCurrency(1234.5)).toMatch(/\$/)
  })
})
