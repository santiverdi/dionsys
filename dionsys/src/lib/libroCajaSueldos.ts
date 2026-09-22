// Los sueldos que ya están escritos en el libro de caja de Charo, listos para
// mandarlos a la pantalla de Sueldos.
//
// POR QUÉ: el libro tiene TODO lo que se pagó, sueldos incluidos (concepto
// "010 SUELDOS", con el nombre del empleado escrito a mano en el detalle:
// "FLORES ROXANA"). Hasta ahora ese pago solo se podía cargar en Sueldos
// escaneando el recibo. Se sube la planilla igual todos los días, así que la
// plata ya está escrita: lo único que falta es decir de quién es.
//
// LO QUE HACE ACÁ: se lee el detalle, se PROPONE el empleado y el tipo de pago,
// y el usuario confirma. Nada se manda solo — el detalle es texto a mano y una
// propuesta equivocada mete plata en el legajo del que no es.
//
// EL RIESGO REAL ES DUPLICAR: el mismo sueldo puede estar ya cargado en Sueldos
// desde el recibo escaneado. Por eso cada fila se compara contra los pagos que
// ya existen (mismo importe, fecha cercana) y la que tiene un posible espejo
// sale avisada y fuera del envío en lote.

import type {
  EmpleadoNomina, LibroCajaMovimiento, MedioPagoSueldo, PagoSueldo, TipoPagoSueldo,
} from '../types'
import { claveMovimiento } from './libroCajaMarcas'
import { diasEntre, mejorPorPalabras, normalizarNombre } from './libroCajaTexto'

export { normalizarNombre }

// Muletillas del detalle de un sueldo: no son parte del nombre de nadie.
const RUIDO_SUELDOS = [
  'SUELDO', 'SUELDOS', 'ADELANTO', 'ADELANTOS', 'AGUINALDO', 'SAC',
  'VACACIONES', 'QUINCENA', 'PRIMERA', 'SEGUNDA', 'HORAS', 'EXTRAS', 'EXTRA',
  'CARGAS', 'SOCIALES', 'PERSONAL', 'SRA', 'SR', 'SENORA',
]

/**
 * A quién apunta el detalle escrito a mano. El nombre puede venir dado vuelta
 * ("FLORES ROXANA" por "Roxana Flores") y con texto de más, así que se comparan
 * palabras sueltas, no la cadena entera.
 */
export function matchEmpleado(
  detalle: string,
  empleados: EmpleadoNomina[],
): EmpleadoNomina | null {
  return mejorPorPalabras(detalle, empleados, e => e.nombre, RUIDO_SUELDOS)
}

/** Qué clase de pago parece, por lo que escribió Charo. Default: sueldo. */
export function tipoSugerido(detalle: string, concepto = ''): TipoPagoSueldo {
  const t = normalizarNombre(`${detalle} ${concepto}`)
  if (/\bCARGAS\b|\bAFIP\b|\bVEP\b/.test(t)) return 'cargas'
  if (/\bADELANTO/.test(t)) return 'adelanto'
  if (/\bAGUINALDO\b|\bSAC\b/.test(t)) return 'aguinaldo'
  if (/\bVACACION/.test(t)) return 'vacaciones'
  if (/\bEXTRA|\bHORAS\b/.test(t)) return 'extra'
  return 'sueldo'
}

/** El medio del libro (EFECTIVO / BANCOS / TARJETAS) en el que usa Sueldos. */
export function medioSugerido(medio: string): MedioPagoSueldo {
  return /EFECTIVO/i.test(medio) ? 'efectivo' : 'transferencia'
}

/**
 * ¿Esta fila del libro es costo laboral? Manda el código, el texto es el
 * respaldo. Las CARGAS SOCIALES entran acá y no en Impuestos: el VEP de
 * seguridad social es parte del costo laboral del mes y se guarda como
 * `PagoSueldo` tipo 'cargas' (ver el modelo de la pantalla Sueldos).
 *
 * "AFIP" a secas NO alcanza: puede ser IVA o Ganancias, que sí son impuestos.
 */
export function esMovimientoSueldo(mov: LibroCajaMovimiento): boolean {
  if (mov.monto >= 0) return false
  if (mov.conceptoCod === '010') return true
  const crudo = `${mov.concepto} ${mov.detalle}`.toUpperCase()
  const t = normalizarNombre(crudo)
  if (/SUELDO|JORNAL|AGUINALDO/.test(t)) return true
  if (/CARGAS? SOCIAL|SEGURIDAD SOCIAL/.test(t)) return true
  // El formulario del VEP de seguridad social. Va contra el texto crudo porque
  // `normalizarNombre` saca los números.
  return /\bF\.? ?931\b/.test(crudo)
}

export interface SueldoDelLibro {
  clave: string                        // clave estable de la fila (libroCajaMarcas)
  mov: LibroCajaMovimiento
  monto: number                        // positivo: lo que salió
  empleadoSugerido: EmpleadoNomina | null
  tipo: TipoPagoSueldo
  medio: MedioPagoSueldo
  mes: string                          // YYYY-MM del pago (el mes en que salió la plata)
  enviado: PagoSueldo | null           // ya se mandó desde acá
  posibleDuplicado: PagoSueldo | null  // ya hay un pago igual cargado de otra forma
}

/**
 * Las filas de sueldo del mes con todo lo necesario para decidir: quién parece
 * ser, qué tipo de pago es y si ya está cargado en Sueldos.
 */
export function sueldosDelLibro(
  movimientos: LibroCajaMovimiento[],
  empleados: EmpleadoNomina[],
  pagos: PagoSueldo[],
  toleranciaDias = 10,
): SueldoDelLibro[] {
  const porOrigen = new Map(pagos.filter(p => p.origenLibro).map(p => [p.origenLibro!, p]))

  return movimientos.filter(esMovimientoSueldo).map(mov => {
    const clave = claveMovimiento(mov)
    const monto = -mov.monto
    const enviado = porOrigen.get(clave) ?? null
    // Un pago cargado por otro lado (recibo escaneado, carga a mano) que se
    // parece a esta fila: mismo importe y fecha cercana.
    const posibleDuplicado = enviado ? null : (pagos.find(p =>
      !p.origenLibro
      && Math.abs(p.monto - monto) <= 1
      && diasEntre(p.fecha, mov.fecha) <= toleranciaDias,
    ) ?? null)

    return {
      clave,
      mov,
      monto,
      empleadoSugerido: matchEmpleado(mov.detalle, empleados),
      tipo: tipoSugerido(mov.detalle, mov.concepto),
      medio: medioSugerido(mov.medio),
      mes: mov.fecha.slice(0, 7),
      enviado,
      posibleDuplicado,
    }
  })
}
