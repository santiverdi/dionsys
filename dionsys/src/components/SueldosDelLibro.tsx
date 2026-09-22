// Los sueldos que ya están escritos en el libro de Charo, para mandarlos a
// Sueldos sin volver a cargarlos a mano.
//
// La plata y la fecha las pone la planilla; lo único que decide el usuario es
// DE QUIÉN es cada pago y qué tipo de pago es. Por eso hay un selector por fila
// con el empleado ya propuesto desde el detalle escrito a mano.
//
// Una fila que ya se mandó queda marcada y se puede deshacer (borra el pago que
// generó). Una fila que se parece a un pago ya cargado de otra forma (recibo
// escaneado) sale avisada y NO entra en el envío en lote.

import { useMemo, useState } from 'react'
import { Users, Send, Undo2, AlertTriangle, Check } from 'lucide-react'
import { useSueldos } from '../context/SueldosContext'
import { useAuth } from '../context/AuthContext'
import { sueldosDelLibro, type SueldoDelLibro } from '../lib/libroCajaSueldos'
import { formatMontoCurrency } from '../utils/validators'
import {
  TIPOS_PAGO_EMPLEADO, TIPO_PAGO_SUELDO_LABELS,
  type LibroCajaMovimiento, type TipoPagoSueldo,
} from '../types'

const CARGAS_NOMBRE = 'Cargas sociales'

function fmtFecha(s: string): string {
  const [, m, d] = s.split('-')
  return `${d}/${m}`
}

interface Props {
  movimientos: LibroCajaMovimiento[]
  /** Para sacar la marca del Dashboard: lo que se manda a Sueldos ya suma allá. */
  desmarcar: (clave: string) => void
}

export default function SueldosDelLibro({ movimientos, desmarcar }: Props) {
  const { empleados, pagos, addPago, deletePago } = useSueldos()
  const { employee } = useAuth()

  // Elecciones del usuario por fila: pisan lo propuesto. Viven en memoria nomás
  // — cuando el pago se manda, la decisión ya queda guardada en Sueldos.
  const [empleadoElegido, setEmpleadoElegido] = useState<Record<string, string>>({})
  const [tipoElegido, setTipoElegido] = useState<Record<string, TipoPagoSueldo>>({})

  const filas = useMemo(
    () => sueldosDelLibro(movimientos, empleados, pagos),
    [movimientos, empleados, pagos],
  )

  if (filas.length === 0) return null

  const empleadoDe = (f: SueldoDelLibro): string =>
    empleadoElegido[f.clave] ?? f.empleadoSugerido?.id ?? ''
  const tipoDe = (f: SueldoDelLibro): TipoPagoSueldo =>
    tipoElegido[f.clave] ?? f.tipo

  const enviar = (f: SueldoDelLibro) => {
    const tipo = tipoDe(f)
    // Las cargas sociales no son de nadie: van sin empleado, como el VEP.
    const empId = tipo === 'cargas' ? '' : empleadoDe(f)
    if (tipo !== 'cargas' && !empId) return
    const emp = empleados.find(e => e.id === empId)

    addPago({
      empleadoId: empId,
      empleadoNombre: tipo === 'cargas' ? CARGAS_NOMBRE : (emp?.nombre ?? f.mov.detalle),
      // El gasto pesa en el mes en que salió la plata: la fecha del libro.
      mes: f.mes,
      tipo,
      monto: f.monto,
      fecha: f.mov.fecha,
      medio: f.medio,
      notas: f.mov.detalle ? `Libro de caja: ${f.mov.detalle}` : 'Libro de caja',
      origenLibro: f.clave,
      createdBy: employee?.name,
      createdAt: new Date().toISOString(),
    })
    // Si estaba marcado para el Dashboard, se saca: ahora suma desde Sueldos.
    desmarcar(f.clave)
  }

  const listo = (f: SueldoDelLibro): boolean => tipoDe(f) === 'cargas' || !!empleadoDe(f)
  const pendientes = filas.filter(f => !f.enviado && !f.posibleDuplicado && listo(f))

  return (
    <section className="bg-white rounded-xl border border-navy-100 p-4 mb-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
        <h3 className="text-sm font-bold uppercase tracking-wide text-navy-500 flex items-center gap-1.5">
          <Users size={15} /> Sueldos de este libro ({filas.length})
        </h3>
        {pendientes.length > 0 && (
          <button
            onClick={() => pendientes.forEach(enviar)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-navy-800 text-cream text-xs font-semibold hover:bg-navy-700"
          >
            <Send size={13} /> Mandar los {pendientes.length} a Sueldos
          </button>
        )}
      </div>
      <p className="text-[11px] text-navy-400 mb-3">
        La plata y la fecha ya las tiene la planilla. Confirmá de quién es cada pago y se carga
        solo en Sueldos — ahí suma al costo laboral del mes y no hace falta marcarlo acá.
      </p>

      <ul className="space-y-0.5 max-h-[28rem] overflow-y-auto">
        {filas.map(f => {
          const tipo = tipoDe(f)
          const empId = empleadoDe(f)
          const esCargas = tipo === 'cargas'
          return (
            <li
              key={f.clave}
              className={`flex items-start gap-2 flex-wrap border-b border-navy-50 last:border-0 py-2 ${f.enviado ? 'bg-green-50/60' : ''}`}
            >
              <span className="min-w-0 flex-1">
                <span className="text-xs text-navy-700">
                  <span className="text-navy-400">{fmtFecha(f.mov.fecha)}</span>{' '}
                  <span className="font-medium">{f.mov.detalle || f.mov.concepto}</span>
                </span>
                <span className="block text-[10px] text-navy-400">
                  {f.mov.concepto} · {f.mov.medio}
                </span>
                {f.enviado && (
                  <span className="flex items-center gap-1 text-[10px] text-green-700">
                    <Check size={11} /> ya está en Sueldos como {f.enviado.empleadoNombre}
                  </span>
                )}
                {f.posibleDuplicado && (
                  <span className="flex items-start gap-1 text-[10px] text-amber-700">
                    <AlertTriangle size={11} className="shrink-0 mt-0.5" />
                    <span>
                      ya hay un pago de {formatMontoCurrency(f.posibleDuplicado.monto)} en Sueldos
                      ({f.posibleDuplicado.empleadoNombre}, {fmtFecha(f.posibleDuplicado.fecha)}) —
                      mandarlo lo cuenta dos veces
                    </span>
                  </span>
                )}
              </span>

              {!f.enviado && (
                <>
                  <select
                    value={esCargas ? '' : empId}
                    disabled={esCargas}
                    onChange={e => setEmpleadoElegido(prev => ({ ...prev, [f.clave]: e.target.value }))}
                    className="shrink-0 px-2 py-1 rounded-lg border border-navy-200 text-xs bg-white disabled:bg-navy-50 disabled:text-navy-300"
                  >
                    <option value="">{esCargas ? 'toda la nómina' : '¿De quién es?'}</option>
                    {empleados.map(e => (
                      <option key={e.id} value={e.id}>{e.nombre}</option>
                    ))}
                  </select>
                  <select
                    value={tipo}
                    onChange={e => setTipoElegido(prev => ({ ...prev, [f.clave]: e.target.value as TipoPagoSueldo }))}
                    className="shrink-0 px-2 py-1 rounded-lg border border-navy-200 text-xs bg-white"
                  >
                    {TIPOS_PAGO_EMPLEADO.map(t => (
                      <option key={t} value={t}>{TIPO_PAGO_SUELDO_LABELS[t]}</option>
                    ))}
                    <option value="cargas">{TIPO_PAGO_SUELDO_LABELS.cargas}</option>
                  </select>
                </>
              )}

              <span className="shrink-0 self-center text-xs font-semibold text-navy-800 whitespace-nowrap">
                {formatMontoCurrency(f.monto)}
              </span>

              {f.enviado ? (
                <button
                  onClick={() => deletePago(f.enviado!.id)}
                  className="shrink-0 flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-navy-400 hover:text-red-600 hover:bg-red-50"
                  title="Borra el pago que se creó en Sueldos"
                >
                  <Undo2 size={13} /> Deshacer
                </button>
              ) : (
                <button
                  onClick={() => enviar(f)}
                  disabled={!listo(f)}
                  className={`shrink-0 flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold disabled:opacity-40 disabled:cursor-not-allowed ${
                    f.posibleDuplicado
                      ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                      : 'bg-navy-800 text-cream hover:bg-navy-700'
                  }`}
                >
                  <Send size={13} /> {f.posibleDuplicado ? 'Mandar igual' : 'A Sueldos'}
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
