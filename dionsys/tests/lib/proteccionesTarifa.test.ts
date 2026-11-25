import { describe, it, expect } from 'vitest'
import {
  PROTECCIONES_DEFECTO, avisosAlGuardarAjustes, avisosAlGuardarEstadias, avisosDePrecio, avisosFindeLargo,
  fechasCambiadas, peorDescuento, validarProtecciones, type ContextoAvisos,
} from '../../src/lib/proteccionesTarifa'
import { validarPromoAnticipada } from '../../src/lib/tarifaDiaria'
import type { TarifarioPublico } from '../../src/lib/landing'
import { especialesConAjustes, type AjustesTarifa, type EstadiaMinima } from '../../src/lib/tarifasEspeciales'
import tarifarioProd from '../fixtures/produccion_2026-11-25/tarifario_publico.json'
import ajustesProd from '../fixtures/produccion_2026-11-25/tarifas_dia.json'
import promoProd from '../fixtures/produccion_2026-11-25/promo_anticipada.json'

const t = tarifarioProd as unknown as TarifarioPublico
const ajustes = ajustesProd as AjustesTarifa
const anticipada = validarPromoAnticipada(promoProd)
const ctx = (config = PROTECCIONES_DEFECTO): ContextoAvisos => ({ tarifario: t, estadias: [], anticipada, config })

const con = (cambios: AjustesTarifa): AjustesTarifa => ({ ...ajustes, ...cambios })

describe('validarProtecciones', () => {
  it('sin nada guardado: piso 0 (apagado), tope 25%, relación 1,85', () => {
    expect(validarProtecciones(null)).toEqual({ pisoPorPersona: 0, topeDescuento: 0.25, relacionSingle: 1.85 })
  })
  it('valores fuera de rango vuelven a los de por defecto', () => {
    expect(validarProtecciones({ pisoPorPersona: -5, topeDescuento: 1.5, relacionSingle: 3 })).toEqual(PROTECCIONES_DEFECTO)
  })
  it('respeta lo guardado si es válido', () => {
    expect(validarProtecciones({ pisoPorPersona: 30000, topeDescuento: 0.2, relacionSingle: 1.9 }))
      .toEqual({ pisoPorPersona: 30000, topeDescuento: 0.2, relacionSingle: 1.9 })
  })
})

describe('fechasCambiadas', () => {
  it('detecta altas, bajas y cambios', () => {
    const antes: AjustesTarifa = { '2027-01-01': { porPersona: 1 }, '2027-01-02': { porPersona: 2 } }
    const despues: AjustesTarifa = { '2027-01-02': { porPersona: 3 }, '2027-01-03': { minNoches: 2 } }
    expect(fechasCambiadas(antes, despues)).toEqual(['2027-01-01', '2027-01-02', '2027-01-03'])
  })
})

describe('avisos de precio', () => {
  it('single igual a la doble → aviso con la referencia 1,85×', () => {
    const a = avisosDePrecio({ '2027-01-12': { porPersona: 80000, single: 160000 } }, ['2027-01-12'], PROTECCIONES_DEFECTO)
    expect(a).toHaveLength(1)
    expect(a[0]).toContain('12/01')
    expect(a[0]).toContain('1,85 × $80.000 = $148.000')
  })
  it('single más barata que la doble: sin aviso (martes de enero de producción)', () => {
    expect(avisosDePrecio(ajustes, ['2027-01-12'], PROTECCIONES_DEFECTO)).toEqual([])
  })
  it('OJO, dato de producción: vie/sáb de enero la single ES la doble ($168.000 = 2 × $84.000) → avisa', () => {
    const a = avisosDePrecio(ajustes, ['2027-01-15', '2027-01-16'], PROTECCIONES_DEFECTO)
    expect(a).toHaveLength(2)
    expect(a[0]).toContain('$168.000')
  })
  it('debajo del piso → aviso; con piso 0 no avisa', () => {
    const aj: AjustesTarifa = { '2026-12-01': { porPersona: 30000, single: 55000 } }
    expect(avisosDePrecio(aj, ['2026-12-01'], { ...PROTECCIONES_DEFECTO, pisoPorPersona: 35000 })[0]).toContain('debajo del piso de $35.000')
    expect(avisosDePrecio(aj, ['2026-12-01'], PROTECCIONES_DEFECTO)).toEqual([])
  })
  it('muchas noches con el mismo problema se resumen', () => {
    const aj: AjustesTarifa = {}
    for (let d = 1; d <= 10; d++) aj[`2027-01-${String(d).padStart(2, '0')}`] = { porPersona: 50000, single: 100000 }
    const a = avisosDePrecio(aj, Object.keys(aj), PROTECCIONES_DEFECTO)
    expect(a).toHaveLength(7)
    expect(a[6]).toContain('4 avisos más')
  })
})

describe('descuento combinado', () => {
  it('con los precios de producción el peor caso queda debajo del 25%', () => {
    const p = peorDescuento(['2027-01-12'], t, especialesConAjustes(ajustes), [], anticipada)
    expect(p).not.toBeNull()
    expect(p!.descuento).toBeLessThan(0.25)
    expect(p!.descuento).toBeGreaterThan(0.1)   // la 7ma noche gratis o el 15% sí cuentan
  })
  it('con tope 10% avisa y muestra la estadía del peor caso', () => {
    // Mismos valores que en producción, con los campos en otro orden: no es un cambio, no avisa.
    const a = avisosAlGuardarAjustes(ajustes, con({ '2027-01-12': { porPersona: 80000, single: 135000, descEfectivo: 0.1, minNoches: 3 } }),
      ctx({ ...PROTECCIONES_DEFECTO, topeDescuento: 0.1 }))
    expect(a).toEqual([])
    const b = avisosAlGuardarAjustes(ajustes, con({ '2027-01-12': { porPersona: 81000, single: 135000, descEfectivo: 0.1, minNoches: 3 } }),
      ctx({ ...PROTECCIONES_DEFECTO, topeDescuento: 0.1 }))
    expect(b.some(x => x.startsWith('El descuento combinado llega a'))).toBe(true)
  })
  it('un efectivo del 30% supera el tope del 25%', () => {
    const b = avisosAlGuardarAjustes(ajustes, con({ '2026-12-15': { porPersona: 42000, single: 78000, descEfectivo: 0.3, minNoches: 1 } }), ctx())
    expect(b.find(x => x.startsWith('El descuento combinado'))).toContain('30%')
  })
  it('subir un precio normal de diciembre no avisa nada', () => {
    expect(avisosAlGuardarAjustes(ajustes, con({ '2026-12-15': { porPersona: 44000, single: 80000, descEfectivo: 0.1, minNoches: 1 } }), ctx())).toEqual([])
  })
})

describe('mínimo de noches en findes largos', () => {
  const esp = especialesConAjustes(ajustes)
  it('con los datos de producción todos los findes largos son parejos', () => {
    expect(avisosFindeLargo(t, esp, [])).toEqual([])
  })
  it('Inmaculada (4 al 7/12, dos tramos pegados) con un mínimo distinto en el 6/12 → aviso', () => {
    const nuevos = con({ '2026-12-06': { ...ajustes['2026-12-06'], minNoches: 3 } })
    const a = avisosAlGuardarAjustes(ajustes, nuevos, ctx())
    expect(a).toHaveLength(1)
    expect(a[0]).toContain('Inmaculada (04/12 al 07/12)')
    expect(a[0]).toContain('06/12: 3')
  })
  it('una estadía mínima por fechas que pisa solo parte del finde → aviso', () => {
    const e: EstadiaMinima = { id: 'x', nombre: 'Año Nuevo', desde: '2026-12-31', hasta: '2026-12-31', minNoches: 4, activo: true }
    const a = avisosAlGuardarEstadias([e], t, esp)
    expect(a).toHaveLength(1)
    expect(a[0]).toContain('Año Nuevo')
  })
  it('una estadía mínima pareja sobre todo el finde no avisa', () => {
    const e: EstadiaMinima = { id: 'x', nombre: 'Carnaval', desde: '2027-02-05', hasta: '2027-02-08', minNoches: 4, activo: true }
    expect(avisosAlGuardarEstadias([e], t, esp)).toEqual([])
  })
  it('inactiva: no cuenta', () => {
    const e: EstadiaMinima = { id: 'x', nombre: 'Año Nuevo', desde: '2026-12-31', hasta: '2026-12-31', minNoches: 4, activo: false }
    expect(avisosAlGuardarEstadias([e], t, esp)).toEqual([])
  })
})
