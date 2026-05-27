# Intent — Dashboard Mensual del Sistema Dionsys

**Fecha de confirmación:** 2026-05-27
**Confirmado por:** Santiago (admin/socio)
**Producido por:** skill `agent-skills:interview-me`

---

## Outcome
Dashboard mensual completo que muestre el estado actual del hotel y comparación con el mes anterior, incluyendo:
- Gastos del mes (impuestos, pedidos, mantenimiento)
- Movimientos de depósito (entradas/salidas)
- Tareas de mantenimiento (pendientes/completadas)
- Ocupación
- Actividad por usuario (control, performance y auditoría)

## User
- **Lectura:** Santiago (admin) + socios
- **Carga:** cada empleado carga lo que le corresponde según rol
  - Conserjes (Leandro, Santiago, Gaston, Valentin): pedidos, recepción, depósito
  - Mucama/gobernanta (Maria): recepción, depósito
  - Mantenimiento (Julio): mantenimiento
  - Admin (Laura): todo + impuestos + montos de pedidos recibidos

## Why now
Se quiere poner el sistema en producción para empezar a cargar datos reales, de modo que a fin del mes (junio 2026) ya estén disponibles las primeras métricas reales para tomar decisiones operativas y discutir con socios.

## Success
A fin de cada mes, abrir el dashboard y responder sin Excel ni cálculos manuales:
1. **¿Cuánto gastamos y en qué rubro?** (impuestos, pedidos por proveedor, mantenimiento)
2. **¿Cuánta ocupación tuvimos y cómo se compara con el mes anterior?**
3. **¿Qué movió cada empleado?** (control = quién no cargó, performance = quién más cargó, auditoría = quién tocó qué cosa en qué momento)
4. **¿Qué tareas de mantenimiento quedaron pendientes?**

## Constraint (binding limit)
- **No se cargan ingresos del hotel** — la facturación la maneja otro lado (contador/sistema externo).
- El dashboard es del lado **operativo + gastos**, no de rentabilidad.
- Los montos de pedidos **hoy no existen** en el sistema y hay que agregarlos:
  - `Order.monto` (pedidos a distribuidores)
  - `PedidoSemanal.monto` (pedido semanal del depósito)
  - Quien carga el monto: administración o quien recepciona el pedido.

## Out of scope (explícito)
- Resultado neto (porque no entran ingresos)
- Reporte para contador / AFIP
- Dashboard para conserjes/mucama/mantenimiento (ellos solo cargan)
- App móvil nativa
- Multi-hotel
- Migración a backend / base de datos remota (sigue siendo localStorage por ahora)

## Trabajo identificado (preview, a desarrollar en /plan)
1. Agregar `monto` a `Order` y `PedidoSemanal` + UI de carga
2. Rediseñar `Dashboard.tsx` con vista mensual + comparación + filtros por usuario
3. Validación de inputs en formularios de carga (datos confiables)
4. Tests para cálculos de totales mensuales
5. Export mensual a Excel (ya hay `xlsx` instalado)
