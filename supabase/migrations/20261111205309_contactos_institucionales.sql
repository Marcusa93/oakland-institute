-- =====================================================================
-- 12 · Datos mínimos para la mensajería institucional
-- Funciones acotadas en lugar de abrir tablas: devuelven solo nombre y rol,
-- nunca datos de contacto.
-- =====================================================================

-- Personal de gestión al que cualquier cuenta activa puede escribirle.
create or replace function privado.contactos_institucionales()
returns table (persona_id uuid, nombre text, rol text)
language sql stable security definer set search_path = '' as $$
  select distinct on (p.id) p.id, p.nombres || ' ' || p.apellidos,
         case when bool_or(r.rol = 'direccion') over (partition by p.id) then 'Dirección' else 'Administración' end
  from public.roles_asignados r
  join public.cuentas c on c.id = r.cuenta_id and c.estado = 'activa'
  join public.personas p on p.id = c.persona_id
  where r.rol in ('administracion', 'direccion') and r.revocado_en is null
    and privado.persona_actual() is not null
  order by p.id;
$$;

-- Nombres de quienes participan en una conversación (para participantes y
-- para dirección en los hilos que supervisa).
create or replace function privado.participantes_de_hilo(p_hilo uuid)
returns table (persona_id uuid, nombre text, es_personal boolean)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nombres || ' ' || p.apellidos, privado.es_personal(p.id)
  from public.hilo_participantes h join public.personas p on p.id = h.persona_id
  where h.hilo_id = p_hilo
    and (privado.es_participante(p_hilo)
         or exists (select 1 from public.hilos x where x.id = p_hilo and x.estudiante_id is not null and privado.es_direccion()));
$$;

-- Responsables con permiso académico de un estudiante, para su docente (o
-- gestión). Sin contacto: solo para poder escribirles por el canal.
create or replace function privado.responsables_academicos(p_estudiante uuid)
returns table (persona_id uuid, nombre text, parentesco text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.nombres || ' ' || p.apellidos, v.parentesco
  from public.vinculos_responsables v join public.personas p on p.id = v.responsable_persona_id
  where v.estudiante_id = p_estudiante and v.estado = 'verificado' and v.permiso_academico
    and (privado.es_gestion() or privado.es_docente_del_estudiante(p_estudiante));
$$;

create or replace function public.contactos_institucionales()
returns table (persona_id uuid, nombre text, rol text)
language sql stable security invoker set search_path = '' as $$ select * from privado.contactos_institucionales(); $$;
create or replace function public.participantes_de_hilo(p_hilo uuid)
returns table (persona_id uuid, nombre text, es_personal boolean)
language sql stable security invoker set search_path = '' as $$ select * from privado.participantes_de_hilo(p_hilo); $$;
create or replace function public.responsables_academicos(p_estudiante uuid)
returns table (persona_id uuid, nombre text, parentesco text)
language sql stable security invoker set search_path = '' as $$ select * from privado.responsables_academicos(p_estudiante); $$;

revoke execute on function privado.contactos_institucionales(), privado.participantes_de_hilo(uuid),
  privado.responsables_academicos(uuid), public.contactos_institucionales(), public.participantes_de_hilo(uuid),
  public.responsables_academicos(uuid) from public, anon;
grant execute on function privado.contactos_institucionales(), privado.participantes_de_hilo(uuid),
  privado.responsables_academicos(uuid), public.contactos_institucionales(), public.participantes_de_hilo(uuid),
  public.responsables_academicos(uuid) to authenticated, service_role;
