# Plan — Dashboard Mensual del Sistema Dionsys

**Fuente del intent:** `docs/intent/dashboard-mensual.md`
**Fecha:** 2026-05-27
**Stack:** React 19 + Vite + TS + Tailwind 4 + localStorage. Sin backend.
**Audiencia del dashboard:** admin (Santiago) + socios.

---

## Principio de slicing

Cada fase es un **slice vertical** end-to-end (tipo de dato → UI de carga → vista en dashboard → verificación), no capas horizontales (no "primero todos los tipos, después todas las UIs"). Cada slice deja el sistema funcionando y deployable.

---

## Mapa de dependencias

```
F1 (Fundación: tipos + persistencia compatible)
  ├─→ F2 (Monto en Pedido Semanal — slice vertical 1)
  ├─→ F3 (Monto en Pedido a Distribuidor — slice vertical 2)
  │
F4 (Dashboard mensual + comparación mes anterior)
  └─→ requiere F2 + F3 (datos de gastos completos)
  └─→ requiere agregar createdBy a PagoMensual (auditoría)
  │
F5 (Actividad por usuario — 3 dimensiones)
  └─→ requiere F4 (vista mensual como base)
  │
F6 (Validación de inputs)
  └─→ paralelo con F2-F5 (puede hacerse en cualquier momento)
  │
F7 (Tests de cálculos)
  └─→ requiere F4 estable (lo que se testea)
  │
F8 (Export mensual a Excel)
  └─→ requiere F4 + F5 (data del dashboard)
```

---

## Fase 1 — Fundación

**Goal:** preparar tipos y persistencia para que los slices siguientes sean aditivos (no rompen data existente).

### F1.1 — Agregar campos opcionales a tipos

**Archivos:** `src/types/index.ts`

Cambios:
- `Order`: agregar `monto?: number`, `montoCargadoBy?: string`, `montoCargadoAt?: string`, `receiptPhoto?: string`
- `PedidoSemanal`: agregar `monto?: number`, `montoCargadoBy?: string`, `montoCargadoAt?: string`, `receiptPhoto?: string`
- `PagoMensual`: agregar `createdBy?: string`, `createdAt?: string` (auditoría de quién cargó el pago)

**Por qué opcionales:** localStorage existente tiene registros sin estos campos → no romper la lectura inicial.

**Acceptance:** `npm run build` pasa. App carga sin perder data existente del localStorage.
**Verificación:** abrir app local, ver que pedidos viejos siguen apareciendo (sin monto).

### F1.2 — Helper de fechas mensual

**Archivos:** `src/utils/dateRange.ts` (nuevo)

Funciones puras:
- `getMonthRange(year, month) → { start: Date, end: Date }`
- `isInMonth(iso: string, year, month) → boolean`
- `getPreviousMonth(year, month) → { year, month }`
- `monthLabel(year, month) → string` ("Mayo 2026")

**Acceptance:** funciones exportadas, sin side-effects. Listas para tests.

---

## CHECKPOINT 1
- [ ] `npm run build` verde
- [ ] App levanta y data vieja sigue visible
- [ ] No hay errores en consola

---

## Fase 2 — Slice vertical: monto en Pedido Semanal

**Goal:** end-to-end → admin carga monto cuando llega el pedido → aparece en dashboard.

### F2.1 — UI de carga de monto en PedidosAdmin

**Archivos:** `src/pages/PedidosAdmin.tsx`, `src/context/StockContext.tsx`

Cambios:
- Agregar función `setPedidoMonto(pedidoId, monto, cargadoBy)` en `StockContext`
- En cada `PedidoCard`, si `role === 'admin'` y `!pedido.monto`: botón "Cargar monto recibido"
- Modal con: input monto (con formato $ es-AR) + foto opcional de remito (`imageCompressor`)
- Si ya tiene monto: mostrar "$X cargado por Y el Z" + botón editar
- Solo admin puede editar montos

**Acceptance:**
1. Admin entra a Proveedores, ve los pedidos pendientes con botón "Cargar monto"
2. Click → modal → ingresa $50000 → guarda
3. Pedido ahora muestra "$50.000 — cargado por Laura el 27/05"
4. localStorage tiene `monto: 50000, montoCargadoBy: 'Laura', montoCargadoAt: '...'`
5. Conserjes no ven el botón (solo admin)

**Verificación:** login como admin, cargar 2 pedidos con monto distinto; login como conserje, verificar que NO ve el botón.

### F2.2 — KPI temporal en Dashboard

**Archivos:** `src/pages/Dashboard.tsx`

Cambios:
- Sumar `pedidos.filter(p => p.status !== 'borrado').reduce((s,p) => s + (p.monto ?? 0), 0)` del mes actual
- Reemplazar/sumar en el card "Gastos mes" (que hoy solo cuenta mantenimiento) → ahora suma pedidos + mantenimiento + impuestos pagados
- Mostrar desglose simple: "Mant: $X · Pedidos: $Y · Impuestos: $Z"

**Acceptance:** card "Gastos mes" refleja monto cargado en F2.1.
**Verificación:** cargar monto en un pedido → ver el número subir en el dashboard sin recargar (o tras refresh).

---

## CHECKPOINT 2
- [ ] Pipeline carga monto → guarda → muestra en dashboard funciona
- [ ] Build verde, sin errores TS

---

## Fase 3 — Slice vertical: monto en Pedido a Distribuidor

**Goal:** mismo patrón de F2 para pedidos por WhatsApp a distribuidores.

### F3.1 — UI de carga de monto en Pedidos (historial)

**Archivos:** `src/pages/Pedidos.tsx`, `src/context/OrdersContext.tsx`

Cambios:
- Agregar `setOrderMonto(orderId, monto, cargadoBy)` en `OrdersContext`
- En la vista `history` de `Pedidos.tsx`, si admin y orden no borrada: botón "Marcar recibido + monto"
- Modal igual al de F2.1 (extraer a `<MontoModal>` reusable en `src/components/MontoModal.tsx`)
- Cambia status a `'recibido'` cuando se carga monto

**Acceptance:**
1. Admin va a Pedidos → Historial → ve pedidos `enviado`
2. Click "Marcar recibido + monto" → carga $ → status cambia a `recibido`
3. Pedido muestra $ + quién lo cargó

**Verificación:** misma que F2 pero para Order.

### F3.2 — Actualizar suma del Dashboard

**Archivos:** `src/pages/Dashboard.tsx`

Sumar `orders` (no borrados) con monto al total de "Pedidos" del card de gastos.

**Acceptance:** card de gastos incluye ambos tipos de pedidos.

---

## CHECKPOINT 3
- [ ] 2 fuentes de monto de pedidos funcionando (semanal + distribuidor)
- [ ] Dashboard refleja total real
- [ ] `<MontoModal>` extraído y reusado

---

## Fase 4 — Dashboard mensual con comparación

**Goal:** transformar Dashboard de "hoy" a "mes con comparación contra anterior".

### F4.1 — Selector de mes en Dashboard

**Archivos:** `src/pages/Dashboard.tsx`

Cambios:
- State `viewMonth: { year, month }` con default = mes actual
- Header con `<ChevronLeft> Mayo 2026 <ChevronRight>`
- Toda la data filtrada por `viewMonth` usando `isInMonth()` de F1.2

**Acceptance:** flechas navegan entre meses, todos los KPI se actualizan.

### F4.2 — Sección "Gastos del mes" con desglose y comparación

**Archivos:** `src/pages/Dashboard.tsx`, `src/utils/monthlyMetrics.ts` (nuevo)

Crear utility `getMonthlyExpenses(year, month, orders, pedidos, tasks, pagos)` que devuelva:
```ts
{
  impuestosPagado: number,
  impuestosPendiente: number,
  pedidosSemanales: number,
  pedidosDistribuidor: number,
  mantenimiento: number,
  total: number,
}
```

UI:
- Tabla/grid con cada rubro + monto + delta vs mes anterior (verde si bajó, rojo si subió)
- Total grande arriba

**Acceptance:**
- Mostrar 5 filas (impuestos pagado/pendiente, 2 tipos de pedidos, mantenimiento)
- Cada fila tiene "$X • Δ +12% vs mes anterior"
- Total suma todo

**Verificación:** cargar data en 2 meses distintos, ver que la comparación da el delta correcto.

### F4.3 — Sección "Ocupación del mes"

**Archivos:** `src/pages/Dashboard.tsx`, `src/utils/monthlyMetrics.ts`

Métricas:
- Promedio diario de huéspedes
- Promedio de habitaciones ocupadas
- % ocupación promedio (vs `HOTEL_CAPACITY = 53`)
- Días llenos (>85%) y días vacíos (<30%)
- Delta vs mes anterior

**Acceptance:** card muestra las 4-5 métricas con comparación.

### F4.4 — Sección "Depósito"

**Archivos:** `src/pages/Dashboard.tsx`, `src/utils/monthlyMetrics.ts`

Métricas:
- Total movimientos del mes (entradas / salidas / neto)
- Top 5 items con más salidas (lo que más se gasta)
- Items en stock crítico al cierre del mes

**Acceptance:** sección visible con las 3 sub-métricas.

### F4.5 — Sección "Mantenimiento"

**Archivos:** `src/pages/Dashboard.tsx`, `src/utils/monthlyMetrics.ts`

Métricas:
- Tareas creadas / completadas / pendientes del mes
- Tiempo promedio de resolución (completedAt - createdAt)
- Gasto total en materiales del mes
- Delta vs mes anterior en cada uno

**Acceptance:** sección visible con las 4 métricas.

---

## CHECKPOINT 4
- [ ] Dashboard mensual completo con 4 secciones
- [ ] Navegación entre meses funciona
- [ ] Comparación contra mes anterior visible
- [ ] Build verde, performance aceptable (<1s render con 1k registros)

---

## Fase 5 — Actividad por usuario (3 dimensiones)

**Goal:** dashboard responde a las 3 preguntas del intent: control, performance, auditoría.

### F5.1 — Métrica por empleado

**Archivos:** `src/utils/monthlyMetrics.ts`, `src/pages/Dashboard.tsx`

Función `getEmployeeActivity(year, month, employees, orders, pedidos, movements, tasks, pagos)` que devuelva por empleado:
```ts
{
  name: string,
  role: Role,
  lastActivityAt: string | null,
  daysInactive: number,
  orders: number,
  pedidosSemanales: number,
  movimientos: { entradas: number, salidas: number },
  tareasCreadas: number,
  tareasCompletadas: number,
  montosCargados: number, // count
}
```

### F5.2 — UI "Actividad del mes por usuario"

**Archivos:** `src/pages/Dashboard.tsx`

Tabla con:
- Nombre + role (Leandro · Mañana)
- Última actividad ("hace 3 días")
- Total movimientos del mes
- Tareas hechas
- Indicador rojo si `daysInactive > 7`

**Acceptance:** tabla muestra los 7 empleados con sus métricas. Inactivos resaltados.

### F5.3 — Drill-down: log filtrable de auditoría

**Archivos:** `src/components/ActivityLog.tsx` (nuevo), `src/pages/Dashboard.tsx`

Click en un empleado → modal/sección con timeline:
- Cada movimiento de ese empleado en el mes
- Filtros: tipo (pedido/movimiento/tarea/monto) + rango de fecha
- Cada entry: fecha · acción · detalle

**Acceptance:** click en empleado → ver cronología de sus movimientos del mes.

---

## CHECKPOINT 5
- [ ] Las 3 dimensiones (control = inactivos, performance = ranking, auditoría = drill-down) visibles
- [ ] Performance aceptable con 1k movimientos

---

## Fase 6 — Validación de inputs

**Goal:** datos confiables. Sin esto, las métricas son basura.

### F6.1 — Utility de validadores

**Archivos:** `src/utils/validators.ts` (nuevo)

Funciones puras:
- `validateMonto(input: string) → { ok: boolean, value?: number, error?: string }`
- `validateCantidad(input: number | string) → { ok, value?, error? }` (no negativo, no NaN)
- `validateGuests(input: number) → { ok, value?, error? }` (0-capacity)
- `validatePin(input: string) → { ok, error? }` (4 dígitos exactos)

### F6.2 — Aplicar validación

**Archivos a tocar:**
- `src/pages/Impuestos.tsx` (parseFloat de monto — ya hay algo, normalizar)
- `src/pages/Pedidos.tsx` (cantidades)
- `src/pages/Stock.tsx` (cantidades de movimiento, qty pedido semanal)
- `src/components/OccupancyPanel.tsx` (guests, rooms)
- `src/components/MontoModal.tsx` (de F3, usa `validateMonto`)
- Mantenimiento (cost de materiales)

UX:
- Errores inline rojos abajo del input (no `alert()`)
- Botón submit disabled si hay errores

**Acceptance:**
- No se puede ingresar monto negativo o no numérico en ningún formulario
- No se puede ingresar huéspedes > capacidad
- Mensajes de error claros al usuario

---

## CHECKPOINT 6
- [ ] Todos los inputs críticos validan
- [ ] Errores visibles al usuario, no silent fail

---

## Fase 7 — Tests de cálculos

**Goal:** garantizar que los números del dashboard son correctos.

### F7.1 — Setup vitest

**Archivos:** `package.json`, `vite.config.ts`, `tests/setup.ts` (nuevo)

Instalar: `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`.
Script: `"test": "vitest"`, `"test:run": "vitest run"`.

### F7.2 — Tests de utility puros

**Archivos:** `tests/utils/dateRange.test.ts`, `tests/utils/monthlyMetrics.test.ts`, `tests/utils/validators.test.ts`

Cobertura mínima:
- `dateRange`: `getMonthRange`, `isInMonth`, `getPreviousMonth` (edge: enero → dic año anterior)
- `monthlyMetrics`: `getMonthlyExpenses` con fixtures (suma correcta, ignora borrados, filtra por mes)
- `validators`: cada función con casos válidos + inválidos
- `getEmployeeActivity` con fixtures

### F7.3 — Tests de cálculo crítico de Occupancy

**Archivos:** `tests/context/OccupancyContext.test.ts`

- `getAvgConsumption`: dado 3 records con guests/items, calcula promedio correcto
- `parseExcel`: dado un xlsx de prueba, devuelve INHOUSE/OUT/IN correctos

**Acceptance:** `npm test` corre y todos pasan. Cobertura ≥80% en utilities.

---

## CHECKPOINT 7
- [ ] `npm test` verde
- [ ] CI sería capaz de correr esto

---

## Fase 8 — Export mensual a Excel

**Goal:** admin puede descargar el cierre del mes en .xlsx para pasarlo a socios o contador.

### F8.1 — Generador de workbook

**Archivos:** `src/utils/monthlyExport.ts` (nuevo)

Función `exportMonthlyReport(year, month, allData)` que genere un `.xlsx` con hojas:
1. **Resumen** — KPIs del mes + comparación
2. **Gastos** — desglose por rubro con cada item
3. **Movimientos** — todos los movimientos de stock del mes
4. **Mantenimiento** — todas las tareas con tiempo de resolución y costo
5. **Actividad por usuario** — tabla F5.1
6. **Ocupación diaria** — un row por día

Usa `xlsx` (ya instalado).

### F8.2 — Botón en Dashboard

**Archivos:** `src/pages/Dashboard.tsx`

Botón "Exportar mes (XLSX)" → descarga `dionsys-2026-05.xlsx`.

**Acceptance:** click → descarga archivo abrible en Excel/Google Sheets con todas las hojas.
**Verificación manual:** abrir el .xlsx, ver que todas las hojas tienen datos coherentes.

---

## CHECKPOINT FINAL
- [ ] Build de producción verde (`npm run build`)
- [ ] Tests verdes (`npm test`)
- [ ] Lint verde (`npm run lint`)
- [ ] Smoke test manual: cargar 1 semana de data → ver dashboard → exportar → abrir Excel
- [ ] Sin secrets en código
- [ ] localStorage no excede límite (~5MB) con data de 1 mes
- [ ] Performance: dashboard renderiza <1s con 1k registros

---

## Riesgos identificados

1. **localStorage capacity** — con fotos de remito puede llenarse. Mitigación: comprimir más agresivamente, o omitir fotos si pesan >100KB.
2. **PagoMensual.monto ya existe** pero no tiene createdBy. Migración silenciosa: asumir creator='Laura' para registros viejos (admin).
3. **Cambio de empleados activos** — si Valentin deja de cubrir y el override sigue, el tracking se desvía. Out of scope por ahora pero documentar.
4. **Sin backup** — solo localStorage. Si el browser se limpia, se pierde todo. Mitigación: el export a Excel es el "backup" manual mensual.

---

## Lo que NO está en el plan (out of scope)

- Backend / sync entre dispositivos
- Módulo de ingresos / facturación
- Reportes para contador / AFIP
- Dashboards para roles no-admin
- Multi-hotel
- App móvil nativa
