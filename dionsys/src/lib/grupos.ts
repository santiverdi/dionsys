// Qué se saca de los grupos que cobra el dueño por fuera de la caja.
//
// Dos cosas que el sistema no veía:
//   1. LO QUE FALTA COBRAR: es una cuenta por cobrar real (el espejo de la
//      cuenta corriente con proveedores, que sí estaba).
//   2. EL INGRESO COMPROMETIDO por mes: un grupo se cobra antes de alojarse,
//      pero el ingreso corresponde al mes en que se aloja.
//
// Además: mientras un grupo está alojado, sus habitaciones figuran ocupadas en
// el parte y no tienen cobro en ninguna caja. `estaEnGrupo` deja marcar esas
// fechas para no acusar un "check-out sin cobro" que en realidad cobró el dueño.

import type { Grupo } from '../types'

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0)

export interface ResumenGrupos {
  grupos: number
  contratado: number      // total de todos los grupos
  cobrado: number         // suma de señas y pagos
  porCobrar: number       // saldo pendiente (solo los que deben)
  aFavor: number          // pagos de más (saldo negativo), en positivo
  plazas: number          // personas comprometidas
  nochesPlaza: number     // plazas × noches: la ocupación que van a generar
}

export function getResumenGrupos(grupos: Grupo[]): ResumenGrupos {
  const plazasDe = (g: Grupo) => g.plazasDoble + g.plazasSingle
  return {
    grupos: grupos.length,
    contratado: sum(grupos.map(g => g.total)),
    cobrado: sum(grupos.map(g => sum(g.pagos))),
    porCobrar: sum(grupos.filter(g => g.saldo > 0).map(g => g.saldo)),
    aFavor: Math.abs(sum(grupos.filter(g => g.saldo < 0).map(g => g.saldo))),
    plazas: sum(grupos.map(plazasDe)),
    nochesPlaza: sum(grupos.map(g => plazasDe(g) * g.noches)),
  }
}

/** Grupos que todavía no se alojaron, del más próximo al más lejano. */
export function gruposProximos(grupos: Grupo[], hoy = new Date()): Grupo[] {
  const dia = hoy.toISOString().slice(0, 10)
  return grupos.filter(g => g.egreso >= dia).sort((a, b) => a.ingreso.localeCompare(b.ingreso))
}

/** Grupos que ya se fueron y siguen debiendo: eso es plata a reclamar. */
export function gruposConDeudaVencida(grupos: Grupo[], hoy = new Date()): Grupo[] {
  const dia = hoy.toISOString().slice(0, 10)
  return grupos
    .filter(g => g.egreso < dia && g.saldo > 0)
    .sort((a, b) => b.saldo - a.saldo)
}

/**
 * Grupos que pagaron MÁS que su total. Casi siempre es un error de carga o un
 * precio que cambió y no se actualizó; vale mirarlo antes de dar por buena la
 * cuenta por cobrar.
 */
export function gruposSobrepagados(grupos: Grupo[]): Grupo[] {
  return grupos.filter(g => g.saldo < 0).sort((a, b) => a.saldo - b.saldo)
}

export interface IngresoMesGrupo {
  mes: string        // YYYY-MM
  total: number      // ingreso de los grupos que se alojan ese mes
  grupos: number
}

/**
 * Ingreso comprometido por mes, imputado al mes en que el grupo SE ALOJA (no al
 * que pagó la seña): es cuando el hotel presta el servicio y genera el costo.
 */
export function ingresosPorMes(grupos: Grupo[]): IngresoMesGrupo[] {
  const map = new Map<string, { total: number; grupos: number }>()
  for (const g of grupos) {
    const mes = g.ingreso.slice(0, 7)
    const acc = map.get(mes) ?? { total: 0, grupos: 0 }
    acc.total += g.total
    acc.grupos += 1
    map.set(mes, acc)
  }
  return [...map.entries()]
    .map(([mes, v]) => ({ mes, ...v }))
    .sort((a, b) => a.mes.localeCompare(b.mes))
}

/** Total de los grupos que se alojan en un mes (YYYY-MM). Para Negocio. */
export function ingresoGruposMes(year: number, month: number, grupos: Grupo[]): number {
  const mes = `${year}-${String(month).padStart(2, '0')}`
  return sum(grupos.filter(g => g.ingreso.slice(0, 7) === mes).map(g => g.total))
}

/**
 * ¿Esta fecha cae dentro de la estadía de algún grupo? Sirve para no marcar
 * como "check-out sin cobro" a un pasajero de grupo: esa plata la cobró el
 * dueño por fuera. Se compara contra la estadía completa (ingreso a egreso).
 */
export function grupoDeFecha(fecha: string, grupos: Grupo[]): Grupo | undefined {
  const dia = (fecha || '').slice(0, 10)
  if (!dia) return undefined
  return grupos.find(g => g.ingreso <= dia && dia <= g.egreso)
}

export function estaEnGrupo(fecha: string, grupos: Grupo[]): boolean {
  return !!grupoDeFecha(fecha, grupos)
}

export interface ResultadoImport {
  grupos: Grupo[]
  nuevos: number
  actualizados: number
  archivados: Grupo[]   // ya se alojaron y salieron de la planilla: se CONSERVAN
  quitados: Grupo[]     // futuros que ya no figuran: se sacan (cancelados o repactados)
}

/**
 * Fusiona lo que trae el Excel con lo ya guardado.
 *
 * La planilla del dueño **solo tiene los grupos que vienen**: cuando uno se
 * aloja, lo saca. Si el import reemplazara todo, ese grupo desaparecería del
 * sistema junto con su ingreso — justo la plata que queremos registrada. Por eso:
 *
 *   - grupo que está en el Excel      → manda el Excel (trae los pagos al día)
 *   - grupo que YA se alojó y no está → se conserva (es historia contable)
 *   - grupo FUTURO que ya no está     → se saca (se canceló o se repactó), pero
 *                                       se informa cuál para que no sea silencioso
 */
export function mergeGrupos(existentes: Grupo[], delExcel: Grupo[], hoy = new Date()): ResultadoImport {
  const dia = hoy.toISOString().slice(0, 10)
  const enExcel = new Map(delExcel.map(g => [g.id, g]))
  const previos = new Map(existentes.map(g => [g.id, g]))

  const archivados = existentes.filter(g => !enExcel.has(g.id) && g.egreso < dia)
  const quitados = existentes.filter(g => !enExcel.has(g.id) && g.egreso >= dia)

  return {
    grupos: [...delExcel, ...archivados].sort((a, b) => a.ingreso.localeCompare(b.ingreso)),
    nuevos: delExcel.filter(g => !previos.has(g.id)).length,
    actualizados: delExcel.filter(g => previos.has(g.id)).length,
    archivados,
    quitados,
  }
}
