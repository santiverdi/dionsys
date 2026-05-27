# TODO — Dashboard Mensual Dionsys

Plan completo en `tasks/plan.md`. Esto es el checklist plano para ejecutar.

---

## Fase 1 — Fundación
- [ ] **F1.1** Agregar campos opcionales (`monto`, `montoCargadoBy`, `montoCargadoAt`, `receiptPhoto`) a `Order` y `PedidoSemanal`. Agregar `createdBy`, `createdAt` opcionales a `PagoMensual`. _(src/types/index.ts)_
- [ ] **F1.2** Crear `src/utils/dateRange.ts` con `getMonthRange`, `isInMonth`, `getPreviousMonth`, `monthLabel`.

### ✅ Checkpoint 1: build verde + data vieja sigue visible

---

## Fase 2 — Slice vertical: Pedido Semanal con monto
- [ ] **F2.1** `setPedidoMonto()` en `StockContext`; botón "Cargar monto" en `PedidosAdmin.tsx` (solo admin); modal con monto + foto opcional de remito.
- [ ] **F2.2** Actualizar card "Gastos mes" en `Dashboard.tsx` para sumar montos de pedidos semanales del mes.

### ✅ Checkpoint 2: pipeline end-to-end de monto funciona

---

## Fase 3 — Slice vertical: Pedido a Distribuidor con monto
- [ ] **F3.1** Extraer `<MontoModal>` reusable en `src/components/MontoModal.tsx`. Agregar `setOrderMonto()` en `OrdersContext`. Botón "Marcar recibido + monto" en historial de `Pedidos.tsx`. Cambia status a `recibido`.
- [ ] **F3.2** Sumar `orders` con monto en card "Gastos mes" del Dashboard.

### ✅ Checkpoint 3: 2 fuentes de monto unificadas

---

## Fase 4 — Dashboard mensual
- [ ] **F4.1** Selector de mes con navegación `<` Mayo 2026 `>` en `Dashboard.tsx`.
- [ ] **F4.2** Crear `src/utils/monthlyMetrics.ts` con `getMonthlyExpenses()`. Renderizar sección "Gastos del mes" con desglose por rubro + delta vs mes anterior.
- [ ] **F4.3** Sección "Ocupación del mes": promedio huéspedes, % ocupación, días llenos/vacíos, comparación.
- [ ] **F4.4** Sección "Depósito": entradas/salidas del mes, top 5 items más salida, stock crítico al cierre.
- [ ] **F4.5** Sección "Mantenimiento": creadas/completadas/pendientes, tiempo promedio resolución, gasto materiales, deltas.

### ✅ Checkpoint 4: dashboard mensual completo + comparación

---

## Fase 5 — Actividad por usuario
- [ ] **F5.1** `getEmployeeActivity()` en `monthlyMetrics.ts`: por empleado → última actividad, días inactivo, contadores.
- [ ] **F5.2** Tabla "Actividad del mes por usuario" en Dashboard, con indicador rojo si `daysInactive > 7`.
- [ ] **F5.3** Crear `src/components/ActivityLog.tsx` (drill-down con timeline filtrable). Click en empleado → modal con su cronología.

### ✅ Checkpoint 5: 3 dimensiones (control + performance + auditoría) visibles

---

## Fase 6 — Validación de inputs
- [ ] **F6.1** Crear `src/utils/validators.ts` con `validateMonto`, `validateCantidad`, `validateGuests`, `validatePin`.
- [ ] **F6.2** Aplicar en `Impuestos.tsx`, `Pedidos.tsx`, `Stock.tsx`, `OccupancyPanel.tsx`, `MontoModal.tsx`, y formulario de materiales en mantenimiento. Errores inline rojos, no `alert()`. Submit disabled si hay errores.

### ✅ Checkpoint 6: integridad de datos garantizada

---

## Fase 7 — Tests
- [ ] **F7.1** Instalar `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom`. Configurar `vite.config.ts` + script `test` en `package.json`.
- [ ] **F7.2** Tests de utilities puros en `tests/utils/`: `dateRange.test.ts`, `monthlyMetrics.test.ts`, `validators.test.ts`. Cobertura ≥80%.
- [ ] **F7.3** Tests de cálculo crítico de Occupancy en `tests/context/OccupancyContext.test.ts`: `getAvgConsumption`, `parseExcel`.

### ✅ Checkpoint 7: `npm test` verde

---

## Fase 8 — Export Excel
- [ ] **F8.1** `src/utils/monthlyExport.ts` con `exportMonthlyReport(year, month, data)`. Hojas: Resumen, Gastos, Movimientos, Mantenimiento, Actividad por usuario, Ocupación diaria.
- [ ] **F8.2** Botón "Exportar mes (XLSX)" en Dashboard → descarga `dionsys-YYYY-MM.xlsx`.

### ✅ Checkpoint FINAL: prod-ready

- [ ] `npm run build` verde
- [ ] `npm run lint` verde
- [ ] `npm test` verde
- [ ] Smoke test manual: 1 semana de data cargada → dashboard correcto → export funciona
- [ ] Performance dashboard <1s con 1k registros

---

## Orden recomendado de ejecución

**Si querés empezar a usar el sistema ASAP (mínimo viable):**
F1 → F2 → F3 → F6 → (puesta en producción) → F4 → F5 → F7 → F8

**Si querés todo polished primero:**
F1 → F2 → F3 → F4 → F5 → F6 → F7 → F8

La primera opción te deja cargando data real más rápido. La segunda te da el dashboard completo antes de empezar a cargar.
