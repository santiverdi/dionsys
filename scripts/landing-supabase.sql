-- Ajustes en Supabase para la conexión DionSys <-> landing pública.
-- Correr UNA VEZ en supabase.com -> tu proyecto -> SQL Editor.
--
-- Cómo está armado el lado de la landing en esta base:
--   - Tablas reales: temporadas, tarifas, findes_largos, fechas_bloqueadas,
--     promociones, config_tarifario. La anon key las LEE pero no las escribe
--     (bien: nadie puede tocar los precios desde el navegador).
--   - Vista tarifario_publico: arma el JSON único que consume el calculador.
--   - Publicar desde DionSys pasa por /api/tarifario (service role key +
--     LANDING_TOKEN); leer consultas pasa por /api/leads. Ver api/*.js.

-- ── 1. Recargos de findes largos al 50% ─────────────────────────────────────
-- El tarifario del dueño define +50% para estos cuatro (hoy están en +20%,
-- o sea que la landing los cotiza más baratos de lo pactado).
update public.findes_largos
   set recargo = 0.5
 where nombre in ('Inmaculada', 'Navidad', 'Año Nuevo', 'Carnaval');

-- ── 2. leads: el público solo inserta ───────────────────────────────────────
-- Hoy la tabla se puede LEER con la anon key, que está a la vista en el código
-- fuente de la landing: cualquiera podría descargar nombres y teléfonos de los
-- huéspedes. Esto la deja solo-INSERT (lo único que la landing necesita); las
-- consultas se leen desde DionSys vía /api/leads con la service role key.
alter table public.leads enable row level security;

-- Borrar TODAS las políticas existentes de leads (incluida la de lectura
-- abierta, tenga el nombre que tenga) y dejar solo la de insertar.
do $$
declare p record;
begin
  for p in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'leads'
  loop
    execute format('drop policy %I on public.leads', p.policyname);
  end loop;
end $$;

create policy leads_solo_insertar on public.leads
  for insert to anon, authenticated with check (true);

-- ── Verificación (opcional, correr después) ─────────────────────────────────
-- Los cuatro findes en 0.5:
--   select nombre, recargo from public.findes_largos order by desde;
-- Solo la política de insert:
--   select policyname, cmd from pg_policies
--     where schemaname = 'public' and tablename = 'leads';
-- La anon key ya no lee leads (debe devolver []):
--   curl "https://TU-PROYECTO.supabase.co/rest/v1/leads?select=*" \
--     -H "apikey: TU_ANON_KEY" -H "Authorization: Bearer TU_ANON_KEY"
