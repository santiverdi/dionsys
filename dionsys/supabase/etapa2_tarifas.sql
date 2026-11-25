-- ============================================================================
-- DionSys · Tarifas ETAPA 2 — promos, agregados y propuestas de los conserjes
-- ============================================================================
-- Va DESPUÉS de etapa1_tarifas.sql. Se puede correr más de una vez.
--
-- Qué hace:
--   1. Suma 'dionsys_promos' a las claves protegidas: solo el dueño las guarda
--      (guardar_tarifa) y cada cambio queda en tarifas_historial.
--
-- ORDEN DE PUESTA EN MARCHA: correr este archivo antes de usar la pantalla
-- Promos. Sin él, guardar una promo da "Clave no permitida"; cotizar sigue
-- andando igual con las promos de siempre.
-- ============================================================================

-- ── 1. Claves protegidas ────────────────────────────────────────────────────
-- Reemplaza la de etapa1_tarifas.sql: la usan guardar_tarifa(), el trigger del
-- historial y las políticas de app_state, así que alcanza con redefinirla.
create or replace function public.clave_tarifa_protegida(k text)
returns boolean language sql immutable as $$
  select k in (
    'dionsys_tarifas_dia',          -- precios y mínimos por día (Recepción → Tarifas)
    'dionsys_estadias_minimas',     -- estadías mínimas por fechas
    'dionsys_promo_anticipada',     -- reserva anticipada (vieja: vale hasta guardar Promos)
    'dionsys_tarifas_protecciones', -- piso, tope de descuento, relación single
    'dionsys_tarifas',              -- tarifas pactadas del control de caja
    'dionsys_promos'                -- promos de la cotización (pantalla Promos)
  )
$$;
