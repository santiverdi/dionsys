// Los impuestos, servicios y honorarios que ya están pagados en el libro de
// Charo, listos para mandarlos a la pantalla de Impuestos y Servicios.
//
// LA DIFERENCIA CON SUELDOS: en Impuestos ya están configurados los servicios
// (EDEA, OSSE, la contadora, el abono de ascensores…) con su vencimiento. El
// libro no agrega servicios nuevos: dice QUÉ SE PAGÓ, CUÁNTO Y CUÁNDO. Por eso
// mandar una fila es, casi siempre, marcar como PAGADO un vencimiento que ya
// estaba cargado — y solo cuando no hay ninguno se crea el pago.
//
// A qué servicio va cada fila se PROPONE comparando el concepto y el detalle
// contra el nombre de los servicios configurados, pero nunca se manda solo: es
// texto a mano y una propuesta equivocada mete plata en el rubro que no es.
//
// LO QUE NO ENTRA ACÁ: los sueldos y las cargas sociales (van a Sueldos, que es
// donde se arma el costo laboral) y todo lo que no es una salida de plata.

import type {
  ImpuestoServicio, LibroCajaMovimiento, PagoMensual, CategoriaServicio,
} from '../types'
import { claveMovimiento } from './libroCajaMarcas'
import { esSalidaDePlata } from './libroCajaConceptos'
import { esMovimientoSueldo } from './libroCajaSueldos'
import { diasEntre, mejorPorPalabras, normalizarNombre } from './libroCajaTexto'

// Muletillas del detalle de un impuesto o servicio: no nombran al servicio.
const RUIDO_SERVICIOS = [
  'IMPUESTO', 'IMPUESTOS', 'SERVICIO', 'SERVICIOS', 'TASA', 'TASAS', 'ABONO',
  'HONORARIOS', 'HONORARIO', 'GASTO', 'GASTOS', 'VARIOS', 'GENERAL',
]

/** A qué servicio configurado apunta la fila (concepto + detalle). */
export function matchServicio(
  mov: LibroCajaMovimiento,
  servicios: ImpuestoServicio[],
): ImpuestoServicio | null {
  return mejorPorPalabras(
    `${mov.concepto} ${mov.detalle}`, servicios, s => s.nombre, RUIDO_SERVICIOS,
  )
}

/**
 * ¿Esta fila puede ir a Impuestos y Servicios? Es toda salida de plata que sea
 * gasto de verdad y no sea costo laboral. No se filtra por concepto: la lista
 * de códigos de la planilla no es fija y de un mes a otro aparecen conceptos
 * nuevos — el que decide a qué servicio va (o si no va a ninguno) es el usuario.
 */
export function puedeIrAImpuestos(mov: LibroCajaMovimiento): boolean {
  return mov.monto < 0 && esSalidaDePlata(mov.conceptoCod) && !esMovimientoSueldo(mov)
}

/** Palabras que delatan un impuesto/servicio aunque no matchee ninguno cargado. */
const PISTA_SERVICIO = /IMPUESTO|SERVICIO|TASA|ABONO|HONORARIO|LUZ|GAS|AGUA|INTERNET|TELEFON|SEGURO|MUNICIP|RENTAS|ARBA|AFIP|EDEA|OSSE|CONTADOR|ALQUILER/

/** ¿Vale la pena ofrecerla aunque todavía no matchee un servicio cargado? */
function pareceServicio(mov: LibroCajaMovimiento): boolean {
  return PISTA_SERVICIO.test(normalizarNombre(`${mov.concepto} ${mov.detalle}`))
}

export interface ImpuestoDelLibro {
  clave: string                       // clave estable de la fila (libroCajaMarcas)
  mov: LibroCajaMovimiento
  monto: number                       // positivo: lo que salió
  mes: string                         // YYYY-MM en que salió la plata
  servicioSugerido: ImpuestoServicio | null
  enviado: PagoMensual | null         // ya se mandó desde acá
  // Vencimiento ya cargado y PENDIENTE de ese servicio: mandar la fila lo marca
  // pagado en vez de crear un pago nuevo.
  pendienteAMarcar: PagoMensual | null
  // Ya hay un pago PAGADO de ese servicio en ese mes: Impuestos guarda uno solo
  // por servicio y por mes, así que esta fila no se puede mandar.
  yaPagado: PagoMensual | null
}

/** Categoría del servicio (ausente = impuesto, por retrocompatibilidad). */
export function categoriaDe(s: ImpuestoServicio | null): CategoriaServicio {
  return s?.categoria ?? 'impuesto'
}

/**
 * El vencimiento pendiente que esta fila viene a pagar: el del mismo servicio
 * con la fecha más cercana al pago. Se mira más de un mes para atrás porque una
 * boleta que vence a fin de mes se paga a principios del siguiente.
 */
export function pendienteDe(
  servicioId: string,
  fechaPago: string,
  pagos: PagoMensual[],
  toleranciaDias = 40,
): PagoMensual | null {
  const candidatos = pagos
    .filter(p => p.impuestoId === servicioId && !p.pagado && p.vtoActual)
    .map(p => ({ p, dist: diasEntre(p.vtoActual, fechaPago) }))
    .filter(x => x.dist <= toleranciaDias)
    .sort((a, b) => a.dist - b.dist)
  return candidatos[0]?.p ?? null
}

/** El pago YA PAGADO de ese servicio en ese mes, si lo hay. */
export function yaPagadoDe(
  servicioId: string,
  mes: string,
  pagos: PagoMensual[],
): PagoMensual | null {
  return pagos.find(p => p.impuestoId === servicioId && p.mes === mes && p.pagado) ?? null
}

/**
 * Las salidas del libro que pueden ir a Impuestos y Servicios, con el servicio
 * propuesto y en qué estado está ese pago del otro lado.
 *
 * `todas` en false (lo normal) deja solo las que matchean un servicio cargado o
 * suenan a impuesto/servicio; en true muestra cada salida, para asignar a mano
 * la que el texto no delató.
 */
export function impuestosDelLibro(
  movimientos: LibroCajaMovimiento[],
  servicios: ImpuestoServicio[],
  pagos: PagoMensual[],
  todas = false,
): ImpuestoDelLibro[] {
  const porOrigen = new Map(pagos.filter(p => p.origenLibro).map(p => [p.origenLibro!, p]))

  return movimientos
    .filter(puedeIrAImpuestos)
    .map(mov => {
      const clave = claveMovimiento(mov)
      const servicioSugerido = matchServicio(mov, servicios)
      const mes = mov.fecha.slice(0, 7)
      const enviado = porOrigen.get(clave) ?? null

      let pendienteAMarcar: PagoMensual | null = null
      let yaPagado: PagoMensual | null = null
      if (servicioSugerido && !enviado) {
        pendienteAMarcar = pendienteDe(servicioSugerido.id, mov.fecha, pagos)
        if (!pendienteAMarcar) yaPagado = yaPagadoDe(servicioSugerido.id, mes, pagos)
      }

      return {
        clave, mov, monto: -mov.monto, mes,
        servicioSugerido, enviado, pendienteAMarcar, yaPagado,
      }
    })
    .filter(f => todas || f.enviado || f.servicioSugerido || pareceServicio(f.mov))
}
