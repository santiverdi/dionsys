import { useCallback, useEffect, useMemo, useState } from 'react'
import { fetchTarifarioPublicado, type TarifarioPublico } from './landing'
import { useCloudSync } from './cloudStore'
import { KEY_PROMO_ANTICIPADA, leerPromoAnticipada, validarPromoAnticipada, type PromoAnticipada } from './tarifaDiaria'
import {
  KEY_AJUSTES_TARIFA, KEY_ESTADIAS_MINIMAS, especialesConAjustes, leerAjustes, leerEstadiasMinimas,
  type AjustesTarifa, type EstadiaMinima,
} from './tarifasEspeciales'
import { KEY_PROMOS, leerPromosGuardadas, promosVigentes, validarPromos, type Promo } from './promos'
import { KEY_AGREGADOS, leerAgregados, validarAgregados, type Agregado } from './agregados'
import { KEY_PROTECCIONES, leerProtecciones, validarProtecciones, type ProteccionesTarifa } from './proteccionesTarifa'

// Todo lo que hace falta para cotizar, al día con la nube: el tarifario
// publicado, los ajustes por día, las estadías mínimas, las promos y las
// protecciones. Lo usa la pantalla Promos (el calendario de Tarifas carga lo
// mismo por su cuenta).

export interface DatosTarifas {
  tarifario: TarifarioPublico | null
  errorTarifario: string | null
  ajustes: AjustesTarifa
  especiales: ReturnType<typeof especialesConAjustes>
  estadias: EstadiaMinima[]
  /** La lista guardada en la nube; null = todavía no se guardó (se cotiza con las de siempre). */
  promosGuardadas: Promo[] | null
  anticipadaVieja: PromoAnticipada | null
  promos: Promo[]
  protecciones: ProteccionesTarifa
  agregados: Agregado[]
}

export function useDatosTarifas(): DatosTarifas {
  const [tarifario, setTarifario] = useState<TarifarioPublico | null>(null)
  const [errorTarifario, setErrorTarifario] = useState<string | null>(null)
  useEffect(() => {
    let activo = true
    void fetchTarifarioPublicado().then(({ tarifario: t, error }) => {
      if (!activo) return
      setTarifario(t)
      setErrorTarifario(t ? null : error ?? 'No hay tarifario publicado todavía.')
    })
    return () => { activo = false }
  }, [])

  const [ajustes, setAjustes] = useState<AjustesTarifa>(leerAjustes)
  useCloudSync<AjustesTarifa>(KEY_AJUSTES_TARIFA, useCallback(v => setAjustes(v && typeof v === 'object' ? v : {}), []))
  const [estadias, setEstadias] = useState<EstadiaMinima[]>(leerEstadiasMinimas)
  useCloudSync<EstadiaMinima[]>(KEY_ESTADIAS_MINIMAS, useCallback(v => setEstadias(Array.isArray(v) ? v : []), []))
  const [anticipadaVieja, setAnticipadaVieja] = useState<PromoAnticipada | null>(leerPromoAnticipada)
  useCloudSync<unknown>(KEY_PROMO_ANTICIPADA, useCallback(v => setAnticipadaVieja(validarPromoAnticipada(v)), []))
  const [promosGuardadas, setPromosGuardadas] = useState<Promo[] | null>(leerPromosGuardadas)
  useCloudSync<unknown>(KEY_PROMOS, useCallback(v => setPromosGuardadas(validarPromos(v)), []))
  const [protecciones, setProtecciones] = useState<ProteccionesTarifa>(leerProtecciones)
  useCloudSync<unknown>(KEY_PROTECCIONES, useCallback(v => setProtecciones(validarProtecciones(v)), []))

  const [agregados, setAgregados] = useState<Agregado[]>(leerAgregados)
  useCloudSync<unknown>(KEY_AGREGADOS, useCallback(v => setAgregados(validarAgregados(v)), []))

  const especiales = useMemo(() => especialesConAjustes(ajustes), [ajustes])
  const promos = useMemo(() => promosVigentes(promosGuardadas, anticipadaVieja), [promosGuardadas, anticipadaVieja])

  return { tarifario, errorTarifario, ajustes, especiales, estadias, promosGuardadas, anticipadaVieja, promos, protecciones, agregados }
}
