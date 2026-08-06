import { describe, it, expect } from 'vitest'
import { parseLibroCajaRows } from '../../src/lib/parseLibroCaja'
import { motivoNoContar, avisoConcepto, salidasMarcadasPorMes, yaEnSistema } from '../../src/lib/libroCajaConceptos'

// Copia reducida de la planilla real de Charo ("CAJA JULIO DION26.xls"): mismas
// columnas, mismos códigos y los mismos saldos declarados arriba de todo.
// Las filas de datos son textuales del archivo (con los montos cambiados).

const CODIGOS = [
  ['', 'Nro.', 'Concepto', '', 'Nro.', 'Tipo de Valor', 'Saldo Inicial', ''],
  ['', '00001', 'CAJA', '', '00001', 'EFECTIVO', ' 1,000.00 Pts ', ''],
  ['', '00002', 'CAJA DEBITO', '', '00002', 'TARJETAS', ' -   Pts ', ''],
  ['', '00003', 'BANCO PROVINCIA', '', '00003', 'BANCOS', ' 5,000.00 Pts ', ''],
  ['', '00010', 'SUELDOS', '', 'Fondo Fijo', '', '', ''],
  ['', '00020', 'GASTOS POR MANTENIMIENTO', '', '', '', '', ''],
]

// fila: FECHA | Cod.Concep | CONCEPTO | Cod.Valor | Tipo | ENTRADAS | SALIDAS | SALDO | aux… | detalle
function fila(fecha: number, codC: string, concepto: string, codV: string, entrada: number, salida: number, detalle = '') {
  return [fecha, codC, concepto, codV, '', entrada, salida, 0, '', '', '', detalle]
}

// Números de serie de Excel: 46205 = 2026-07-02.
const CAJA = [
  ['', '', '', 'Saldo en:', '', '', ' EFECTIVO 1 ', 1700, '', '', '', ''],
  ['', '', '', 'Saldo en:', '', '', ' TARJETAS 2 ', 300, '', '', '', ''],
  ['', '', '', 'Saldo en:', '', '', ' BANCOS 3 ', 3000, '', '', '', ''],
  ['', '', '', '', '', '', '', '', '', '', '', ''],
  ['', '', '', '', '', '', '', '', '', '', '', ''],
  ['FECHA', 'Cod.\nConcep', 'CONCEPTO', 'Cod.\nValor', 'Tipo de Valor', ' ENTRADAS ', ' SALIDAS ', ' SALDO ', 1000, 0, 5000, ''],
  fila(46205, '020', 'GASTOS POR MANTENIMIENTO', '001', 0, 300, 'ALFOMBRA F:070'),
  fila(46206, '001', 'CAJA', '001', 1000, 0, 'GASTON C.44'),
  fila(46206, '002', 'CAJA DEBITO', '002', 300, 0, '3/7 SANTIAGO C.41'),
  fila(46207, '010', 'SUELDOS', '003', 0, 2000, 'FLORES ROXANA'),
]

describe('parseLibroCajaRows', () => {
  const r = parseLibroCajaRows(CAJA, CODIGOS, 'CAJA JULIO DION26.xls', 'Santiago')

  it('lee el mes, los movimientos y el detalle escrito a mano', () => {
    expect(r.mes).toBe('2026-07')
    expect(r.movimientos).toHaveLength(4)
    expect(r.movimientos[0]).toEqual({
      fecha: '2026-07-02',
      conceptoCod: '020',
      concepto: 'GASTOS POR MANTENIMIENTO',
      medioCod: '001',
      medio: 'EFECTIVO',
      monto: -300,
      detalle: 'ALFOMBRA F:070',
    })
  })

  it('el detalle con numeros adentro no se confunde con un importe', () => {
    expect(r.movimientos[2].detalle).toBe('3/7 SANTIAGO C.41')
  })

  it('la salida queda negativa y la entrada positiva', () => {
    expect(r.movimientos.find(m => m.concepto === 'SUELDOS')!.monto).toBe(-2000)
    expect(r.movimientos.find(m => m.concepto === 'CAJA')!.monto).toBe(1000)
  })

  it('calcula el saldo de cada medio y cierra con el que declara la planilla', () => {
    const ef = r.medios.find(m => m.nombre === 'EFECTIVO')!
    expect(ef.saldoInicial).toBe(1000)
    expect(ef.saldoFinalCalculado).toBe(1700)     // 1000 − 300 + 1000
    expect(ef.saldoFinalDeclarado).toBe(1700)

    const ba = r.medios.find(m => m.nombre === 'BANCOS')!
    expect(ba.saldoFinalCalculado).toBe(3000)     // 5000 − 2000
    expect(r.avisos).toEqual([])
  })

  it('avisa cuando la cuenta no da lo que dice la planilla', () => {
    const roto = CAJA.map(f => [...f])
    roto[0][7] = 999999                            // el saldo declarado ya no cierra
    const out = parseLibroCajaRows(roto, CODIGOS, 'x.xls')
    expect(out.avisos.some(a => a.includes('EFECTIVO'))).toBe(true)
  })

  it('sin hoja de codigos igual lee los movimientos, con los medios numerados', () => {
    const out = parseLibroCajaRows(CAJA, [], 'x.xls')
    expect(out.movimientos).toHaveLength(4)
    expect(out.medios.map(m => m.nombre)).toContain('Medio 001')
    expect(out.avisos.some(a => a.includes('hoja de códigos'))).toBe(true)
  })

  it('se planta si el archivo no es un libro de caja', () => {
    expect(() => parseLibroCajaRows([['hola', 'mundo']], [], 'x.xls')).toThrow(/encabezado/i)
  })
})

// La tabla de sugerencias es una regla de negocio: si mañana alguien la afloja,
// los sueldos entrarían por dos lados al mismo tiempo.
describe('qué conceptos NO se cuentan como salida', () => {
  it('los rubros que tienen su propia pantalla dicen cuál es', () => {
    expect(yaEnSistema('010')?.pantalla).toBe('Sueldos')              // SUELDOS
    expect(yaEnSistema('011')?.pantalla).toBe('Sueldos')              // ADELANTO DE SUELDO
    expect(yaEnSistema('006')?.pantalla).toMatch(/Impuestos/)         // IMPUESTOS
    expect(yaEnSistema('007')?.pantalla).toMatch(/Impuestos/)         // SERVICIOS
    expect(yaEnSistema('023')?.rubro).toBe('profesionales')           // HONORARIOS
    expect(yaEnSistema('020')?.rubro).toBe('mantenimiento')           // MANTENIMIENTO
    expect(yaEnSistema('013')?.rubro).toBe('compras')                 // INSUMOS DESAYUNADOR
  })

  it('esos rubros NO se descartan de fábrica: se decide con lo cargado del otro lado', () => {
    // Si en Sueldos ese mes no se cargó nada, este libro es el único que lo tiene:
    // por eso el motivo fijo está vacío y la pantalla muestra el cruce del mes.
    expect(motivoNoContar('010')).toBe('')
    expect(motivoNoContar('020')).toBe('')
  })

  it('la plata que entra de la caja del conserje no es una salida', () => {
    expect(motivoNoContar('001')).toBeTruthy()          // CAJA
    expect(motivoNoContar('002')).toBeTruthy()          // CAJA DEBITO
    expect(motivoNoContar('014')).toBeTruthy()          // SEÑAS
  })

  it('los conceptos con nombre de persona quedan marcados para mirarlos', () => {
    expect(avisoConcepto('027')).toMatch(/due/i)        // SANTI
    expect(motivoNoContar('027')).toBe('')              // pero no se decide solo
  })

  it('un concepto cualquiera no trae sugerencia: lo decide el usuario', () => {
    expect(motivoNoContar('031')).toBe('')              // PUBLICIDAD Y PROPAGANDA
    expect(avisoConcepto('031')).toBe('')
  })
})

describe('salidasMarcadasPorMes', () => {
  const julio = parseLibroCajaRows(CAJA, CODIGOS, 'x.xls')

  it('sin nada marcado no suma nada: el resultado del mes queda igual', () => {
    expect(salidasMarcadasPorMes([julio], {})).toEqual(new Map())
  })

  it('suma solo los conceptos marcados', () => {
    const r = salidasMarcadasPorMes([julio], { '020': true })
    expect(r.get('2026-07')).toBe(300)          // solo mantenimiento
    const r2 = salidasMarcadasPorMes([julio], { '020': true, '010': true })
    expect(r2.get('2026-07')).toBe(2300)        // + sueldos
  })

  it('marcar un concepto que solo tiene entradas no suma: no es una salida', () => {
    expect(salidasMarcadasPorMes([julio], { '001': true })).toEqual(new Map())
  })

  it('un concepto marcado en falso no suma', () => {
    expect(salidasMarcadasPorMes([julio], { '020': false })).toEqual(new Map())
  })
})
