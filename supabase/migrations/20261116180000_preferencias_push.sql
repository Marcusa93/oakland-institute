-- =====================================================================
-- Preferencias de notificaciones al celular
--
-- Cada persona elige qué le llega al celular. Sin fila = activada (así
-- quien nunca entró a la pantalla recibe todo, como hasta ahora).
-- Apagar una notificación NO borra nada del panel: el aviso, el mensaje o
-- la actividad siguen ahí. Solo decide si además suena en el teléfono.
-- (El correo usa public.preferencias_notificacion, por categoría.)
-- =====================================================================

create table public.preferencias_push (
  persona_id uuid not null references public.personas (id) on delete cascade,
  tipo text not null check (tipo in
    ('aviso_general', 'aviso_academico', 'aviso_pagos', 'mensaje', 'actividad', 'devolucion', 'material')),
  habilitado boolean not null default true,
  actualizado_en timestamptz not null default now(),
  primary key (persona_id, tipo)
);

alter table public.preferencias_push enable row level security;
create policy preferencias_push_propias on public.preferencias_push for select to authenticated
  using (persona_id = (select privado.persona_actual()));
-- Escritura solo con guardar_preferencias_push().

/**
 * Guarda las preferencias de quien tiene la sesión: {"mensaje": true, "material": false, …}.
 * Solo cambia los tipos que vienen; los demás quedan como estaban.
 */
create or replace function privado.guardar_preferencias_push(p_preferencias jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare v_persona uuid := privado.persona_actual();
begin
  perform privado.exigir(v_persona is not null);
  if jsonb_typeof(p_preferencias) is distinct from 'object' or exists (
    select 1 from jsonb_each(p_preferencias) e
    where e.key not in ('aviso_general', 'aviso_academico', 'aviso_pagos', 'mensaje', 'actividad', 'devolucion', 'material')
       or jsonb_typeof(e.value) <> 'boolean'
  ) then
    raise exception 'PREFERENCIA_INVALIDA';
  end if;
  insert into public.preferencias_push (persona_id, tipo, habilitado)
  select v_persona, e.key, (e.value)::boolean from jsonb_each(p_preferencias) e
  on conflict (persona_id, tipo) do update
    set habilitado = excluded.habilitado,
        actualizado_en = case when public.preferencias_push.habilitado = excluded.habilitado
                              then public.preferencias_push.actualizado_en else now() end;
end;
$$;

-- ---------------------------------------------------------------------
-- Encolar respetando las preferencias (reemplaza a la versión sin tipo)
-- ---------------------------------------------------------------------
create or replace function privado.encolar_push(p_personas uuid[], p_titulo text, p_cuerpo text, p_url text, p_etiqueta text, p_tipo text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notificaciones_push (persona_id, titulo, cuerpo, url, etiqueta)
  select distinct s.persona_id, left(p_titulo, 120), left(regexp_replace(coalesce(p_cuerpo, ''), '\s+', ' ', 'g'), 300), p_url, p_etiqueta
  from public.suscripciones_push s
  where s.persona_id = any (p_personas)
    and not exists (
      select 1 from public.preferencias_push pp
      where pp.persona_id = s.persona_id and pp.tipo = p_tipo and not pp.habilitado);
$$;

-- Avisos (incluye recordatorios de cuotas): el tipo sale de la categoría.
create or replace function privado.push_aviso()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  if new.canal <> 'interno' then return null; end if;
  select asunto, cuerpo, categoria into c from public.comunicaciones where id = new.comunicacion_id;
  perform privado.encolar_push(array[new.destinatario_persona_id], c.asunto, c.cuerpo, '/panel', 'aviso-' || new.comunicacion_id,
    case c.categoria when 'academica' then 'aviso_academico' when 'economica' then 'aviso_pagos' else 'aviso_general' end);
  return null;
end;
$$;

create or replace function privado.push_mensaje()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_asunto text;
  v_autor text;
  v_destino uuid[];
begin
  select asunto into v_asunto from public.hilos where id = new.hilo_id;
  select coalesce(nombre_preferido, split_part(nombres, ' ', 1)) || ' ' || split_part(apellidos, ' ', 1)
    into v_autor from public.personas where id = new.autor_persona_id;
  select array_agg(persona_id) into v_destino from public.hilo_participantes
   where hilo_id = new.hilo_id and persona_id <> new.autor_persona_id;
  if v_destino is not null then
    perform privado.encolar_push(v_destino, coalesce(v_autor, 'Nuevo mensaje') || ' · ' || v_asunto, new.cuerpo,
                                 '/panel/mensajes/' || new.hilo_id, 'hilo-' || new.hilo_id, 'mensaje');
  end if;
  return null;
end;
$$;

create or replace function privado.push_actividad()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.estado = 'publicada' and (tg_op = 'INSERT' or old.estado is distinct from 'publicada') then
    perform privado.encolar_push(privado.personas_de_comision(new.comision_id), 'Nueva actividad: ' || new.titulo,
      case when new.cierra_en is not null
           then 'Entregala antes del ' || to_char(new.cierra_en at time zone 'America/Argentina/Tucuman', 'DD/MM HH24:MI') || '.'
           else 'Ya está disponible en «Mis actividades».' end,
      '/panel/mis-actividades', 'actividad-' || new.id, 'actividad');
  end if;
  return null;
end;
$$;

create or replace function privado.push_devolucion()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_titulo text;
  v_estudiante uuid;
begin
  if new.publicada and not coalesce(old.publicada, false) then
    select titulo into v_titulo from public.actividades where id = new.actividad_id;
    select estudiante_id into v_estudiante from public.matriculas where id = new.matricula_id;
    perform privado.encolar_push(privado.personas_de_estudiante(v_estudiante), 'Ya está la devolución',
      'Ya corrigieron «' || coalesce(v_titulo, 'tu actividad') || '». Mirá la nota y los comentarios.', '/panel/mis-actividades',
      'devolucion-' || new.id, 'devolucion');
  end if;
  return null;
end;
$$;

create or replace function privado.push_material()
returns trigger language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  select titulo, descripcion into m from public.materiales where id = new.material_id;
  perform privado.encolar_push(privado.personas_de_comision(new.comision_id), 'Nuevo material: ' || m.titulo,
    coalesce(m.descripcion, 'Ya está en la Biblioteca para leer y escuchar.'), '/panel/material/' || new.material_id,
    'material-' || new.material_id, 'material');
  return null;
end;
$$;

drop function privado.encolar_push(uuid[], text, text, text, text);

-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
create or replace function public.guardar_preferencias_push(p_preferencias jsonb)
returns void language sql security invoker set search_path = '' as $$ select privado.guardar_preferencias_push(p_preferencias); $$;

revoke all on public.preferencias_push from anon, authenticated;
grant select on public.preferencias_push to authenticated;
grant all on public.preferencias_push to service_role;

revoke execute on function
  privado.guardar_preferencias_push(jsonb), public.guardar_preferencias_push(jsonb),
  privado.encolar_push(uuid[], text, text, text, text, text),
  privado.push_aviso(), privado.push_mensaje(), privado.push_actividad(), privado.push_devolucion(), privado.push_material()
from public, anon, authenticated;
grant execute on function privado.guardar_preferencias_push(jsonb), public.guardar_preferencias_push(jsonb)
  to authenticated, service_role;
