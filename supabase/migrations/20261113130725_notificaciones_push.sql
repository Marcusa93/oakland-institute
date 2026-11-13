-- =====================================================================
-- Notificaciones al celular (Web Push)
--
-- suscripciones_push: un registro por navegador/teléfono que aceptó recibir
--   notificaciones. La clave la da el navegador; es de esa persona.
-- notificaciones_push: cola. Los triggers de abajo encolan cuando pasa algo
--   (aviso, mensaje, actividad, devolución, material) y el servidor de la
--   app las envía (tarea cada minuto + envío inmediato después de cada
--   acción). Solo se encola para quien tiene al menos un teléfono suscripto.
-- La cola no es visible para nadie salvo el servidor (service_role).
-- =====================================================================

create table public.suscripciones_push (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references public.personas (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and length(endpoint) <= 1000),
  p256dh text not null check (length(p256dh) between 20 and 200),
  auth text not null check (length(auth) between 10 and 100),
  agente text check (length(agente) <= 300),
  creada_en timestamptz not null default now(),
  usada_en timestamptz,
  fallos int not null default 0
);
create index suscripciones_push_persona_idx on public.suscripciones_push (persona_id);

create table public.notificaciones_push (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null references public.personas (id) on delete cascade,
  titulo text not null check (length(titulo) between 1 and 120),
  cuerpo text not null check (length(cuerpo) <= 300),
  url text not null check (url ~ '^/'),
  etiqueta text,
  creada_en timestamptz not null default now(),
  tomada_en timestamptz,
  enviada_en timestamptz,
  intentos int not null default 0,
  error text
);
create index notificaciones_push_pendientes_idx on public.notificaciones_push (creada_en) where enviada_en is null;

alter table public.suscripciones_push enable row level security;
alter table public.notificaciones_push enable row level security;
create policy suscripciones_propias on public.suscripciones_push for select to authenticated
  using (persona_id = (select privado.persona_actual()));
create policy suscripciones_baja on public.suscripciones_push for delete to authenticated
  using (persona_id = (select privado.persona_actual()));
-- Alta y cambio de dueño solo con guardar_suscripcion_push(). La cola, sin políticas.

/** Alta (o reasignación, si en ese teléfono ahora entra otra persona). */
create or replace function privado.guardar_suscripcion_push(p_endpoint text, p_p256dh text, p_auth text, p_agente text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_persona uuid := privado.persona_actual();
begin
  perform privado.exigir(v_persona is not null);
  insert into public.suscripciones_push (persona_id, endpoint, p256dh, auth, agente)
  values (v_persona, p_endpoint, p_p256dh, p_auth, left(p_agente, 300))
  on conflict (endpoint) do update
    set persona_id = excluded.persona_id, p256dh = excluded.p256dh, auth = excluded.auth,
        agente = excluded.agente, fallos = 0, creada_en = now();
end;
$$;

-- ---------------------------------------------------------------------
-- Encolar
-- ---------------------------------------------------------------------
create or replace function privado.encolar_push(p_personas uuid[], p_titulo text, p_cuerpo text, p_url text, p_etiqueta text)
returns void language sql security definer set search_path = '' as $$
  insert into public.notificaciones_push (persona_id, titulo, cuerpo, url, etiqueta)
  select distinct s.persona_id, left(p_titulo, 120), left(regexp_replace(coalesce(p_cuerpo, ''), '\s+', ' ', 'g'), 300), p_url, p_etiqueta
  from public.suscripciones_push s
  where s.persona_id = any (p_personas);
$$;

/** Estudiantes con matrícula activa en la comisión y sus responsables con permiso académico. */
create or replace function privado.personas_de_comision(p_comision uuid)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct x.persona_id), '{}') from (
    select e.persona_id from public.matriculas m join public.estudiantes e on e.id = m.estudiante_id
    where m.comision_id = p_comision and m.estado = 'activa'
    union all
    select v.responsable_persona_id from public.matriculas m join public.vinculos_responsables v on v.estudiante_id = m.estudiante_id
    where m.comision_id = p_comision and m.estado = 'activa' and v.estado = 'verificado' and v.permiso_academico
  ) x;
$$;

create or replace function privado.personas_de_estudiante(p_estudiante uuid)
returns uuid[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct x.persona_id), '{}') from (
    select e.persona_id from public.estudiantes e where e.id = p_estudiante
    union all
    select v.responsable_persona_id from public.vinculos_responsables v
    where v.estudiante_id = p_estudiante and v.estado = 'verificado' and v.permiso_academico
  ) x;
$$;

-- Avisos (incluye recordatorios de cuotas): uno por destinatario interno.
create or replace function privado.push_aviso()
returns trigger language plpgsql security definer set search_path = '' as $$
declare c record;
begin
  if new.canal <> 'interno' then return null; end if;
  select asunto, cuerpo into c from public.comunicaciones where id = new.comunicacion_id;
  perform privado.encolar_push(array[new.destinatario_persona_id], c.asunto, c.cuerpo, '/panel', 'aviso-' || new.comunicacion_id);
  return null;
end;
$$;
create trigger comunicacion_envios_push after insert on public.comunicacion_envios
  for each row execute function privado.push_aviso();

-- Mensajes: a los demás participantes del hilo.
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
                                 '/panel/mensajes/' || new.hilo_id, 'hilo-' || new.hilo_id);
  end if;
  return null;
end;
$$;
create trigger mensajes_push after insert on public.mensajes
  for each row execute function privado.push_mensaje();

-- Actividad publicada: a la comisión.
create or replace function privado.push_actividad()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.estado = 'publicada' and (tg_op = 'INSERT' or old.estado is distinct from 'publicada') then
    perform privado.encolar_push(privado.personas_de_comision(new.comision_id), 'Nueva actividad: ' || new.titulo,
      case when new.cierra_en is not null
           then 'Entregala antes del ' || to_char(new.cierra_en at time zone 'America/Argentina/Tucuman', 'DD/MM HH24:MI') || '.'
           else 'Ya está disponible en «Mis actividades».' end,
      '/panel/mis-actividades', 'actividad-' || new.id);
  end if;
  return null;
end;
$$;
create trigger actividades_push after insert or update of estado on public.actividades
  for each row execute function privado.push_actividad();

-- Devolución publicada: al estudiante y a su familia.
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
      'Ya corrigieron «' || coalesce(v_titulo, 'tu actividad') || '». Mirá la nota y los comentarios.', '/panel/mis-actividades', 'devolucion-' || new.id);
  end if;
  return null;
end;
$$;
create trigger entregas_push after update of publicada on public.entregas
  for each row execute function privado.push_devolucion();

-- Material compartido con una comisión.
create or replace function privado.push_material()
returns trigger language plpgsql security definer set search_path = '' as $$
declare m record;
begin
  select titulo, descripcion into m from public.materiales where id = new.material_id;
  perform privado.encolar_push(privado.personas_de_comision(new.comision_id), 'Nuevo material: ' || m.titulo,
    coalesce(m.descripcion, 'Ya está en la Biblioteca para leer y escuchar.'), '/panel/material/' || new.material_id, 'material-' || new.material_id);
  return null;
end;
$$;
create trigger material_comisiones_push after insert on public.material_comisiones
  for each row execute function privado.push_material();

-- ---------------------------------------------------------------------
-- Envío (solo el servidor)
-- ---------------------------------------------------------------------
/**
 * Toma hasta p_limite notificaciones pendientes (de las últimas 24 h) con
 * sus suscripciones. Dos envíos simultáneos no toman la misma (SKIP LOCKED),
 * y una tomada hace menos de 2 minutos no se vuelve a tomar.
 */
create or replace function public.tomar_notificaciones_push(p_limite int default 100)
returns table (id uuid, titulo text, cuerpo text, url text, etiqueta text, suscripciones jsonb)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with tomadas as (
    update public.notificaciones_push n
       set tomada_en = now(), intentos = n.intentos + 1
     where n.id in (
       select q.id from public.notificaciones_push q
        where q.enviada_en is null and q.intentos < 5 and q.creada_en > now() - interval '1 day'
          and (q.tomada_en is null or q.tomada_en < now() - interval '2 minutes')
        order by q.creada_en
        limit greatest(1, least(p_limite, 500))
        for update skip locked)
    returning n.id, n.persona_id, n.titulo, n.cuerpo, n.url, n.etiqueta
  )
  select t.id, t.titulo, t.cuerpo, t.url, t.etiqueta,
         coalesce((select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
                   from public.suscripciones_push s where s.persona_id = t.persona_id), '[]'::jsonb)
  from tomadas t;
end;
$$;

grant select, delete on public.suscripciones_push to authenticated;
grant all on public.suscripciones_push, public.notificaciones_push to service_role;

revoke execute on function
  privado.guardar_suscripcion_push(text, text, text, text), privado.encolar_push(uuid[], text, text, text, text),
  privado.personas_de_comision(uuid), privado.personas_de_estudiante(uuid),
  privado.push_aviso(), privado.push_mensaje(), privado.push_actividad(), privado.push_devolucion(), privado.push_material(),
  public.tomar_notificaciones_push(int)
from public, anon, authenticated;
grant execute on function privado.guardar_suscripcion_push(text, text, text, text) to authenticated, service_role;
grant execute on function public.tomar_notificaciones_push(int) to service_role;

create or replace function public.guardar_suscripcion_push(p_endpoint text, p_p256dh text, p_auth text, p_agente text default null)
returns void language sql security invoker set search_path = '' as $$ select privado.guardar_suscripcion_push(p_endpoint, p_p256dh, p_auth, p_agente); $$;
revoke execute on function public.guardar_suscripcion_push(text, text, text, text) from public, anon;
grant execute on function public.guardar_suscripcion_push(text, text, text, text) to authenticated, service_role;
