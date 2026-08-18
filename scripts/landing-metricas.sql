-- Métricas propias de la landing: cada visita y paso del embudo queda en esta
-- tabla (sin ningún dato personal: tipo de evento, fuente, dispositivo y fecha).
-- Correr UNA VEZ en supabase.com -> tu proyecto -> SQL Editor.
--
-- La landing INSERTA con la anon key; DionSys LEE la vista agregada vía
-- /api/metricas (service role + LANDING_TOKEN). La anon key no puede leer nada.

create table if not exists public.eventos_landing (
  id bigint generated always as identity primary key,
  tipo text not null,                       -- visita | cotizo | reservar | wa_directo
  fuente text,                              -- utm_source de la campaña, o el dominio que refirió, o 'directo'
  dispositivo text,                         -- movil | escritorio
  creado_at timestamptz not null default now()
);

alter table public.eventos_landing enable row level security;

do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'eventos_landing'
  loop
    execute format('drop policy %I on public.eventos_landing', p.policyname);
  end loop;
end $$;

create policy eventos_solo_insertar on public.eventos_landing
  for insert to anon, authenticated with check (true);

-- Vista agregada por día que consume /api/metricas (payload chico aunque haya
-- miles de visitas). Sin acceso para la anon key: solo la service role la lee.
create or replace view public.eventos_landing_diario as
select
  creado_at::date        as dia,
  tipo,
  coalesce(fuente, 'directo')  as fuente,
  coalesce(dispositivo, '?')   as dispositivo,
  count(*)::int          as cantidad
from public.eventos_landing
group by 1, 2, 3, 4;

revoke all on public.eventos_landing_diario from anon, authenticated;

-- ── Verificación (opcional) ─────────────────────────────────────────────────
-- select * from public.eventos_landing_diario order by dia desc limit 10;
