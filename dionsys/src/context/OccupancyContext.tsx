import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'
import * as XLSX from 'xlsx'

export const HOTEL_CAPACITY = 53

export type Turno = 'manana' | 'tarde' | 'noche'

export function getCurrentTurno(): Turno {
  const hour = new Date().getHours()
  if (hour >= 7 && hour < 15) return 'manana'
  if (hour >= 15 && hour < 23) return 'tarde'
  return 'noche'
}

export const TURNO_LABELS: Record<Turno, string> = {
  manana: 'Mañana (7-15)',
  tarde: 'Tarde (15-23)',
  noche: 'Noche (23-7)',
}

export interface OccupancyRecord {
  id: string
  date: string // YYYY-MM-DD
  guests: number
  rooms: number
  createdBy: string
  createdAt: string
  turno?: Turno
  notes?: string
  // Breakdown from Excel import
  inhouse?: number
  out?: number
  checkIn?: number
}

export interface AvgConsumption {
  productName: string
  avgPerGuest: number
  unit: string
  source: 'panaderia' | 'lacteos'
}

interface OccupancyContextType {
  records: OccupancyRecord[]
  currentTurno: Turno
  setToday: (guests: number, rooms: number, createdBy: string, extra?: Partial<OccupancyRecord>) => void
  getToday: () => OccupancyRecord | undefined
  getHistory: (days: number) => OccupancyRecord[]
  getAvgConsumption: () => AvgConsumption[]
  getProjection: (guests: number) => { productName: string; suggested: number; unit: string; source: string }[]
  parseExcel: (file: File) => Promise<{ guests: number; rooms: number; inhouse: number; out: number; checkIn: number }>
}

const STORAGE_KEY = 'dionsys_occupancy'
const LACTEOS_KEY = 'dionsys_lacteos_consumption'

function loadRecords(): OccupancyRecord[] {
  const saved = localStorage.getItem(STORAGE_KEY)
  return saved ? JSON.parse(saved) : []
}

function saveRecords(records: OccupancyRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records))
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const OccupancyContext = createContext<OccupancyContextType | null>(null)

export function OccupancyProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<OccupancyRecord[]>(loadRecords)
  const currentTurno = getCurrentTurno()

  const setToday = useCallback((guests: number, rooms: number, createdBy: string, extra?: Partial<OccupancyRecord>) => {
    setRecords(prev => {
      const date = todayStr()
      const existing = prev.findIndex(r => r.date === date)
      const record: OccupancyRecord = {
        id: existing >= 0 ? prev[existing].id : crypto.randomUUID(),
        date,
        guests,
        rooms,
        createdBy,
        createdAt: new Date().toISOString(),
        turno: getCurrentTurno(),
        ...extra,
      }
      const updated = existing >= 0
        ? prev.map((r, i) => i === existing ? record : r)
        : [record, ...prev]
      saveRecords(updated)
      return updated
    })
  }, [])

  const getToday = useCallback((): OccupancyRecord | undefined => {
    return records.find(r => r.date === todayStr())
  }, [records])

  const getHistory = useCallback((days: number): OccupancyRecord[] => {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`
    return records
      .filter(r => r.date >= cutoffStr)
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [records])

  const getAvgConsumption = useCallback((): AvgConsumption[] => {
    const result: AvgConsumption[] = []
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - 30)

    // --- Panaderia: from orders with type='recepcion' + distributorId containing 'panaderia' ---
    try {
      const ordersRaw = localStorage.getItem('dionsys_orders')
      if (ordersRaw) {
        const orders = JSON.parse(ordersRaw) as Array<{
          type?: string; distributorId: string; notes: string;
          items: Array<{ productName: string; quantity: number; unit: string }>
          createdAt: string; status: string
        }>

        const panOrders = orders.filter(o => {
          if (o.status === 'borrado') return false
          if (o.type !== 'recepcion') return false
          if (!o.distributorId?.toLowerCase().includes('panaderia')) return false
          if (new Date(o.createdAt) < cutoff) return false
          return true
        })

        // Parse guests from notes like "45 huespedes" or "45 huespedes - DOBLE (sab+dom)"
        const panAvgs: Record<string, { total: number; count: number; unit: string }> = {}
        for (const order of panOrders) {
          const match = order.notes?.match(/^(\d+)\s*huesped/)
          if (!match) continue
          const guests = parseInt(match[1])
          if (guests <= 0) continue
          for (const item of order.items) {
            if (!panAvgs[item.productName]) panAvgs[item.productName] = { total: 0, count: 0, unit: item.unit }
            panAvgs[item.productName].total += item.quantity / guests
            panAvgs[item.productName].count += 1
          }
        }
        for (const [name, data] of Object.entries(panAvgs)) {
          result.push({
            productName: name,
            avgPerGuest: Math.round((data.total / data.count) * 100) / 100,
            unit: data.unit,
            source: 'panaderia',
          })
        }
      }
    } catch { /* ignore parse errors */ }

    // --- Lacteos: from dionsys_lacteos_consumption ---
    try {
      const lacRaw = localStorage.getItem(LACTEOS_KEY)
      if (lacRaw) {
        const lacRecords = JSON.parse(lacRaw) as Array<{
          guests: number; items: Array<{ productName: string; quantity: number; unit: string }>
          date: string; supplier: string
        }>

        const lacAvgs: Record<string, { total: number; count: number; unit: string }> = {}
        for (const rec of lacRecords) {
          if (rec.supplier !== 'lacteos' || rec.guests <= 0) continue
          if (new Date(rec.date) < cutoff) continue
          for (const item of rec.items) {
            if (!lacAvgs[item.productName]) lacAvgs[item.productName] = { total: 0, count: 0, unit: item.unit }
            lacAvgs[item.productName].total += item.quantity / rec.guests
            lacAvgs[item.productName].count += 1
          }
        }
        for (const [name, data] of Object.entries(lacAvgs)) {
          result.push({
            productName: name,
            avgPerGuest: Math.round((data.total / data.count) * 100) / 100,
            unit: data.unit,
            source: 'lacteos',
          })
        }
      }
    } catch { /* ignore parse errors */ }

    return result
  }, [])

  const getProjection = useCallback((guests: number) => {
    const avgs = getAvgConsumption()
    return avgs.map(a => ({
      productName: a.productName,
      suggested: Math.ceil(a.avgPerGuest * guests),
      unit: a.unit,
      source: a.source,
    }))
  }, [getAvgConsumption])

  const parseExcel = useCallback(async (file: File): Promise<{
    guests: number; rooms: number; inhouse: number; out: number; checkIn: number
  }> => {
    const data = await file.arrayBuffer()
    const workbook = XLSX.read(data)
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)

    // Normalize column names (handle accents, casing)
    const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()

    const getCol = (row: Record<string, unknown>, patterns: string[]): string => {
      for (const key of Object.keys(row)) {
        const norm = normalize(key)
        if (patterns.some(p => norm.includes(p))) return key
      }
      return ''
    }

    if (rows.length === 0) throw new Error('Excel vacio')

    const first = rows[0] as Record<string, unknown>
    const tipoCol = getCol(first, ['tipo'])
    const adultosCol = getCol(first, ['adulto'])
    const menoresCol = getCol(first, ['menor'])
    const bebesCol = getCol(first, ['bebe'])
    const habCol = getCol(first, ['habitacion', 'nro hab'])

    let inhouseGuests = 0
    let outGuests = 0
    let checkInGuests = 0
    const inhouseRooms = new Set<string>()
    const outRooms = new Set<string>()

    for (const row of rows) {
      const tipo = String(row[tipoCol] ?? '').toUpperCase().trim()
      const adultos = Number(row[adultosCol]) || 0
      const menores = Number(row[menoresCol]) || 0
      const bebes = Number(row[bebesCol]) || 0
      const total = adultos + menores + bebes
      const hab = String(row[habCol] ?? '').trim()

      if (tipo === 'INHOUSE') {
        // Only count guests once per reservation (dedup by room - take max per room)
        if (!inhouseRooms.has(hab)) {
          inhouseRooms.add(hab)
        }
        inhouseGuests += adultos // Count individual adults from each row
        // Menores and bebes from INHOUSE
        inhouseGuests += menores + bebes
      } else if (tipo === 'OUT') {
        if (!outRooms.has(hab)) {
          outRooms.add(hab)
        }
        outGuests += total
      } else if (tipo === 'IN') {
        checkInGuests += total
      }
    }

    // However, from the Excel each person is a separate row, but Adultos column
    // shows the total per reservation. We need to count unique reservations.
    // Let's re-process: group by room, take the Adultos+Menores+Bebes from first row of each room
    const roomData = new Map<string, { adultos: number; menores: number; bebes: number; tipo: string }>()
    for (const row of rows) {
      const tipo = String(row[tipoCol] ?? '').toUpperCase().trim()
      const hab = String(row[habCol] ?? '').trim()
      if (!hab) continue
      // Only keep first occurrence per room (has the correct count)
      const key = `${hab}-${tipo}`
      if (!roomData.has(key)) {
        roomData.set(key, {
          adultos: Number(row[adultosCol]) || 0,
          menores: Number(row[menoresCol]) || 0,
          bebes: Number(row[bebesCol]) || 0,
          tipo,
        })
      }
    }

    // Recalculate from deduplicated room data
    inhouseGuests = 0
    outGuests = 0
    checkInGuests = 0
    const breakfastRooms = new Set<string>()

    for (const [key, data] of roomData) {
      const hab = key.split('-')[0]
      const total = data.adultos + data.menores + data.bebes
      if (data.tipo === 'INHOUSE') {
        inhouseGuests += total
        breakfastRooms.add(hab)
      } else if (data.tipo === 'OUT') {
        outGuests += total
        breakfastRooms.add(hab)
      } else if (data.tipo === 'IN') {
        checkInGuests += total
      }
    }

    // Breakfast guests = INHOUSE + OUT (IN don't breakfast)
    const totalBreakfast = inhouseGuests + outGuests

    return {
      guests: totalBreakfast,
      rooms: breakfastRooms.size,
      inhouse: inhouseGuests,
      out: outGuests,
      checkIn: checkInGuests,
    }
  }, [])

  return (
    <OccupancyContext.Provider value={{
      records, currentTurno, setToday, getToday, getHistory, getAvgConsumption, getProjection, parseExcel
    }}>
      {children}
    </OccupancyContext.Provider>
  )
}

export function useOccupancy() {
  const ctx = useContext(OccupancyContext)
  if (!ctx) throw new Error('useOccupancy must be used within OccupancyProvider')
  return ctx
}
