-- ============================================================================
-- DionSys · Tarifas ETAPA 2 — promos, agregados y propuestas de los conserjes
-- ============================================================================
-- Va DESPUÉS de etapa1_tarifas.sql. Se puede correr más de una vez.
--
-- Qué hace:
--   1. Suma 'dionsys_promos' y 'dionsys_agregados' a las claves protegidas:
--      solo el dueño las guarda (guardar_tarifa) y cada cambio queda en
--      tarifas_historial. El efectivo por rango escribe en 'dionsys_tarifas_dia',
--      que ya estaba protegida. No toca la tabla temporadas.
--   2. Propuestas de los conserjes (propuestas_tarifa, creada vacía en la
--      etapa 1): el conserje propone y ve las suyas; el dueño, con su PIN,
--      lista, aplica o rechaza. La tabla sigue cerrada para la anon key: todo
--      pasa por estas funciones.
--
-- ORDEN DE PUESTA EN MARCHA: correr este archivo antes de guardar desde la
-- pantalla Promos. Sin él, guardar una promo o un agregado da "Clave no
-- permitida"; cotizar sigue andando igual con las promos de siempre.
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
    'dionsys_promos',               -- promos de la cotización (pantalla Promos)
    'dionsys_agregados'             -- media pensión, pensión completa… (pantalla Promos)
  )
$$;

-- ── 2. Propuestas de los conserjes ──────────────────────────────────────────
-- Límite que conviene saber: los PIN de los conserjes no viven en el servidor,
-- así que la base no puede comprobar QUIÉN propone. Por eso proponer solo crea
-- una sugerencia pendiente (con límite por hora) y todo lo demás lo decide el
-- dueño con su PIN.

alter table public.propuestas_tarifa add column if not exists historial_id bigint references public.tarifas_historial(id);
alter table public.propuestas_tarifa add column if not exists resuelto_por text;
alter table public.propuestas_tarifa add column if not exists resuelto_en  timestamptz;
alter table public.propuestas_tarifa add column if not exists avisado_en   timestamptz;  -- mail al dueño (api/aviso-propuesta.js)
create index if not exists propuestas_tarifa_autor_idx  on public.propuestas_tarifa (autor_id, creado_en desc);
create index if not exists propuestas_tarifa_estado_idx on public.propuestas_tarifa (estado, creado_en desc);

-- El conserje propone. Devuelve el id de la propuesta.
create or replace function public.crear_propuesta_tarifa(
  p_emp text, p_nombre text, p_desde date, p_hasta date,
  p_precio numeric, p_promo text, p_motivo text
) returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_id bigint;
  v_promo text := nullif(btrim(coalesce(p_promo, '')), '');
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  if coalesce(btrim(p_emp), '') = '' or coalesce(btrim(p_nombre), '') = '' then
    raise exception 'Tenés que iniciar sesión.' using errcode = '22023';
  end if;
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'Las fechas no son válidas.' using errcode = '22023';
  end if;
  if p_desde < current_date - 1 or p_hasta > current_date + 730 or p_hasta - p_desde > 120 then
    raise exception 'Las fechas tienen que ser futuras y de 120 noches como mucho.' using errcode = '22023';
  end if;
  if p_precio is null and v_promo is null then
    raise exception 'Falta el precio o la promo que proponés.' using errcode = '22023';
  end if;
  if p_precio is not null and (p_precio <= 0 or p_precio > 10000000) then
    raise exception 'El precio no es válido.' using errcode = '22023';
  end if;
  if v_motivo = '' then
    raise exception 'Falta el motivo.' using errcode = '22023';
  end if;
  if length(v_motivo) > 500 or length(coalesce(v_promo, '')) > 300 or length(p_nombre) > 80 or length(p_emp) > 40 then
    raise exception 'El texto es demasiado largo.' using errcode = '22023';
  end if;
  if (select count(*) from propuestas_tarifa where autor_id = p_emp and creado_en > now() - interval '1 hour') >= 10
     or (select count(*) from propuestas_tarifa where creado_en > now() - interval '1 hour') >= 50 then
    raise exception 'Demasiadas propuestas en la última hora. Probá más tarde.' using errcode = '54000';
  end if;
  insert into propuestas_tarifa (autor_id, autor_nombre, desde, hasta, precio_propuesto, promo_propuesta, motivo)
  values (btrim(p_emp), btrim(p_nombre), p_desde, p_hasta, p_precio, v_promo, v_motivo)
  returning id into v_id;
  return v_id;
end $$;

-- Las propuestas de un conserje (las últimas 50), con el estado y la respuesta.
create or replace function public.mis_propuestas_tarifa(p_emp text)
returns setof public.propuestas_tarifa language sql stable security definer set search_path = public as $$
  select * from propuestas_tarifa where autor_id = p_emp order by creado_en desc limit 50
$$;

-- Para el contador del menú del dueño (no muestra contenido).
create or replace function public.contar_propuestas_pendientes()
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::integer from propuestas_tarifa where estado = 'pendiente'
$$;

-- Bandeja del dueño: {"ok": true, "propuestas": [...]} (pendientes primero, hasta 200).
create or replace function public.listar_propuestas_tarifa(p_emp text, p_pin text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if _verificar_dueno(p_emp, p_pin) is null then
    return jsonb_build_object('ok', false, 'error', 'Solo el dueño ve las propuestas.');
  end if;
  return jsonb_build_object('ok', true, 'propuestas', coalesce((
    select jsonb_agg(to_jsonb(x) order by (x.estado = 'pendiente') desc, x.creado_en desc)
    from (select * from propuestas_tarifa order by (estado = 'pendiente') desc, creado_en desc limit 200) x
  ), '[]'::jsonb));
end $$;

-- El dueño aplica o rechaza una pendiente. Al aplicar, p_historial_id es el
-- cambio de tarifas que la aplicó (lo devuelve guardar_tarifa), si lo hubo.
create or replace function public.resolver_propuesta_tarifa(
  p_emp text, p_pin text, p_id bigint, p_estado text, p_respuesta text default null, p_historial_id bigint default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_nombre text;
begin
  v_nombre := _verificar_dueno(p_emp, p_pin);
  if v_nombre is null then
    return jsonb_build_object('ok', false, 'error', 'Solo el dueño resuelve propuestas.');
  end if;
  if p_estado not in ('aplicada', 'rechazada') then
    raise exception 'Estado no válido: %', p_estado using errcode = '22023';
  end if;
  update propuestas_tarifa
     set estado = p_estado,
         respuesta = nullif(left(btrim(coalesce(p_respuesta, '')), 500), ''),
         historial_id = p_historial_id,
         resuelto_por = v_nombre,
         resuelto_en = now(),
         actualizado_en = now()
   where id = p_id and estado = 'pendiente';
  if not found then
    return jsonb_build_object('ok', false, 'error', 'La propuesta no existe o ya estaba resuelta.');
  end if;
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.crear_propuesta_tarifa(text, text, date, date, numeric, text, text) from public, authenticated;
revoke all on function public.mis_propuestas_tarifa(text) from public, authenticated;
revoke all on function public.contar_propuestas_pendientes() from public, authenticated;
revoke all on function public.listar_propuestas_tarifa(text, text) from public, authenticated;
revoke all on function public.resolver_propuesta_tarifa(text, text, bigint, text, text, bigint) from public, authenticated;
grant execute on function public.crear_propuesta_tarifa(text, text, date, date, numeric, text, text) to anon;
grant execute on function public.mis_propuestas_tarifa(text) to anon;
grant execute on function public.contar_propuestas_pendientes() to anon;
grant execute on function public.listar_propuestas_tarifa(text, text) to anon;
grant execute on function public.resolver_propuesta_tarifa(text, text, bigint, text, text, bigint) to anon;
