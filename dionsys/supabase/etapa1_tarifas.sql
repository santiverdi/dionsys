-- ============================================================================
-- Dionsys — Recepción → Tarifas, ETAPA 1 (base segura)
--
-- Qué hace:
--   1. Permiso de DUEÑO para tarifas, guardado en el servidor (permisos_tarifa).
--      Ningún admin puede dárselo desde la app: se carga solo por SQL.
--   2. Cierra la escritura pública (anon key) de las claves de tarifas en
--      app_state. Solo se guardan por la función guardar_tarifa(), que verifica
--      el PIN del dueño (con bloqueo tras 5 intentos fallidos en 15 minutos).
--   3. Historial de cambios (tarifas_historial), escrito por un trigger: queda
--      registrado TODO cambio de esas claves, venga de donde venga.
--   4. Tablas nuevas vacías: ocupación diaria, competencia y propuestas.
--
-- ORDEN DE PUESTA EN MARCHA: correr este archivo y deployar la app nueva
-- enseguida. Entre una cosa y la otra nadie puede guardar tarifas (la app vieja
-- intenta escribir directo y la base la rechaza); cotizar sigue andando igual.
--
-- Idempotente: se puede correr más de una vez.
-- ============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ── Claves protegidas ───────────────────────────────────────────────────────
create or replace function public.clave_tarifa_protegida(k text)
returns boolean language sql immutable as $$
  select k in (
    'dionsys_tarifas_dia',          -- precios y mínimos por día (Recepción → Tarifas)
    'dionsys_estadias_minimas',     -- estadías mínimas por fechas
    'dionsys_promo_anticipada',     -- reserva anticipada
    'dionsys_tarifas_protecciones', -- piso, tope de descuento, relación single
    'dionsys_tarifas'               -- tarifas pactadas del control de caja
  )
$$;

-- ── 1. Permiso de dueño ─────────────────────────────────────────────────────
create table if not exists public.permisos_tarifa (
  employee_id text primary key,          -- el id del usuario en DionSys (Usuarios)
  nombre      text not null,
  pin_hash    text not null,             -- crypt(pin, gen_salt('bf'))
  creado_en   timestamptz not null default now()
);
alter table public.permisos_tarifa enable row level security;
-- Sin políticas: la anon key no la puede leer ni escribir.

create table if not exists public.permisos_tarifa_intentos (
  id          bigserial primary key,
  employee_id text not null,
  en          timestamptz not null default now()
);
alter table public.permisos_tarifa_intentos enable row level security;

-- Devuelve el nombre del dueño si el PIN es correcto; si no, null. A propósito
-- NO corta con error ante un PIN incorrecto: un error desharía también el
-- registro del intento fallido y el bloqueo nunca se activaría.
create or replace function public._verificar_dueno(p_emp text, p_pin text)
returns text language plpgsql security definer set search_path = public, extensions as $$
declare
  v_nombre text;
begin
  if (select count(*) from permisos_tarifa_intentos
      where employee_id = p_emp and en > now() - interval '15 minutes') >= 5 then
    raise exception 'Demasiados intentos con PIN incorrecto. Probá de nuevo en 15 minutos.' using errcode = '28000';
  end if;
  select nombre into v_nombre from permisos_tarifa
   where employee_id = p_emp and pin_hash = crypt(coalesce(p_pin, ''), pin_hash);
  if v_nombre is null then
    insert into permisos_tarifa_intentos(employee_id) values (coalesce(p_emp, ''));
    return null;
  end if;
  delete from permisos_tarifa_intentos where employee_id = p_emp;
  return v_nombre;
end $$;
revoke all on function public._verificar_dueno(text, text) from public, anon, authenticated;

-- ¿Este usuario es dueño? Solo para mostrar u ocultar botones; no da permiso.
create or replace function public.es_dueno_tarifas(p_emp text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from permisos_tarifa where employee_id = p_emp)
$$;
grant execute on function public.es_dueno_tarifas(text) to anon;

-- Lo usa /api/tarifario (Web → Tarifario público) antes de publicar.
-- Devuelve el nombre del dueño, o null si no lo es.
create or replace function public.verificar_dueno_tarifas(p_emp text, p_pin text)
returns text language plpgsql security definer set search_path = public as $$
begin
  return _verificar_dueno(p_emp, p_pin);
end $$;
revoke all on function public.verificar_dueno_tarifas(text, text) from public, anon, authenticated;
grant execute on function public.verificar_dueno_tarifas(text, text) to service_role;

-- ── 3. Historial ────────────────────────────────────────────────────────────
create table if not exists public.tarifas_historial (
  id             bigserial primary key,
  creado_en      timestamptz not null default now(),
  autor_id       text,
  autor_nombre   text not null,
  clave          text not null,          -- la clave de app_state, o 'tarifario_publico'
  fechas         text[],                 -- noches que cambiaron (solo en dionsys_tarifas_dia)
  valor_anterior jsonb,                  -- foto completa ANTES
  valor_nuevo    jsonb,                  -- foto completa DESPUÉS
  motivo         text,
  revierte_id    bigint references public.tarifas_historial(id)
);
create index if not exists tarifas_historial_clave_idx on public.tarifas_historial (clave, creado_en desc);
alter table public.tarifas_historial enable row level security;
drop policy if exists "anon lee historial de tarifas" on public.tarifas_historial;
create policy "anon lee historial de tarifas" on public.tarifas_historial for select to anon using (true);
-- Sin insert para anon: lo escriben el trigger y /api/tarifario (service role).

-- Fechas (claves del objeto) cuyo valor cambió entre dos fotos.
create or replace function public._fechas_cambiadas(a jsonb, b jsonb)
returns text[] language sql immutable as $$
  select case
    when jsonb_typeof(coalesce(a, '{}')) = 'object' and jsonb_typeof(coalesce(b, '{}')) = 'object' then
      array(
        select k from (
          select jsonb_object_keys(coalesce(a, '{}')) k
          union select jsonb_object_keys(coalesce(b, '{}'))
        ) ks
        where coalesce(a, '{}') -> k is distinct from coalesce(b, '{}') -> k
        order by k
      )
    else null
  end
$$;

create or replace function public._registrar_cambio_tarifa()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_ant jsonb := case when tg_op = 'UPDATE' then old.value else null end;
begin
  if not clave_tarifa_protegida(new.key) then return new; end if;
  if v_ant is not distinct from new.value then return new; end if;
  insert into tarifas_historial(autor_id, autor_nombre, clave, fechas, valor_anterior, valor_nuevo, motivo, revierte_id)
  values (
    nullif(current_setting('dionsys.autor_id', true), ''),
    coalesce(nullif(current_setting('dionsys.autor_nombre', true), ''), 'Escritura directa (fuera de la app)'),
    new.key,
    case when new.key = 'dionsys_tarifas_dia' then _fechas_cambiadas(v_ant, new.value) end,
    v_ant, new.value,
    nullif(current_setting('dionsys.motivo', true), ''),
    nullif(current_setting('dionsys.revierte_id', true), '')::bigint
  );
  return new;
end $$;

drop trigger if exists app_state_historial_tarifas on public.app_state;
create trigger app_state_historial_tarifas
  after insert or update on public.app_state
  for each row execute function public._registrar_cambio_tarifa();

-- ── 2. Guardar (única puerta de escritura de las claves protegidas) ─────────
-- Devuelve {"ok": true, "id": <id del historial o null si no cambió nada>} o
-- {"ok": false, "error": "..."} si no es el dueño (sin cortar: ver arriba).
drop function if exists public.guardar_tarifa(text, text, text, jsonb, text, bigint);
create or replace function public.guardar_tarifa(
  p_emp text, p_pin text, p_clave text, p_valor jsonb,
  p_motivo text default null, p_revierte_id bigint default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nombre text;
  v_ant jsonb;
  v_id bigint;
begin
  v_nombre := _verificar_dueno(p_emp, p_pin);
  if v_nombre is null then
    return jsonb_build_object('ok', false, 'error', 'Solo el dueño puede cambiar tarifas.');
  end if;
  if not clave_tarifa_protegida(p_clave) then
    raise exception 'Clave no permitida: %', p_clave using errcode = '22023';
  end if;
  if p_valor is null then
    raise exception 'Falta el valor a guardar.' using errcode = '22023';
  end if;
  select value into v_ant from app_state where key = p_clave;
  if v_ant is not distinct from p_valor then
    return jsonb_build_object('ok', true, 'id', null);   -- nada cambió
  end if;

  perform set_config('dionsys.autor_id', p_emp, true);
  perform set_config('dionsys.autor_nombre', v_nombre, true);
  perform set_config('dionsys.motivo', coalesce(left(p_motivo, 500), ''), true);
  perform set_config('dionsys.revierte_id', coalesce(p_revierte_id::text, ''), true);

  insert into app_state(key, value, updated_at) values (p_clave, p_valor, now())
  on conflict (key) do update set value = excluded.value, updated_at = excluded.updated_at;

  select id into v_id from tarifas_historial where clave = p_clave order by id desc limit 1;
  return jsonb_build_object('ok', true, 'id', v_id);
end $$;
revoke all on function public.guardar_tarifa(text, text, text, jsonb, text, bigint) from public, authenticated;
grant execute on function public.guardar_tarifa(text, text, text, jsonb, text, bigint) to anon;

-- Cerrar la escritura directa de las claves protegidas (lectura sin cambios).
drop policy if exists "anon puede escribir app_state" on public.app_state;
drop policy if exists "anon inserta app_state no tarifas" on public.app_state;
drop policy if exists "anon actualiza app_state no tarifas" on public.app_state;
drop policy if exists "anon borra app_state no tarifas" on public.app_state;
create policy "anon inserta app_state no tarifas" on public.app_state
  for insert to anon with check (not public.clave_tarifa_protegida(key));
create policy "anon actualiza app_state no tarifas" on public.app_state
  for update to anon using (not public.clave_tarifa_protegida(key)) with check (not public.clave_tarifa_protegida(key));
create policy "anon borra app_state no tarifas" on public.app_state
  for delete to anon using (not public.clave_tarifa_protegida(key));

-- ── 4. Tablas nuevas (vacías; las llena una tarea automática con service role) ─

-- Ocupación por día y tipo de habitación. Cada fuente carga sus filas; el
-- calendario lee la vista ocupacion_vigente, que toma solo la fuente activa.
-- Pasar de TodoAlojamiento a Pxsol = cambiar la fila de config_ocupacion.
create table if not exists public.ocupacion_diaria (
  fecha           date not null,
  tipo_habitacion text not null,
  total           integer not null check (total >= 0),
  reservadas      integer not null check (reservadas >= 0),
  fuente          text not null check (fuente in ('todoalojamiento', 'pxsol')),
  actualizado_en  timestamptz not null default now(),
  primary key (fecha, tipo_habitacion, fuente),
  check (reservadas <= total)
);

create table if not exists public.config_ocupacion (
  id            boolean primary key default true check (id),   -- una sola fila
  fuente_activa text not null check (fuente_activa in ('todoalojamiento', 'pxsol')),
  actualizado_en timestamptz not null default now()
);
insert into public.config_ocupacion (id, fuente_activa) values (true, 'todoalojamiento')
on conflict (id) do nothing;

create or replace view public.ocupacion_vigente with (security_invoker = true) as
  select o.fecha, o.tipo_habitacion, o.total, o.reservadas, o.fuente, o.actualizado_en
  from public.ocupacion_diaria o
  join public.config_ocupacion c on c.fuente_activa = o.fuente;

create table if not exists public.competencia_hoteles (
  id          bigserial primary key,
  nombre      text not null unique,
  url_booking text,
  puntaje     numeric(3, 1) check (puntaje between 0 and 10),
  activo      boolean not null default true
);
insert into public.competencia_hoteles (nombre) values
  ('Guerrero'), ('Gran Hotel Mar del Plata'), ('Atlantic'), ('España'), ('Estocolmo'),
  ('Prince'), ('Vip''s'), ('Valles'), ('Presidente'), ('Versailles'), ('Ramos Mejía'),
  ('Delfín'), ('Gran Hotel Continental'), ('Rivoli'), ('Gran Hotel Panamericano'), ('Nuevo Ostende')
on conflict (nombre) do nothing;

-- Precio de Booking por noche; el de mostrador se estima descontando la
-- comisión: entre ÷1,20 (mínimo) y ÷1,10 (máximo).
create table if not exists public.competencia_precios (
  id                       bigserial primary key,
  hotel_id                 bigint not null references public.competencia_hoteles(id) on delete cascade,
  fecha_estadia            date not null,
  noches                   integer not null check (noches > 0),
  personas                 integer not null check (personas between 1 and 6),
  precio_booking_por_noche numeric(12, 2) not null check (precio_booking_por_noche > 0),
  mostrador_estimado_min   numeric(12, 2) generated always as (round(precio_booking_por_noche / 1.20, 2)) stored,
  mostrador_estimado_max   numeric(12, 2) generated always as (round(precio_booking_por_noche / 1.10, 2)) stored,
  relevado_en              timestamptz not null default now()
);
create index if not exists competencia_precios_fecha_idx on public.competencia_precios (fecha_estadia, personas);

-- Propuestas de los conserjes (UI en la etapa 2).
create table if not exists public.propuestas_tarifa (
  id               bigserial primary key,
  autor_id         text not null,
  autor_nombre     text not null,
  desde            date not null,
  hasta            date not null,
  precio_propuesto numeric(12, 2) check (precio_propuesto > 0),
  promo_propuesta  text,
  motivo           text not null,
  estado           text not null default 'pendiente' check (estado in ('pendiente', 'aplicada', 'rechazada')),
  respuesta        text,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now(),
  check (hasta >= desde),
  check (precio_propuesto is not null or promo_propuesta is not null)
);

alter table public.ocupacion_diaria     enable row level security;
alter table public.config_ocupacion     enable row level security;
alter table public.competencia_hoteles  enable row level security;
alter table public.competencia_precios  enable row level security;
alter table public.propuestas_tarifa    enable row level security;

-- La app solo LEE; escribe la tarea automática (service role, que saltea RLS).
drop policy if exists "anon lee ocupacion_diaria" on public.ocupacion_diaria;
create policy "anon lee ocupacion_diaria" on public.ocupacion_diaria for select to anon using (true);
drop policy if exists "anon lee config_ocupacion" on public.config_ocupacion;
create policy "anon lee config_ocupacion" on public.config_ocupacion for select to anon using (true);
drop policy if exists "anon lee competencia_hoteles" on public.competencia_hoteles;
create policy "anon lee competencia_hoteles" on public.competencia_hoteles for select to anon using (true);
drop policy if exists "anon lee competencia_precios" on public.competencia_precios;
create policy "anon lee competencia_precios" on public.competencia_precios for select to anon using (true);
-- propuestas_tarifa: cerrada para la anon key hasta la etapa 2.

-- ============================================================================
-- DESPUÉS de correr esto, cargá tu permiso de dueño (una vez). El id es el de
-- tu usuario en DionSys → Usuarios. El PIN no queda guardado en texto:
--
--   insert into public.permisos_tarifa (employee_id, nombre, pin_hash)
--   values ('<tu id>', 'Santi', extensions.crypt('<tu PIN>', extensions.gen_salt('bf')));
--
-- Si cambiás el PIN en DionSys, actualizalo acá también:
--   update public.permisos_tarifa
--      set pin_hash = extensions.crypt('<PIN nuevo>', extensions.gen_salt('bf'))
--    where employee_id = '<tu id>';
-- ============================================================================
