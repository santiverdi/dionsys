-- Políticas de acceso para la conexión DionSys <-> landing pública.
-- Correr UNA VEZ en supabase.com -> tu proyecto -> SQL Editor.
--
-- Qué arregla: hoy la tabla `leads` se puede LEER con la anon key, que está a la
-- vista en el código fuente de la landing. Cuando haya consultas reales,
-- cualquiera podría descargar nombres y teléfonos de los huéspedes.
--
-- Después de correr esto:
--   - leads: el público solo puede INSERTAR consultas (lo que hace la landing).
--     Leerlas queda reservado al endpoint /api/leads de DionSys, que usa la
--     service role key (configurar en Vercel: SUPABASE_SERVICE_ROLE_KEY y
--     LANDING_LEADS_TOKEN — ver api/leads.js).
--   - tarifario_publico: lectura pública (la landing lo consume) y escritura con
--     la anon key (DionSys publica el tarifario desde el navegador).
--
-- ⚠️ Limitación conocida (la misma que app_state, ver src/lib/cloudStore.ts):
-- mientras la escritura del tarifario use la anon key, cualquiera con esa clave
-- podría modificarlo. La protección real requiere autenticación de Supabase
-- (RLS por rol/JWT), pendiente para otra sesión.

-- ── leads: el público solo inserta ──────────────────────────────────────────
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

-- ── tarifario_publico: leer todos, escribir con la anon key ─────────────────
-- Si tarifario_publico fuera una vista (no una tabla), esto avisa y no toca nada.
do $$
declare p record;
begin
  if exists (
    select 1 from pg_tables
    where schemaname = 'public' and tablename = 'tarifario_publico'
  ) then
    execute 'alter table public.tarifario_publico enable row level security';
    for p in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = 'tarifario_publico'
    loop
      execute format('drop policy %I on public.tarifario_publico', p.policyname);
    end loop;
    execute 'create policy tarifario_leer on public.tarifario_publico for select using (true)';
    execute 'create policy tarifario_actualizar on public.tarifario_publico for update to anon, authenticated using (true) with check (true)';
    execute 'create policy tarifario_insertar on public.tarifario_publico for insert to anon, authenticated with check (true)';
  else
    raise notice 'tarifario_publico no es una tabla (¿es una vista?): revisar a mano cómo se escribe.';
  end if;
end $$;

-- ── Verificación (opcional, correr después) ─────────────────────────────────
-- select tablename, policyname, cmd, roles from pg_policies
--   where schemaname = 'public' and tablename in ('leads', 'tarifario_publico');
--
-- Probar que la anon key YA NO lee leads (debe devolver []):
--   curl "https://TU-PROYECTO.supabase.co/rest/v1/leads?select=*" \
--     -H "apikey: TU_ANON_KEY" -H "Authorization: Bearer TU_ANON_KEY"
