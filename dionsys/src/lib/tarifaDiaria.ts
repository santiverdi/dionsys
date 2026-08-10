// El MISMO cálculo de precios que hace el script de la landing pública, portado
// para el calendario de tarifas de Recepción. Si la landing cambia su fórmula,
// esto tiene que cambiar igual (los tests cruzan contra los ejemplos del
// tarifario del dueño).
//
// Reglas (en el orden en que se aplican por noche):
//   1. Temporada por fecha → precio base según personas (1 = single por
//      habitación; 2 a 5 = por persona). Si la temporada tiene tarifasCaras y el
//      día es "caro" (vie/sáb), el base sale de ahí.
//   2. Finde largo → recargo sobre el base (redondeado).
//   3. Tope por persona: de 2 a 5 nunca se cobra más que el tope. La single
//      queda afuera (es habitación completa).
//   4. Descuento por efectivo: en finde largo SIEMPRE el de día caro; si no,
//      el de día caro o barato según el día.

import type { TarifarioPublico, TemporadaPublica } from './landing'

function aDia(s: string): number {
  return Date.parse(s + 'T00:00:00Z')
}

/** Día de la semana como getDay(): 0=domingo … 6=sábado (sin depender del huso). */
export function diaSemana(fecha: string): number {
  return new Date(aDia(fecha)).getUTCDay()
}

export interface InfoDia {
  fecha: string
  enVigencia: boolean
  bloqueada: boolean
  temporada: string | null
  caro: boolean               // vie/sáb (o lo que la temporada marque como caro)
  findeLargo: string | null   // nombre del finde largo si la noche cae en uno
  precio: number | null       // por persona/noche (2-5, con tope) o por habitación (single)
  descEfectivo: number        // fracción de descuento por efectivo de ESA noche
}

function temporadaDe(fecha: string, t: TarifarioPublico): TemporadaPublica | undefined {
  return t.temporadas.find(x => x.desde <= fecha && fecha <= x.hasta)
}

/** Precio y condiciones de UNA noche para esa cantidad de personas. */
export function infoDia(fecha: string, pax: number, t: TarifarioPublico): InfoDia {
  const v = t.config.vigencia
  const enVigencia = v.desde <= fecha && fecha <= v.hasta
  const bloqueada = t.bloqueadas.includes(fecha)
  const temp = enVigencia ? temporadaDe(fecha, t) : undefined
  if (!temp) {
    return { fecha, enVigencia, bloqueada, temporada: null, caro: false, findeLargo: null, precio: null, descEfectivo: 0 }
  }
  const dia = diaSemana(fecha)
  const caro = temp.diasCaros.includes(dia)
  const fl = t.findesLargos.find(f => f.desde <= fecha && fecha <= f.hasta) ?? null
  const base = (caro && temp.tarifasCaras && temp.tarifasCaras[pax]) ? temp.tarifasCaras[pax] : temp.tarifas[pax]
  const conRecargo = fl ? Math.round(base * (1 + fl.recargo)) : base
  const precio = pax === 1 ? conRecargo : Math.min(conRecargo, t.config.tope_por_persona)
  const descEfectivo = fl ? temp.efectivoCaro : (caro ? temp.efectivoCaro : temp.efectivoBarato)
  return { fecha, enVigencia, bloqueada, temporada: temp.nombre, caro, findeLargo: fl?.n ?? null, precio, descEfectivo }
}

export interface Cotizacion {
  noches: number
  total: number
  efectivo: number
  n20: number            // noches con 20%+ de descuento en efectivo
  n10: number            // noches con menos de 20%
  minNoches: number      // la exigencia más alta entre las temporadas tocadas
  sena: number           // fracción (0.3 = 30%); la más alta entre las temporadas
  findes: string[]       // findes largos que caen en la estadía
  bloqueadas: string[]   // noches de la estadía sin disponibilidad
  incompleta: boolean    // alguna noche quedó fuera de la vigencia (sin precio)
}

/** Cotiza las noches [llegada, salida) — mismas cuentas que el calculador público. */
export function cotizarEstadia(llegada: string, salida: string, pax: number, t: TarifarioPublico): Cotizacion {
  let total = 0, efectivo = 0, n20 = 0, n10 = 0, minNoches = 1, sena = 0
  let noches = 0, incompleta = false
  const findes = new Set<string>()
  const bloqueadas: string[] = []

  for (let d = aDia(llegada); d < aDia(salida); d += 86_400_000) {
    const fecha = new Date(d).toISOString().slice(0, 10)
    noches++
    const info = infoDia(fecha, pax, t)
    if (info.bloqueada) bloqueadas.push(fecha)
    if (info.precio === null) {
      incompleta = true
      continue
    }
    if (info.findeLargo) findes.add(info.findeLargo)
    const temp = temporadaDe(fecha, t)
    if (temp) {
      minNoches = Math.max(minNoches, temp.minNoches)
      sena = Math.max(sena, temp.sena)
    }
    const sub = info.precio * (pax === 1 ? 1 : pax)
    if (info.descEfectivo >= 0.2) n20++
    else n10++
    total += sub
    efectivo += sub * (1 - info.descEfectivo)
  }

  return { noches, total, efectivo: Math.round(efectivo), n20, n10, minNoches, sena, findes: [...findes], bloqueadas, incompleta }
}
