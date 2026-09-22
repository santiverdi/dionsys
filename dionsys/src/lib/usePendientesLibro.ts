// El estado del libro de caja de Charo, listo para usar en cualquier pantalla:
// cuánta plata salió de verdad y todavía no entró en ningún número.
//
// Vive aparte del componente del aviso porque lo usan tres pantallas (Negocio,
// Administración y la propia Caja de Administración) y las tres tienen que
// mostrar EXACTAMENTE el mismo número.

import { useMemo } from 'react'
import { useLibroCaja } from '../context/LibroCajaContext'
import { useOrders } from '../context/OrdersContext'
import { useStock } from '../context/StockContext'
import { useMaintenance } from '../context/MaintenanceContext'
import { useImpuestos } from '../context/ImpuestosContext'
import { useSueldos } from '../context/SueldosContext'
import { useMarcasLibroCaja } from './libroCajaMarcas'
import { clavesDerivadas, pendientesLibro, type PendientesLibro } from './libroCajaPendientes'

/** El estado del libro de todos los meses importados. */
export function usePendientesLibro(): PendientesLibro {
  const { meses } = useLibroCaja()
  const { marcas } = useMarcasLibroCaja()
  const { orders } = useOrders()
  const { pedidos } = useStock()
  const { tasks } = useMaintenance()
  const { pagos, servicios } = useImpuestos()
  const { pagos: pagosSueldos } = useSueldos()

  return useMemo(() => pendientesLibro(
    meses,
    marcas,
    clavesDerivadas(pagosSueldos, pagos),
    { orders, pedidos, tasks, pagos, pagosSueldos, servicios },
  ), [meses, marcas, orders, pedidos, tasks, pagos, pagosSueldos, servicios])
}
