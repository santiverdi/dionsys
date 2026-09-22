// Cómo se lee el texto escrito a mano del libro de caja de Charo.
//
// El detalle de cada fila es texto libre ("FLORES ROXANA", "EDEA 07/26 F:1234")
// y hay que reconocer a qué se refiere: a un empleado de la nómina o a un
// servicio configurado en Impuestos. Se compara PALABRA POR PALABRA, no la
// cadena entera: el nombre viene dado vuelta, con el mes pegado y con números
// de factura al lado.

/** Sin acentos, en mayúsculas y solo letras: "Roxana Flores" → "ROXANA FLORES". */
export function normalizarNombre(s: string): string {
  return (s || '')
    .normalize('NFD')
    .replace(/[^\x20-\x7E]/g, '')   // saca los acentos que NFD dejó sueltos
    .toUpperCase()
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Palabras que aparecen en el detalle pero no identifican a nadie ni a nada.
// Sin esto, "SUELDO JULIO" haría match con un empleado llamado Julio y "PAGO
// CUOTA" con cualquier servicio que tenga "cuota" en el nombre.
const RUIDO_BASE = [
  'PAGO', 'PAGOS', 'SALDO', 'CUOTA', 'CUOTAS', 'PARTE', 'MES', 'DIAS', 'DIA',
  'FACTURA', 'BOLETA', 'RECIBO', 'COMPROBANTE', 'TOTAL', 'VTO', 'VENCIMIENTO',
  'ENERO', 'FEBRERO', 'MARZO', 'ABRIL', 'MAYO', 'JUNIO', 'JULIO', 'AGOSTO',
  'SEPTIEMBRE', 'SETIEMBRE', 'OCTUBRE', 'NOVIEMBRE', 'DICIEMBRE',
]

/**
 * Palabras del texto que pueden identificar algo: 3+ letras y que no sean ruido.
 * `ruidoExtra` es lo que sobra en cada dominio (los sueldos y los servicios no
 * tienen las mismas muletillas).
 */
export function palabras(s: string, ruidoExtra: readonly string[] = []): string[] {
  const ruido = new Set([...RUIDO_BASE, ...ruidoExtra])
  return normalizarNombre(s).split(' ').filter(w => w.length >= 3 && !ruido.has(w))
}

/**
 * Cuál de los candidatos nombra el texto. Gana el que comparte más palabras.
 *
 * Con una sola palabra en común alcanza SOLO si ningún otro candidato la
 * comparte: "ROXANA" sirve si hay una sola Roxana, y no sirve si hay dos. Un
 * empate no se resuelve solo — devuelve null y decide el usuario.
 */
export function mejorPorPalabras<T>(
  texto: string,
  candidatos: readonly T[],
  nombreDe: (c: T) => string,
  ruidoExtra: readonly string[] = [],
): T | null {
  const buscadas = new Set(palabras(texto, ruidoExtra))
  if (buscadas.size === 0) return null

  const puntajes = candidatos
    .map(c => ({ c, comunes: palabras(nombreDe(c), ruidoExtra).filter(w => buscadas.has(w)).length }))
    .filter(x => x.comunes > 0)
  if (puntajes.length === 0) return null

  const max = Math.max(...puntajes.map(x => x.comunes))
  const mejores = puntajes.filter(x => x.comunes === max)
  return mejores.length === 1 ? mejores[0].c : null
}

/** Días de diferencia entre dos fechas YYYY-MM-DD. */
export function diasEntre(a: string, b: string): number {
  return Math.abs(
    new Date(a + 'T12:00:00').getTime() - new Date(b + 'T12:00:00').getTime(),
  ) / 86_400_000
}
