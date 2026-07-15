import { describe, it, expect } from 'vitest'
import { parseParteItems, parteFromExtracted, type PdfTextItem } from '../../src/lib/parsePartePdf'
import type { ExtractedParte } from '../../src/lib/invoiceExtract'
import { getParteResumen, getParteFlags, getCheckouts } from '../../src/lib/parteControl'
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

describe('parseParteItems — encabezado con etiqueta pegada al valor', () => {
  // Algunos PDFs emiten "Fecha caja: 22/06/2026 06:46" como UN solo ítem de
  // texto. Con el match exacto viejo, el corte por x fallaba y el usuario se
  // llevaba pegada toda la fecha (aparecía como conserje fantasma en el ranking).
  const base = (extra: PdfTextItem[]): PdfTextItem[] => [
    { x: 10, y: 10, str: 'Parte Diario' },
    { x: 120, y: 10, str: 'Caja 93' },
    ...extra,
    { x: 10, y: 30, str: 'Habitación' },
    { x: 10, y: 50, str: 'Total habitaciones ocupadas' },
    { x: 200, y: 50, str: '0' },
    { x: 10, y: 55, str: 'Total plazas ocupadas' },
    { x: 200, y: 55, str: '0' },
    { x: 10, y: 60, str: 'Total habitaciones libres' },
    { x: 200, y: 60, str: '0' },
  ]

  it('no pega la fecha del encabezado en el usuario (queda vacío, no basura)', () => {
    const p = parseParteItems(base([
      { x: 200, y: 10, str: 'Usuario:' },
      { x: 260, y: 10, str: 'Fecha caja: 22/06/2026 06:46' },
      { x: 500, y: 10, str: 'Fecha/hora emisión : Jun 22, 2026 06:48' },
    ]), 'Test')
    expect(p.usuario).toBe('')
    expect(p.conserje).toBeUndefined()
    // La fecha igual se lee del ítem combinado, y el turno sale de la hora.
    expect(new Date(p.fechaCaja).getFullYear()).toBe(2026)
    expect(p.turno).toBe('manana')
  })

  it('lee el usuario aunque venga pegado a la etiqueta ("Usuario: Gaston")', () => {
    const p = parseParteItems(base([
      { x: 200, y: 10, str: 'Usuario: Gaston' },
      { x: 400, y: 10, str: 'Fecha caja: 22/06/2026 22:46' },
    ]), 'Test')
    expect(p.usuario).toBe('Gaston')
    expect(p.conserje).toBe('Gaston')
    expect(p.turno).toBe('noche')
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

describe('parteFromExtracted (lectura por IA)', () => {
  const ex: ExtractedParte = {
    nroCaja: '80', usuario: 'Touriño Leandro', fechaCaja: '10/02/2026 06:52',
    ocupadas: [
      { habitacion: '201', reserva: '2946', plazas: '2', canal: 'Booking.com' },
      { habitacion: '704', reserva: '3041', plazas: '2', canal: 'Booking.com' },
    ],
    libres: [
      { habitacion: '302', estado: 'Limpia' },
      { habitacion: '204', estado: 'sucia' },
      { habitacion: '1102', estado: 'Mantenimiento' },
    ],
    totalOcupadas: '2', totalPlazas: '4', totalLibres: '3',
  }

  it('mapea los campos y deriva turno/conserje', () => {
    const p = parteFromExtracted(ex, 'Test', 'foto.jpg')
    expect(p.nroCaja).toBe(80)
    expect(p.turno).toBe('manana')
    expect(p.conserje).toBe('Leandro')
    expect(p.ocupadas).toHaveLength(2)
    expect(p.ocupadas[0].plazas).toBe(2)
    expect(p.sucias).toBe(1)
    expect(p.limpias).toBe(1)
    expect(p.mantenimiento).toBe(1)
    expect(p.sourceFileName).toBe('foto.jpg')
  })

  it('tira error si la IA no leyó el Nro. de Caja', () => {
    expect(() => parteFromExtracted({ ...ex, nroCaja: '' }, 'Test')).toThrow(/Nro\. de Caja/)
  })

  it('descarta el usuario basura que a veces devuelve la IA (fecha del encabezado)', () => {
    const p = parteFromExtracted({
      ...ex,
      usuario: 'Fecha caja: 05/07/2026 06:48: Fecha/hora emisión : Jul 5, 2026 06:50',
    }, 'Test')
    expect(p.usuario).toBe('')
    expect(p.conserje).toBeUndefined()
    expect(p.turno).toBe('manana') // derivado de la hora de fechaCaja
  })
})

describe('getParteFlags / getCheckouts (cruce con caja)', () => {
  const parte = parseParteItems(ITEMS, 'Test')

  // Parte "anterior" con una habitación extra (reserva 9999) que ya no figura
  // ocupada en el parte actual → es un check-out.
  const anterior = {
    ...parte,
    id: 'prev',
    ocupadas: [...parte.ocupadas, { habitacion: '999', reserva: '9999', plazas: 2, canal: 'Walk In' }],
  }
  const cajaBase: CajaParte = {
    id: 'c1', nroCaja: 79, puntoVenta: 'Recepcion', moneda: 'AR$', usuarioApertura: 'x', turno: 'manana',
    aperturaAt: '2026-02-10T00:00:00.000Z', aperturaMonto: 0, saldoFinal: 0,
    ingresos: [], egresos: [], retiros: [], importedBy: 't', importedAt: '',
  }

  it('sin parte anterior, pide importarlo', () => {
    const flags = getParteFlags(parte)
    expect(flags.some(f => f.tipo === 'sin_parte_anterior')).toBe(true)
    expect(getCheckouts(parte)).toHaveLength(0)
  })

  it('detecta el check-out y lo marca sin cobro si la reserva no aparece en caja', () => {
    const outs = getCheckouts(parte, anterior, [cajaBase])
    const co = outs.find(c => c.reserva === '9999')
    expect(co).toBeDefined()
    expect(co!.habitaciones).toContain('999')
    expect(co!.cobro).toBeUndefined()
  })

  it('marca el check-out como cobrado e indica caja, medio de pago y monto', () => {
    const cajaConCobro: CajaParte = {
      ...cajaBase,
      ingresos: [{
        fechaHora: '2026-02-09T12:00:00.000Z', usuario: 'x', comp: 'FB 1-1', habitacion: '999',
        observacion: 'Reserva 9999 - Juan Perez', efectivo: 0, tarjetas: 1000, cheques: 0,
        transferencia: 0, otros: 0, total: 1000, reserva: '9999', pasajero: 'Juan Perez',
      }],
    }
    const co = getCheckouts(parte, anterior, [cajaConCobro]).find(c => c.reserva === '9999')
    expect(co!.cobro).toBeDefined()
    expect(co!.cobro!.nroCaja).toBe(79)
    expect(co!.cobro!.monto).toBe(1000)
    expect(co!.cobro!.medioPago).toBe('Tarjeta')
    expect(co!.cobro!.pasajero).toBe('Juan Perez')
  })

  it('un cambio de habitación (misma reserva, otra hab) NO es check-out', () => {
    const ocup = (hab: string, reserva: string) => ({ habitacion: hab, reserva, plazas: 2, canal: 'Walk In' })
    const prev = { ...parte, id: 'prev', ocupadas: [ocup('101', '500')] }
    const actual = { ...parte, ocupadas: [ocup('205', '500')] } // misma reserva, otra hab
    expect(getCheckouts(actual, prev, [])).toHaveLength(0)
  })

  it('una habitación que se desocupó y entró otra reserva SÍ marca la salida de la anterior', () => {
    const ocup = (hab: string, reserva: string) => ({ habitacion: hab, reserva, plazas: 2, canal: 'Walk In' })
    const prev = { ...parte, id: 'prev', ocupadas: [ocup('101', '500')] }
    const actual = { ...parte, ocupadas: [ocup('101', '600')] } // misma hab, reserva nueva
    const outs = getCheckouts(actual, prev, [])
    expect(outs).toHaveLength(1)
    expect(outs[0].reserva).toBe('500')
    expect(outs[0].habitaciones).toContain('101')
  })
})
