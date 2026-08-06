// Libro de caja de Administración: la plata que se mueve FUERA de la caja del
// conserje.
//
// Charo lo lleva todos los días en su propio Excel (plantilla de libro de caja
// con códigos, un archivo por mes: "CAJA JULIO DION26.xls") y va a seguir
// haciéndolo. Por eso el Excel se IMPORTA tal cual y nadie recarga nada a mano
// — misma regla que la caja del PMS y los grupos del dueño.
//
// FORMA REAL DE LA PLANILLA (verificada contra julio 2026):
//
//   hoja "CAJA"
//     filas 1-3   "Saldo en:" EFECTIVO / TARJETAS / BANCOS + el saldo FINAL
//     fila  6     encabezado: FECHA | Cod.Concep | CONCEPTO | Cod.Valor |
//                 Tipo de Valor | ENTRADAS | SALIDAS | SALDO | ...
//                 y en las columnas de la derecha, los saldos INICIALES
//     fila  7+    un movimiento por fila; la última columna con texto es el
//                 detalle a mano ("GASTON C.44", "PAX: JORGE GENTILE R:578")
//
//   hoja "CODIGOS DE CONCEPTOS"
//     Nro. + Concepto (001 CAJA, 010 SUELDOS, …)
//     Nro. + Tipo de Valor + Saldo Inicial (001 EFECTIVO, 002 TARJETAS, 003 BANCOS)
//
// EL MONTO SALE DE ENTRADAS/SALIDAS, no de las columnas auxiliares de la
// derecha: así el lector no depende de en qué columna cayó cada medio. Los
// saldos que declara la planilla se usan de CONTROL — si la cuenta no da igual,
// se avisa en vez de mostrar un número que nadie chequeó.
//
// OJO: los códigos "001 CAJA" y "002 CAJA DEBITO" son el efectivo y las
// tarjetas que vienen de la caja del conserje, que el sistema YA tiene cargados
// por su lado (retiros e ingresos del Excel de caja). Son la misma plata vista
// desde el otro lado del mostrador: este libro se lee aparte y no se suma a
// aquello, para no contar dos veces.

import * as XLSX from 'xlsx'
import type { LibroCajaMedio, LibroCajaMes, LibroCajaMovimiento } from '../types'

type Cell = string | number | boolean | Date | null | undefined
type Aoa = Cell[][]

/** Número de una celda: los importes ya vienen numéricos, el texto es el respaldo. */
function num(c: Cell): number {
  if (typeof c === 'number') return c
  const s = String(c ?? '').replace(/[^0-9,.-]/g, '')
  if (!s) return 0
  // "4,732,450.00" (coma = miles) vs "4.732.450,00" (coma = decimales).
  const limpio = s.lastIndexOf(',') > s.lastIndexOf('.')
    ? s.replace(/\./g, '').replace(',', '.')
    : s.replace(/,/g, '')
  const n = Number(limpio)
  return isNaN(n) ? 0 : n
}

const txt = (c: Cell): string => String(c ?? '').replace(/\s+/g, ' ').trim()

/**
 * Fecha a YYYY-MM-DD sin pasar por `new Date()` con el número de serie: hacerlo
 * corre la fecha un día según la zona horaria del equipo.
 */
function fechaDe(c: Cell): string {
  if (typeof c === 'number') {
    const d = XLSX.SSF.parse_date_code(c)
    if (!d) return ''
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  if (c instanceof Date) {
    return `${c.getFullYear()}-${String(c.getMonth() + 1).padStart(2, '0')}-${String(c.getDate()).padStart(2, '0')}`
  }
  const s = txt(c)
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : ''
}

/** Los códigos de la planilla son "00010" o 10; adentro se usan de 3 dígitos. */
function cod(c: Cell): string {
  const s = txt(c).replace(/\D/g, '')
  if (!s) return ''
  return String(Number(s)).padStart(3, '0')
}

const round = (n: number) => Math.round(n * 100) / 100

interface Codigos {
  conceptos: Map<string, string>
  medios: { cod: string; nombre: string; saldoInicial: number }[]
}

/**
 * Lee la hoja de códigos: qué es cada concepto y qué medios de pago hay.
 * Los dos bloques se ubican por su encabezado ("Concepto" y "Tipo de Valor"),
 * no por número de columna: si la plantilla se corre, sigue funcionando. En
 * cada bloque, el código va en la columna de la izquierda y el saldo inicial
 * del medio en la de la derecha.
 */
function leerCodigos(aoa: Aoa): Codigos {
  const conceptos = new Map<string, string>()
  const medios: Codigos['medios'] = []

  let filaHead = -1, colConcepto = -1, colValor = -1
  for (let i = 0; i < aoa.length; i++) {
    const r = aoa[i] ?? []
    const c = r.findIndex(x => /^concepto$/i.test(txt(x)))
    const v = r.findIndex(x => /tipo de valor/i.test(txt(x)))
    if (c >= 0 || v >= 0) { filaHead = i; colConcepto = c; colValor = v; break }
  }
  if (filaHead < 0) return { conceptos, medios }

  for (let i = filaHead + 1; i < aoa.length; i++) {
    const r = aoa[i] ?? []
    if (colConcepto > 0) {
      const c = cod(r[colConcepto - 1])
      const nombre = txt(r[colConcepto])
      if (c && nombre) conceptos.set(c, nombre)
    }
    if (colValor > 0) {
      const c = cod(r[colValor - 1])
      const nombre = txt(r[colValor])
      if (c && nombre && !medios.some(m => m.cod === c)) {
        medios.push({ cod: c, nombre, saldoInicial: num(r[colValor + 1]) })
      }
    }
  }
  return { conceptos, medios }
}

/** Encuentra la fila de encabezado (la que dice FECHA) y en qué columna cae cada dato. */
function leerEncabezado(aoa: Aoa) {
  for (let i = 0; i < aoa.length; i++) {
    const r = aoa[i] ?? []
    const idx = (re: RegExp) => r.findIndex(c => re.test(txt(c)))
    const fecha = idx(/^fecha$/i)
    if (fecha < 0) continue
    const entradas = idx(/entrada/i)
    const salidas = idx(/salida/i)
    if (entradas < 0 || salidas < 0) continue
    return {
      fila: i,
      fecha,
      codConcepto: idx(/cod.*concep/i),
      concepto: idx(/^concepto$/i),
      codValor: idx(/cod.*valor/i),
      entradas,
      salidas,
      saldo: idx(/^saldo$/i),
    }
  }
  return null
}

/** Saldos finales que declara la planilla arriba de todo ("Saldo en: EFECTIVO"). */
function leerSaldosDeclarados(aoa: Aoa, hastaFila: number, medios: Codigos['medios']): Map<string, number> {
  const out = new Map<string, number>()
  for (let i = 0; i < hastaFila; i++) {
    const r = aoa[i] ?? []
    const linea = r.map(txt).join(' ').toUpperCase()
    for (const m of medios) {
      if (out.has(m.cod) || !linea.includes(m.nombre.toUpperCase())) continue
      // El importe es el último número de la fila.
      for (let j = r.length - 1; j >= 0; j--) {
        const v = num(r[j])
        if (v !== 0) { out.set(m.cod, v); break }
      }
    }
  }
  return out
}

export function parseLibroCajaRows(
  caja: Aoa,
  codigosAoa: Aoa,
  archivo: string,
  importadoBy?: string,
): LibroCajaMes {
  const head = leerEncabezado(caja)
  if (!head) {
    throw new Error('No encontré el encabezado del libro de caja (la fila con FECHA, ENTRADAS y SALIDAS).')
  }
  const { conceptos, medios } = leerCodigos(codigosAoa)
  const avisos: string[] = []
  if (medios.length === 0) {
    avisos.push('No encontré la hoja de códigos: los medios de pago salen numerados y sin saldo inicial.')
  }

  // Los saldos iniciales también están a la derecha del encabezado; si la hoja
  // de códigos no los trajo, se usan esos (en el mismo orden que los medios).
  const inicialesEnHeader = (caja[head.fila] ?? [])
    .map((c, i) => ({ i, v: num(c) }))
    .filter(x => x.i > head.saldo && head.saldo >= 0)
  medios.forEach((m, k) => {
    if (m.saldoInicial === 0 && inicialesEnHeader[k]) m.saldoInicial = inicialesEnHeader[k].v
  })

  const movimientos: LibroCajaMovimiento[] = []
  let salteadas = 0
  for (let i = head.fila + 1; i < caja.length; i++) {
    const r = caja[i] ?? []
    const fecha = fechaDe(r[head.fecha])
    if (!fecha) continue
    const entrada = num(r[head.entradas])
    const salida = num(r[head.salidas])
    if (entrada === 0 && salida === 0) { salteadas++; continue }

    const medioCod = cod(r[head.codValor])
    const medio = medios.find(m => m.cod === medioCod)
    const conceptoCod = cod(r[head.codConcepto])
    // El detalle no tiene encabezado: es el último texto de la fila. Se descarta
    // por TIPO de celda y no por su contenido, porque el detalle suele traer
    // números adentro ("ALFOMBRA F:070", "PAX: JORGE GENTILE R:578").
    let detalle = ''
    for (let j = r.length - 1; j > head.saldo; j--) {
      const t = txt(r[j])
      if (t && typeof r[j] !== 'number') { detalle = t; break }
    }

    movimientos.push({
      fecha,
      conceptoCod,
      concepto: txt(r[head.concepto]) || conceptos.get(conceptoCod) || 'Sin concepto',
      medioCod,
      medio: medio?.nombre ?? (medioCod ? `Medio ${medioCod}` : 'Sin medio'),
      monto: round(entrada > 0 ? entrada : -salida),
      detalle,
    })
  }
  if (salteadas > 0) avisos.push(`${salteadas} fila(s) con fecha pero sin importe: no se cargaron.`)
  if (movimientos.length === 0) throw new Error('No encontré movimientos en la planilla.')

  // Mes del archivo: el que tiene más movimientos (la planilla es mensual).
  const porMes = new Map<string, number>()
  for (const m of movimientos) porMes.set(m.fecha.slice(0, 7), (porMes.get(m.fecha.slice(0, 7)) ?? 0) + 1)
  const mes = [...porMes.entries()].sort((a, b) => b[1] - a[1])[0][0]
  const deOtroMes = movimientos.length - (porMes.get(mes) ?? 0)
  if (deOtroMes > 0) avisos.push(`${deOtroMes} movimiento(s) con fecha de otro mes: quedan igual dentro de este archivo.`)

  // Un medio por cada uno que aparezca, aunque la hoja de códigos no lo tenga.
  const codsUsados = [...new Set(movimientos.map(m => m.medioCod))]
  for (const c of codsUsados) {
    if (c && !medios.some(m => m.cod === c)) medios.push({ cod: c, nombre: `Medio ${c}`, saldoInicial: 0 })
  }

  const declarados = leerSaldosDeclarados(caja, head.fila, medios)
  const salida: LibroCajaMedio[] = medios.map(m => {
    const suma = movimientos.filter(x => x.medioCod === m.cod).reduce((s, x) => s + x.monto, 0)
    const calculado = round(m.saldoInicial + suma)
    const declarado = declarados.get(m.cod)
    if (declarado != null && Math.abs(declarado - calculado) > 1) {
      avisos.push(
        `${m.nombre}: la planilla dice ${declarado.toLocaleString('es-AR')} y de los movimientos me da ` +
        `${calculado.toLocaleString('es-AR')}. Revisá el archivo, puede faltar una fila.`,
      )
    }
    return {
      cod: m.cod,
      nombre: m.nombre,
      saldoInicial: round(m.saldoInicial),
      ...(declarado != null ? { saldoFinalDeclarado: round(declarado) } : {}),
      saldoFinalCalculado: calculado,
    }
  })

  return {
    mes,
    archivo,
    ...(importadoBy ? { importadoBy } : {}),
    importadoAt: new Date().toISOString(),
    medios: salida,
    movimientos: movimientos.sort((a, b) => a.fecha.localeCompare(b.fecha)),
    avisos,
  }
}

export async function parseLibroCajaExcel(file: File, importadoBy?: string): Promise<LibroCajaMes> {
  const data = new Uint8Array(await file.arrayBuffer())
  const wb = XLSX.read(data, { cellDates: true })

  const nombreCaja = wb.SheetNames.find(n => /^caja$/i.test(n))
    ?? wb.SheetNames.find(n => /caja/i.test(n))
    ?? wb.SheetNames[0]
  const hojaCaja = nombreCaja ? wb.Sheets[nombreCaja] : undefined
  if (!hojaCaja) throw new Error('El archivo no tiene ninguna hoja con movimientos.')

  const nombreCodigos = wb.SheetNames.find(n => /c[oó]digo/i.test(n))
  const hojaCodigos = nombreCodigos ? wb.Sheets[nombreCodigos] : undefined

  const aoa = (s: XLSX.WorkSheet): Aoa => XLSX.utils.sheet_to_json(s, { header: 1, raw: true, defval: '' })
  return parseLibroCajaRows(aoa(hojaCaja), hojaCodigos ? aoa(hojaCodigos) : [], file.name, importadoBy)
}
