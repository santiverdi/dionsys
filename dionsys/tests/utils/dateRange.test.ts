import { describe, it, expect } from 'vitest'
import {
  getMonthRange, isInMonth, getPreviousMonth, getNextMonth,
  monthLabel, monthKey, daysInMonth,
} from '../../src/utils/dateRange'

describe('getMonthRange', () => {
  it('devuelve start y end correctos para mayo 2026', () => {
    const { start, end } = getMonthRange(2026, 5)
    expect(start.getFullYear()).toBe(2026)
    expect(start.getMonth()).toBe(4) // mayo = índice 4
    expect(start.getDate()).toBe(1)
    expect(end.getDate()).toBe(31)
    expect(end.getMonth()).toBe(4)
  })
  it('maneja febrero bisiesto (2024)', () => {
    const { end } = getMonthRange(2024, 2)
    expect(end.getDate()).toBe(29)
  })
  it('maneja febrero no bisiesto (2025)', () => {
    const { end } = getMonthRange(2025, 2)
    expect(end.getDate()).toBe(28)
  })
})

describe('isInMonth', () => {
  it('devuelve true para fecha del mismo mes', () => {
    expect(isInMonth('2026-05-15T10:00:00Z', 2026, 5)).toBe(true)
  })
  it('devuelve false para fecha de otro mes', () => {
    expect(isInMonth('2026-04-15T10:00:00Z', 2026, 5)).toBe(false)
    expect(isInMonth('2026-06-15T10:00:00Z', 2026, 5)).toBe(false)
  })
  it('devuelve false para ISO inválido', () => {
    expect(isInMonth('not-a-date', 2026, 5)).toBe(false)
    expect(isInMonth('', 2026, 5)).toBe(false)
  })
})

describe('getPreviousMonth', () => {
  it('mes normal', () => {
    expect(getPreviousMonth(2026, 5)).toEqual({ year: 2026, month: 4 })
  })
  it('enero retrocede a diciembre del año anterior', () => {
    expect(getPreviousMonth(2026, 1)).toEqual({ year: 2025, month: 12 })
  })
})

describe('getNextMonth', () => {
  it('mes normal', () => {
    expect(getNextMonth(2026, 5)).toEqual({ year: 2026, month: 6 })
  })
  it('diciembre avanza a enero del siguiente año', () => {
    expect(getNextMonth(2026, 12)).toEqual({ year: 2027, month: 1 })
  })
})

describe('monthLabel y monthKey', () => {
  it('monthLabel devuelve "Mayo 2026"', () => {
    expect(monthLabel(2026, 5)).toBe('Mayo 2026')
  })
  it('monthKey devuelve YYYY-MM con zero pad', () => {
    expect(monthKey(2026, 5)).toBe('2026-05')
    expect(monthKey(2026, 12)).toBe('2026-12')
  })
})

describe('daysInMonth', () => {
  it('mayo tiene 31', () => {
    expect(daysInMonth(2026, 5)).toBe(31)
  })
  it('febrero bisiesto tiene 29', () => {
    expect(daysInMonth(2024, 2)).toBe(29)
  })
  it('febrero no bisiesto tiene 28', () => {
    expect(daysInMonth(2025, 2)).toBe(28)
  })
})
