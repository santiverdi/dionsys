// Maestro de habitaciones: la distribución física real del hotel.
//
// Es la fuente de verdad de QUÉ habitaciones existen, en qué piso están y cuánta
// gente entra en cada una. Hasta ahora el sistema solo conocía un número suelto
// (HOTEL_CAPACITY = 53) y los números de habitación que venían en los PDFs del
// PMS, sin saber piso ni capacidad. Con esto:
//   - la capacidad se CALCULA, no se escribe a mano
//   - el control de tarifas puede usar el tipo REAL de la habitación en vez de
//     deducirlo de cuánta gente durmió esa noche
//   - un parte que menciona una habitación inexistente (o que se olvida una)
//     se puede detectar
//
// Estructura del hotel (pasada por administración, julio 2026):
//   Pisos 1 a 9  → 5 habitaciones cada uno (X01…X05), mismo patrón de camas
//   Piso 10      → 1001…1005, patrón propio
//   Piso 11      → solo 1103, 1104 y 1105
//
// OJO: `plazas` = personas que duermen. Hoy se asume 1 cama = 1 plaza. Si alguna
// habitación tiene cama matrimonial (2 personas en 1 cama), hay que corregir esa
// habitación a mano poniéndole `plazas` distinto de `camas`.

export type TipoHabitacion = 'single' | 'doble' | 'triple' | 'cuadruple' | 'quintuple'

export interface Habitacion {
  numero: string          // "101", "1002" — igual que lo escribe el PMS
  piso: number
  camas: number           // camas físicas
  plazas: number          // personas que duermen (capacidad máxima)
  activa: boolean         // false = fuera de servicio: no se vende ni cuenta en la capacidad
}

// Cuántas camas tiene cada habitación de los pisos 1 a 9, según el final del
// número (01…05). El patrón se repite idéntico en los nueve pisos.
const CAMAS_POR_LINEA: Record<string, number> = {
  '01': 3,
  '02': 5,
  '03': 3,
  '04': 3,
  '05': 2,
}

// Pisos 10 y 11 no siguen el patrón: se listan explícitos.
const CAMAS_PISO_10: Record<string, number> = {
  '1001': 2,
  '1002': 2,
  '1003': 3,
  '1004': 3,
  '1005': 2,
}

const CAMAS_PISO_11: Record<string, number> = {
  '1103': 2,
  '1104': 2,
  '1105': 2,
}

function hab(numero: string, piso: number, camas: number): Habitacion {
  return { numero, piso, camas, plazas: camas, activa: true }
}

function construirLayout(): Habitacion[] {
  const habitaciones: Habitacion[] = []

  // Pisos 1 a 9: X01 … X05
  for (let piso = 1; piso <= 9; piso++) {
    for (const [linea, camas] of Object.entries(CAMAS_POR_LINEA)) {
      habitaciones.push(hab(`${piso}${linea}`, piso, camas))
    }
  }

  for (const [numero, camas] of Object.entries(CAMAS_PISO_10)) {
    habitaciones.push(hab(numero, 10, camas))
  }

  for (const [numero, camas] of Object.entries(CAMAS_PISO_11)) {
    habitaciones.push(hab(numero, 11, camas))
  }

  return habitaciones
}

export const HABITACIONES: Habitacion[] = construirLayout()

export const PISOS: number[] = [...new Set(HABITACIONES.map(h => h.piso))].sort((a, b) => a - b)

// ===== Derivados =====

const activas = () => HABITACIONES.filter(h => h.activa)

/** Habitaciones vendibles. Reemplaza al viejo HOTEL_CAPACITY = 53 escrito a mano. */
export const TOTAL_HABITACIONES: number = activas().length

/** Plazas totales del hotel (personas que entran durmiendo, con todo ocupado). */
export const TOTAL_PLAZAS: number = activas().reduce((s, h) => s + h.plazas, 0)

const PORNUMERO: Map<string, Habitacion> = new Map(HABITACIONES.map(h => [h.numero, h]))

/** Busca una habitación por su número tal como lo escribe el PMS. */
export function getHabitacion(numero: string): Habitacion | undefined {
  return PORNUMERO.get(String(numero ?? '').trim())
}

/** true si el número existe en el hotel. Sirve para validar los partes del PMS. */
export function existeHabitacion(numero: string): boolean {
  return PORNUMERO.has(String(numero ?? '').trim())
}

/** Habitaciones de un piso, ordenadas por número. */
export function habitacionesDePiso(piso: number): Habitacion[] {
  return HABITACIONES.filter(h => h.piso === piso).sort((a, b) => a.numero.localeCompare(b.numero))
}

const TIPO_POR_PLAZAS: Record<number, TipoHabitacion> = {
  1: 'single',
  2: 'doble',
  3: 'triple',
  4: 'cuadruple',
  5: 'quintuple',
}

/**
 * Tipo tarifario de la habitación según su capacidad real.
 * Sin esto, tarifas.ts deduce el tipo de las plazas del parte: una doble vendida
 * a una sola persona se controlaba como single y pasaba sin alerta.
 */
export function tipoDeHabitacion(numero: string): TipoHabitacion | undefined {
  const h = getHabitacion(numero)
  return h ? TIPO_POR_PLAZAS[h.plazas] : undefined
}

/**
 * Sobreocupación: más personas de las que entran en la habitación.
 * `plazasReportadas` sale del parte del PMS.
 */
export function haySobreocupacion(numero: string, plazasReportadas: number): boolean {
  const h = getHabitacion(numero)
  return !!h && plazasReportadas > h.plazas
}
