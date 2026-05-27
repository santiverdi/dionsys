const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export interface MonthRange {
  start: Date
  end: Date
}

export function getMonthRange(year: number, month: number): MonthRange {
  const start = new Date(year, month - 1, 1, 0, 0, 0, 0)
  const end = new Date(year, month, 0, 23, 59, 59, 999)
  return { start, end }
}

export function isInMonth(iso: string, year: number, month: number): boolean {
  if (!iso) return false
  const d = new Date(iso)
  if (isNaN(d.getTime())) return false
  return d.getFullYear() === year && d.getMonth() + 1 === month
}

export function getPreviousMonth(year: number, month: number): { year: number; month: number } {
  if (month === 1) return { year: year - 1, month: 12 }
  return { year, month: month - 1 }
}

export function getNextMonth(year: number, month: number): { year: number; month: number } {
  if (month === 12) return { year: year + 1, month: 1 }
  return { year, month: month + 1 }
}

export function monthLabel(year: number, month: number): string {
  return `${MESES[month - 1]} ${year}`
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

export function getCurrentMonth(): { year: number; month: number } {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}
