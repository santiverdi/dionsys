import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Eraser } from 'lucide-react'
import { expandirRango, fetchTarifarioPublicado, type TarifarioPublico } from '../lib/landing'
import { cotizarEstadia, diaSemana, infoDia } from '../lib/tarifaDiaria'

const DIAS_CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']

// Calendario de tarifas para el conserje: cada día muestra el precio de esa
// noche (mismas cuentas que el calculador de la landing) y marcando llegada y
// salida —tocando o arrastrando— aparece el total, el efectivo y la seña.
// Los precios salen del tarifario PUBLICADO (vista tarifario_publico), así el
// mostrador cotiza exactamente lo mismo que ve un huésped en la página.

const money = (n: number) => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })

// Precio compacto para la celda: 35000 → "35k", 52500 → "52,5k".
function precioCorto(n: number): string {
  const v = n / 1000
  return (Number.isInteger(v) ? String(v) : v.toLocaleString('es-AR')) + 'k'
}

function hoyIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Celdas del mes en semanas lunes→domingo (null = relleno).
function celdasDelMes(mes: string): (string | null)[] {
  const [y, m] = mes.split('-').map(Number)
  const cant = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const offset = (diaSemana(`${mes}-01`) + 6) % 7
  const celdas: (string | null)[] = Array(offset).fill(null)
  for (let d = 1; d <= cant; d++) celdas.push(`${mes}-${String(d).padStart(2, '0')}`)
  while (celdas.length % 7) celdas.push(null)
  return celdas
}

function sumarMes(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

function nombreMes(mes: string): string {
  const [y, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('es-AR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

const fmtDia = (s: string) => `${s.slice(8, 10)}/${s.slice(5, 7)}`

export default function TarifasCalendario({ onBack }: { onBack: () => void }) {
  const [tarifario, setTarifario] = useState<TarifarioPublico | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pax, setPax] = useState(2)
  const [mes, setMes] = useState(() => hoyIso().slice(0, 7))
  const [llegada, setLlegada] = useState<string | null>(null)
  const [salida, setSalida] = useState<string | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [hoverDia, setHoverDia] = useState<string | null>(null)

  useEffect(() => {
    let activo = true
    void fetchTarifarioPublicado().then(({ tarifario: t, error: e }) => {
      if (!activo) return
      setTarifario(t)
      if (!t) setError(e ?? 'No hay tarifario publicado todavía.')
      // Si el mes actual quedó fuera de la vigencia, arrancamos en el primero vigente.
      if (t) {
        const min = t.config.vigencia.desde.slice(0, 7), max = t.config.vigencia.hasta.slice(0, 7)
        setMes(m => (m < min ? min : m > max ? max : m))
      }
    })
    return () => { activo = false }
  }, [])

  // Cierre del arrastre: donde soltó queda como salida (si es posterior a la llegada).
  useEffect(() => {
    if (!arrastrando) return
    const up = () => {
      setArrastrando(false)
      if (llegada && hoverDia && hoverDia > llegada) setSalida(hoverDia)
    }
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [arrastrando, llegada, hoverDia])

  const hoy = hoyIso()
  const celdas = useMemo(() => celdasDelMes(mes), [mes])

  const vigencia = tarifario?.config.vigencia
  const mesMin = vigencia?.desde.slice(0, 7) ?? mes
  const mesMax = vigencia?.hasta.slice(0, 7) ?? mes

  // Mientras arrastra, el día bajo el dedo hace de salida tentativa.
  const fin = salida ?? (arrastrando && llegada && hoverDia && hoverDia > llegada ? hoverDia : null)
  const cotizacion = tarifario && llegada && fin ? cotizarEstadia(llegada, fin, pax, tarifario) : null

  function diaDeEvento(e: React.PointerEvent): string | null {
    const el = (e.target as Element).closest?.('[data-fecha]')
    return el?.getAttribute('data-fecha') ?? null
  }

  function alPresionar(e: React.PointerEvent) {
    const f = diaDeEvento(e)
    if (!f || !tarifario || infoDia(f, pax, tarifario).precio === null) return
    if (llegada && !salida && f > llegada) {
      setSalida(f)   // segundo toque: la salida
    } else {
      setLlegada(f)  // primer toque (o volver a empezar)
      setSalida(null)
    }
    setArrastrando(true)
    setHoverDia(f)
  }

  function alMover(e: React.PointerEvent) {
    if (!arrastrando) return
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-fecha]')
    const f = el?.getAttribute('data-fecha')
    if (f && tarifario && infoDia(f, pax, tarifario).precio !== null) setHoverDia(f)
  }

  function limpiar() {
    setLlegada(null)
    setSalida(null)
    setHoverDia(null)
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-navy-600 hover:text-navy-800 mb-4 text-sm font-medium">
        <ChevronLeft size={18} /> Pedidos Recepcion
      </button>
      <h2 className="text-xl font-bold text-navy-800 mb-1">Tarifas</h2>
      <p className="text-sm text-navy-500 mb-4">
        El precio de cada noche, igual que en la página de reservas. Tocá la llegada y la salida (o arrastrá) para cotizar.
      </p>

      {error && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700 mb-4">{error}</div>}
      {!tarifario && !error && <p className="text-sm text-navy-400 py-8 text-center">Cargando tarifario…</p>}

      {tarifario && (
        <>
          {/* Personas */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="text-xs font-medium text-navy-500">Personas:</span>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setPax(n)}
                  className={`w-9 h-9 rounded-lg text-sm font-bold transition-colors ${
                    n === pax ? 'bg-navy-800 text-cream' : 'bg-white border border-navy-200 text-navy-600 hover:bg-navy-50'
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <span className="text-xs text-navy-400">
              {pax === 1 ? 'Single: precio por habitación por noche.' : 'Precio por persona por noche.'}
            </span>
          </div>

          {/* Cotización */}
          {llegada && (
            <div className="mb-4 p-4 bg-white rounded-xl border border-navy-100">
              {!cotizacion ? (
                <p className="text-sm text-navy-500">
                  Llegada el <b>{fmtDia(llegada)}</b> — ahora tocá el día de salida.
                </p>
              ) : (
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-navy-600">
                      Del <b>{fmtDia(llegada)}</b> al <b>{fmtDia(fin!)}</b> · {cotizacion.noches} {cotizacion.noches === 1 ? 'noche' : 'noches'} · {pax} {pax === 1 ? 'persona' : 'personas'}
                    </p>
                    <button onClick={limpiar} className="flex items-center gap-1 text-xs text-navy-400 hover:text-navy-600">
                      <Eraser size={13} /> Limpiar
                    </button>
                  </div>
                  <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 mt-2">
                    <p className="text-2xl font-bold text-navy-800">{money(cotizacion.total)}</p>
                    <p className="text-sm text-emerald-700 font-medium">
                      {money(cotizacion.efectivo)} en efectivo
                      {cotizacion.n20 > 0 && cotizacion.n10 === 0 ? ' (20% off)' : cotizacion.n10 > 0 && cotizacion.n20 === 0 ? ' (10% off)' : ''}
                    </p>
                    {cotizacion.sena > 0 && (
                      <p className="text-sm text-navy-500">
                        Seña {Math.round(cotizacion.sena * 100)}%: <b>{money(Math.round(cotizacion.total * cotizacion.sena))}</b>
                      </p>
                    )}
                  </div>
                  <div className="mt-2 space-y-1">
                    {cotizacion.noches < cotizacion.minNoches && (
                      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1 inline-block">
                        Para esas fechas la estadía mínima es de {cotizacion.minNoches} noches.
                      </p>
                    )}
                    {cotizacion.bloqueadas.length > 0 && (
                      <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1 inline-block">
                        Sin disponibilidad el {cotizacion.bloqueadas.map(fmtDia).join(', ')}.
                      </p>
                    )}
                    {cotizacion.findes.length > 0 && (
                      <p className="text-xs text-gold-700 bg-gold-50 border border-gold-200 rounded px-2 py-1 inline-block">
                        Incluye finde largo de {cotizacion.findes.join(' y ')} (tarifa especial ya aplicada).
                      </p>
                    )}
                  </div>

                  {/* Detalle noche por noche: para explicar en el mostrador por qué
                      una noche sale más cara que otra (vie/sáb o finde largo). */}
                  <div className="mt-3 border-t border-navy-100 pt-3">
                    <p className="text-xs font-medium text-navy-500 mb-1.5">Detalle por noche</p>
                    <div className="max-h-64 overflow-y-auto pr-1 space-y-1">
                      {(() => {
                        const noches = expandirRango(llegada, fin!).slice(0, -1).map(f => ({ f, info: infoDia(f, pax, tarifario) }))
                        const precios = noches.map(n => n.info.precio).filter((p): p is number => p !== null)
                        const masBarata = precios.length ? Math.min(...precios) : 0
                        return noches.map(({ f, info }) => {
                          const masCara = info.precio !== null && info.precio > masBarata
                          return (
                            <div
                              key={f}
                              className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm ${
                                masCara ? 'bg-amber-50 border border-amber-200' : 'bg-navy-50/60'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="font-medium text-navy-700 whitespace-nowrap">
                                  {DIAS_CORTOS[diaSemana(f)]} {fmtDia(f)}
                                </span>
                                {info.findeLargo && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gold-100 text-gold-700 whitespace-nowrap">{info.findeLargo}</span>
                                )}
                                {!info.findeLargo && info.caro && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-navy-100 text-navy-500 whitespace-nowrap">vie/sáb</span>
                                )}
                                {info.bloqueada && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 whitespace-nowrap">sin disponibilidad</span>
                                )}
                              </div>
                              <div className="text-right whitespace-nowrap">
                                {info.precio === null ? (
                                  <span className="text-navy-300">—</span>
                                ) : (
                                  <>
                                    <span className={`font-bold ${masCara ? 'text-amber-800' : 'text-navy-800'}`}>
                                      {pax === 1 ? money(info.precio) : `${money(info.precio)} × ${pax} = ${money(info.precio * pax)}`}
                                    </span>
                                    <span className="text-[10px] text-emerald-700 ml-1.5">ef. -{Math.round(info.descEfectivo * 100)}%</span>
                                  </>
                                )}
                              </div>
                            </div>
                          )
                        })
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Navegación de mes */}
          <div className="flex items-center justify-between mb-2">
            <button
              onClick={() => setMes(sumarMes(mes, -1))}
              disabled={mes <= mesMin}
              className="p-2 rounded-lg border border-navy-200 text-navy-600 hover:bg-navy-50 disabled:opacity-30"
            >
              <ChevronLeft size={18} />
            </button>
            <p className="font-bold text-navy-800 capitalize">{nombreMes(mes)}</p>
            <button
              onClick={() => setMes(sumarMes(mes, 1))}
              disabled={mes >= mesMax}
              className="p-2 rounded-lg border border-navy-200 text-navy-600 hover:bg-navy-50 disabled:opacity-30"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Calendario */}
          <div
            className="bg-white rounded-xl border border-navy-100 p-2 select-none"
            style={{ touchAction: 'none' }}
            onPointerDown={alPresionar}
            onPointerMove={alMover}
          >
            <div className="grid grid-cols-7 text-center text-xs sm:text-sm font-medium text-navy-400 mb-1">
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => <div key={d} className="py-1">{d}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {celdas.map((fecha, i) => {
                if (!fecha) return <div key={i} />
                const info = infoDia(fecha, pax, tarifario)
                const sinPrecio = info.precio === null
                const enNoches = llegada && fecha >= llegada && (fin ? fecha < fin : fecha === llegada)
                const esSalida = fin === fecha
                let cls = 'bg-white border-navy-100 text-navy-700'
                if (sinPrecio) cls = 'bg-navy-50/50 border-transparent text-navy-300'
                else if (enNoches) cls = 'bg-navy-800 border-navy-800 text-cream'
                else if (esSalida) cls = 'bg-navy-100 border-navy-300 text-navy-700'
                else if (info.bloqueada) cls = 'bg-red-50 border-red-200 text-red-400'
                else if (info.findeLargo) cls = 'bg-gold-50 border-gold-300 text-navy-800'
                else if (info.caro) cls = 'bg-navy-50 border-navy-100 text-navy-700'
                return (
                  <div
                    key={fecha}
                    data-fecha={fecha}
                    className={`rounded-lg border px-0.5 py-2 sm:py-3.5 text-center transition-colors ${cls} ${sinPrecio ? '' : 'cursor-pointer'} ${fecha === hoy ? 'ring-2 ring-gold-400' : ''}`}
                  >
                    <p className={`text-sm sm:text-base font-bold leading-none ${info.bloqueada && !enNoches ? 'line-through' : ''}`}>
                      {Number(fecha.slice(8, 10))}
                    </p>
                    {/* En el celu entra la forma corta (50k); en escritorio, el precio completo. */}
                    <p className="text-[11px] leading-tight mt-1 font-medium sm:hidden">
                      {sinPrecio ? '—' : precioCorto(info.precio!)}
                    </p>
                    <p className="hidden sm:block text-sm leading-tight mt-1.5 font-medium">
                      {sinPrecio ? '—' : money(info.precio!)}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Referencias */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-navy-500">
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-navy-50 border border-navy-200 inline-block" /> Vie/Sáb</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-gold-50 border border-gold-300 inline-block" /> Finde largo (recargo ya incluido)</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-50 border border-red-200 inline-block" /> Sin disponibilidad</span>
            <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded ring-2 ring-gold-400 inline-block" /> Hoy</span>
          </div>
          <p className="text-[11px] text-navy-400 mt-1">
            Precios de lista por noche{pax === 1 ? ' (habitación single completa)' : ' por persona'}. El descuento por efectivo aparece al cotizar.
          </p>
        </>
      )}
    </div>
  )
}
