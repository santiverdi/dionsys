// Resumen de las métricas propias de la landing (tabla eventos_landing) para
// la pestaña Métricas: embudo, serie diaria, fuentes de tráfico y dispositivos.
// El evento 'reservar' es el lead: cotizó, puso nombre y teléfono y fue a
// WhatsApp (el mismo momento que Meta registra como Lead).

import type { EventoDiario } from './landing'

export interface DiaMetrica {
  dia: string
  visitas: number
  leads: number
}

export interface FuenteMetrica {
  fuente: string
  visitas: number
  leads: number
}

export interface ResumenMetricas {
  visitas: number
  cotizaron: number
  reservaron: number     // leads: tocaron "Reservar por WhatsApp"
  waDirecto: number
  porDia: DiaMetrica[]         // ordenado por fecha ascendente
  fuentes: FuenteMetrica[]     // ordenado por visitas descendente
  dispositivos: { dispositivo: string; visitas: number }[]
}

export function resumirEventos(eventos: EventoDiario[]): ResumenMetricas {
  let visitas = 0, cotizaron = 0, reservaron = 0, waDirecto = 0
  const dias = new Map<string, DiaMetrica>()
  const fuentes = new Map<string, FuenteMetrica>()
  const dispositivos = new Map<string, number>()

  for (const e of eventos) {
    const n = Number(e.cantidad) || 0
    if (e.tipo === 'visita') visitas += n
    else if (e.tipo === 'cotizo') cotizaron += n
    else if (e.tipo === 'reservar') reservaron += n
    else if (e.tipo === 'wa_directo') waDirecto += n

    if (e.tipo === 'visita' || e.tipo === 'reservar') {
      const d = dias.get(e.dia) ?? { dia: e.dia, visitas: 0, leads: 0 }
      if (e.tipo === 'visita') d.visitas += n
      else d.leads += n
      dias.set(e.dia, d)

      const f = fuentes.get(e.fuente) ?? { fuente: e.fuente, visitas: 0, leads: 0 }
      if (e.tipo === 'visita') f.visitas += n
      else f.leads += n
      fuentes.set(e.fuente, f)

      if (e.tipo === 'visita') {
        dispositivos.set(e.dispositivo, (dispositivos.get(e.dispositivo) ?? 0) + n)
      }
    }
  }

  return {
    visitas, cotizaron, reservaron, waDirecto,
    porDia: [...dias.values()].sort((a, b) => a.dia.localeCompare(b.dia)),
    fuentes: [...fuentes.values()].sort((a, b) => b.visitas - a.visitas),
    dispositivos: [...dispositivos.entries()]
      .map(([dispositivo, v]) => ({ dispositivo, visitas: v }))
      .sort((a, b) => b.visitas - a.visitas),
  }
}

/** "12%" con un decimal cuando es chico; '—' si no hay base. */
export function pct(parte: number, base: number): string {
  if (!base) return '—'
  const p = (parte / base) * 100
  return (p >= 10 ? Math.round(p).toString() : p.toFixed(1).replace('.', ',').replace(',0', '')) + '%'
}
