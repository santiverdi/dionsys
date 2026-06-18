import { describe, it, expect } from 'vitest'
import { parseParteItems, type PdfTextItem } from '../../src/lib/parsePartePdf'
import { getParteResumen, getParteFlags } from '../../src/lib/parteControl'
import type { CajaParte } from '../../src/types'
import fixture from '../fixtures/parte_caja80.json'

// Ítems posicionados extraídos de un "Parte Diario" real (Caja 80) con pdfjs,
// ya transformados a coordenadas visuales por el viewport.
const ITEMS = fixture as PdfTextItem[]

describe('parseParteItems (Parte Diario PDF)', () => {
  const parte = parseParteItems(ITEMS, 'Test')

  it('lee el encabezado', () => {
    expect(parte.nroCaja).toBe(80)
    expect(parte.usuario).toContain('Leandro')
    expect(parte.conserje).toBe('Leandro')
    expect(parte.fechaCaja).not.toBe('')
  })

  it('coincide con los totales impresos del PDF', () => {
    expect(parte.totalOcupadas).toBe(32)
    expect(parte.totalPlazas).toBe(68)
    expect(parte.totalLibres).toBe(22)
  })

  it('parsea todas las habitaciones ocupadas', () => {
    expect(parte.ocupadas).toHaveLength(32)
    // Suma de plazas de lo parseado = total impreso.
    expect(parte.ocupadas.reduce((a, h) => a + h.plazas, 0)).toBe(68)
  })

  it('cuenta las libres por estado de limpieza', () => {
    expect(parte.libres).toHaveLength(22)
    expect(parte.sucias).toBe(7)
    expect(parte.limpias).toBe(13)
    expect(parte.mantenimiento).toBe(2)
  })

  it('atribuye el canal de reserva a las ocupadas', () => {
    const booking = parte.ocupadas.find(h => h.reserva === '3046' && h.habitacion === '1002')
    expect(booking?.canal).toBe('Booking.com')
    // El grupo "Soluciones See Travel" (reserva 2534) ocupa varias habitaciones.
    const grupo = parte.ocupadas.filter(h => h.reserva === '2534')
    expect(grupo.length).toBeGreaterThanOrEqual(8)
    expect(grupo.every(h => h.canal === 'Soluciones See Travel')).toBe(true)
  })
})

describe('getParteResumen', () => {
  const parte = parseParteItems(ITEMS, 'Test')
  it('calcula el % de ocupación', () => {
    const r = getParteResumen(parte)
    // 32 ocupadas / (32 + 22) = 59%
    expect(r.ocupacionPct).toBe(59)
    expect(r.plazas).toBe(68)
  })
})

describe('getParteFlags (cruce con caja)', () => {
  const parte = parseParteItems(ITEMS, 'Test')

  it('sin parte anterior, pide importarlo', () => {
    const flags = getParteFlags(parte)
    expect(flags.some(f => f.tipo === 'sin_parte_anterior')).toBe(true)
  })

  it('marca el check-out cuya reserva no tiene cobro en caja', () => {
    // Parte "anterior" con una habitación extra (reserva 9999) que ya no figura
    // ocupada en el parte actual → es un check-out.
    const anterior = {
      ...parte,
      id: 'prev',
      ocupadas: [...parte.ocupadas, { habitacion: '999', reserva: '9999', plazas: 2, canal: 'Walk In' }],
    }
    const cajaSinEsaReserva: CajaParte = {
      id: 'c1', nroCaja: 79, puntoVenta: 'Recepcion', moneda: 'AR$', usuarioApertura: 'x',
      aperturaAt: '2026-02-10T00:00:00.000Z', aperturaMonto: 0, saldoFinal: 0,
      ingresos: [], egresos: [], retiros: [], importedBy: 't', importedAt: '',
    }
    const flags = getParteFlags(parte, anterior, [cajaSinEsaReserva])
    expect(flags.some(f => f.tipo === 'checkout_sin_cobro' && f.mensaje.includes('9999'))).toBe(true)
  })

  it('no marca el check-out si la reserva tiene cobro', () => {
    const anterior = {
      ...parte,
      id: 'prev',
      ocupadas: [...parte.ocupadas, { habitacion: '999', reserva: '9999', plazas: 2, canal: 'Walk In' }],
    }
    const cajaConCobro: CajaParte = {
      id: 'c1', nroCaja: 79, puntoVenta: 'Recepcion', moneda: 'AR$', usuarioApertura: 'x',
      aperturaAt: '2026-02-10T00:00:00.000Z', aperturaMonto: 0, saldoFinal: 0,
      ingresos: [{
        fechaHora: '', usuario: 'x', comp: 'FB 1-1', habitacion: '999', observacion: 'Reserva 9999',
        efectivo: 1000, tarjetas: 0, cheques: 0, transferencia: 0, otros: 0, total: 1000, reserva: '9999',
      }],
      egresos: [], retiros: [], importedBy: 't', importedAt: '',
    }
    const flags = getParteFlags(parte, anterior, [cajaConCobro])
    expect(flags.some(f => f.tipo === 'checkout_sin_cobro')).toBe(false)
  })
})
