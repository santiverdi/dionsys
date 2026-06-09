-- ============================================================================
-- Dionsys — esquema de sincronización en la nube (espejo KV)
-- Correr UNA vez en Supabase → SQL Editor → New query → pegar todo → Run.
-- ============================================================================

-- Tabla única: un renglón por cada "almacén" (la misma key que usa localStorage).
create table if not exists public.app_state (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- Realtime: que la tabla emita cambios para que los dispositivos se enteren al instante.
alter publication supabase_realtime add table public.app_state;

-- ----------------------------------------------------------------------------
-- Seguridad (RLS)
-- La app entra por PIN (no por usuarios de Supabase) y usa la anon key pública.
-- Por eso habilitamos lectura/escritura con la anon key sobre ESTA tabla solamente.
-- Los datos son operativos del hotel (pedidos, stock, turnos), no sensibles.
-- ----------------------------------------------------------------------------
alter table public.app_state enable row level security;

drop policy if exists "anon puede leer app_state"   on public.app_state;
drop policy if exists "anon puede escribir app_state" on public.app_state;

create policy "anon puede leer app_state"
  on public.app_state for select
  to anon
  using (true);

create policy "anon puede escribir app_state"
  on public.app_state for all
  to anon
  using (true)
  with check (true);
