import { describe, it, expect } from 'vitest'
import { claveMovimiento, salidasMarcadasPorMes } from '../../src/lib/libroCajaMarcas'
import type { LibroCajaMes, LibroCajaMovimiento } from '../../src/types'

function mov(p: Partial<LibroCajaMovimiento>): LibroCajaMovimiento {
  return {
    fecha: '2026-07-10', conceptoCod: '031', concepto: 'PUBLICIDAD Y PROPAGANDA',
    medioCod: '003', medio: 'BANCOS', monto: -100000, detalle: 'ANUNCIOS', ...p,
  }
}

const mes = (movimientos: LibroCajaMovimiento[]): LibroCajaMes => ({
  mes: '2026-07', archivo: 'x.xls', importadoAt: '', medios: [], movimientos, avisos: [],
})

describe('salidasMarcadasPorMes', () => {
  it('sin marcar nada no suma nada: el mes queda como estaba', () => {
    expect(salidasMarcadasPorMes([mes([mov({}), mov({ monto: -55000 })])], {})).toEqual(new Map())
  })

  it('suma solo los pagos marcados', () => {
    const a = mov({ monto: -100000, detalle: 'ANUNCIOS' })
    const b = mov({ monto: -55000, detalle: 'BOOKING' })
    const r = salidasMarcadasPorMes([mes([a, b])], { [claveMovimiento(a)]: true })
    expect(r.get('2026-07')).toBe(100000)
  })

  it('una entrada marcada no suma: no es una salida', () => {
    const e = mov({ monto: 900000, conceptoCod: '001', concepto: 'CAJA' })
    expect(salidasMarcadasPorMes([mes([e])], { [claveMovimiento(e)]: true })).toEqual(new Map())
  })

  it('la marca sobrevive a subir la planilla de nuevo: la clave sale del contenido', () => {
    // Charo manda el archivo todos los días con las filas nuevas; las viejas
    // vuelven igual y tienen que seguir marcadas.
    const hoy = mov({ monto: -100000, detalle: 'ANUNCIOS' })
    const manana = mov({ monto: -100000, detalle: 'ANUNCIOS' })   // misma fila, otro objeto
    expect(claveMovimiento(hoy)).toBe(claveMovimiento(manana))
    const marcas = { [claveMovimiento(hoy)]: true }
    const nuevo = mes([manana, mov({ fecha: '2026-07-28', monto: -7000, detalle: 'NUEVA' })])
    expect(salidasMarcadasPorMes([nuevo], marcas).get('2026-07')).toBe(100000)
  })

  it('si Charo corrige el importe, esa marca ya no aplica', () => {
    const antes = mov({ monto: -100000 })
    const corregido = mov({ monto: -110000 })
    expect(salidasMarcadasPorMes([mes([corregido])], { [claveMovimiento(antes)]: true })).toEqual(new Map())
  })

  it('cada pago suma en el mes de su fecha', () => {
    const a = mov({ fecha: '2026-06-30', monto: -10000 })
    const b = mov({ fecha: '2026-07-01', monto: -20000 })
    const r = salidasMarcadasPorMes([mes([a, b])], { [claveMovimiento(a)]: true, [claveMovimiento(b)]: true })
    expect(r.get('2026-06')).toBe(10000)
    expect(r.get('2026-07')).toBe(20000)
  })
})
