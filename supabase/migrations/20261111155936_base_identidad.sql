-- =====================================================================
-- 01 · Base e identidad
-- Persona ≠ cuenta ≠ estudiante ≠ responsable. Roles de personal aparte.
-- Zona horaria de negocio: America/Argentina/Tucuman (los timestamps se
-- guardan en UTC con timestamptz; las fechas de negocio son `date`).
-- =====================================================================

create extension if not exists btree_gist;

-- Esquema NO expuesto por la API: funciones privilegiadas y auxiliares.
create schema if not exists privado;

-- ---------------------------------------------------------------------
-- Tipos
-- ---------------------------------------------------------------------
create type public.rol_personal as enum ('docente', 'administracion', 'direccion');
create type public.estado_cuenta as enum ('activa', 'suspendida');
create type public.estado_estudiante as enum ('aspirante', 'activo', 'inactivo', 'egresado');
create type public.estado_vinculo as enum ('invitado', 'aceptado', 'verificado', 'rechazado', 'revocado');

-- ---------------------------------------------------------------------
-- Sedes (una sola en la v1; deja margen sin volver el sistema multiempresa)
-- ---------------------------------------------------------------------
create table public.sedes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  direccion text,
  activa boolean not null default true,
  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Personas: dato mínimo e identificatorio. Lo sensible va en personas_datos.
-- ---------------------------------------------------------------------
create table public.personas (
  id uuid primary key default gen_random_uuid(),
  nombres text not null check (length(btrim(nombres)) > 0),
  apellidos text not null check (length(btrim(apellidos)) > 0),
  nombre_preferido text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  eliminada_en timestamptz
);
create index personas_apellidos_idx on public.personas (lower(apellidos), lower(nombres));

create table public.personas_datos (
  persona_id uuid primary key references public.personas (id) on delete cascade,
  tipo_documento text check (tipo_documento in ('DNI', 'PASAPORTE', 'OTRO')),
  numero_documento text,
  fecha_nacimiento date,
  email text,
  telefono text,
  domicilio text,
  actualizado_en timestamptz not null default now(),
  check ((tipo_documento is null) = (numero_documento is null))
);
-- Detección de duplicados: un documento identifica a una sola persona.
create unique index personas_datos_documento_uq
  on public.personas_datos (tipo_documento, numero_documento)
  where numero_documento is not null;
create index personas_datos_email_idx on public.personas_datos (lower(email));

-- ---------------------------------------------------------------------
-- Cuentas de acceso: 1 cuenta de Supabase Auth ↔ 1 persona.
-- Las crea administración por invitación; no hay registro abierto.
-- ---------------------------------------------------------------------
create table public.cuentas (
  id uuid primary key references auth.users (id) on delete cascade,
  persona_id uuid not null unique references public.personas (id),
  estado public.estado_cuenta not null default 'activa',
  creado_en timestamptz not null default now()
);

-- Roles de personal. "Estudiante" y "tutor" NO son roles asignables:
-- se derivan de los datos (estudiantes.persona_id y vínculos verificados).
create table public.roles_asignados (
  id uuid primary key default gen_random_uuid(),
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  rol public.rol_personal not null,
  sede_id uuid references public.sedes (id),
  otorgado_por uuid references public.cuentas (id),
  otorgado_en timestamptz not null default now(),
  revocado_por uuid references public.cuentas (id),
  revocado_en timestamptz
);
create unique index roles_asignados_activo_uq
  on public.roles_asignados (cuenta_id, rol) where revocado_en is null;

-- ---------------------------------------------------------------------
-- Estudiantes: pueden existir sin cuenta propia.
-- ---------------------------------------------------------------------
create sequence public.estudiantes_legajo_seq start 1000;

create table public.estudiantes (
  id uuid primary key default gen_random_uuid(),
  persona_id uuid not null unique references public.personas (id),
  legajo text not null unique default ('E-' || nextval('public.estudiantes_legajo_seq')),
  estado public.estado_estudiante not null default 'aspirante',
  fecha_alta date not null default (now() at time zone 'America/Argentina/Tucuman')::date,
  creado_en timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Vínculos responsable ↔ estudiante, con permisos diferenciados.
-- Solo el estado 'verificado' otorga acceso.
-- ---------------------------------------------------------------------
create table public.vinculos_responsables (
  id uuid primary key default gen_random_uuid(),
  estudiante_id uuid not null references public.estudiantes (id),
  responsable_persona_id uuid not null references public.personas (id),
  parentesco text,
  estado public.estado_vinculo not null default 'invitado',
  permiso_academico boolean not null default false,
  permiso_documental boolean not null default false,
  permiso_economico boolean not null default false,
  es_responsable_pago boolean not null default false,
  es_contacto_emergencia boolean not null default false,
  invitado_por uuid references public.cuentas (id),
  invitado_en timestamptz not null default now(),
  aceptado_en timestamptz,
  verificado_por uuid references public.cuentas (id),
  verificado_en timestamptz,
  revocado_por uuid references public.cuentas (id),
  revocado_en timestamptz,
  motivo_cierre text,
  check (estado <> 'verificado' or (verificado_por is not null and verificado_en is not null)),
  check (estado <> 'revocado' or revocado_en is not null)
);
-- Un solo vínculo abierto por par estudiante/responsable; el historial queda.
create unique index vinculos_abierto_uq
  on public.vinculos_responsables (estudiante_id, responsable_persona_id)
  where estado in ('invitado', 'aceptado', 'verificado');
create index vinculos_responsable_idx
  on public.vinculos_responsables (responsable_persona_id) where estado = 'verificado';
create index vinculos_estudiante_idx on public.vinculos_responsables (estudiante_id);

-- Estado → transición válida (la función de negocio usa esta tabla de verdad).
create or replace function privado.vinculo_transicion_valida(de public.estado_vinculo, a public.estado_vinculo)
returns boolean language sql immutable set search_path = '' as $$
  select (de, a) in (
    ('invitado', 'aceptado'), ('invitado', 'rechazado'), ('invitado', 'revocado'),
    ('invitado', 'verificado'), -- verificación presencial por administración
    ('aceptado', 'verificado'), ('aceptado', 'rechazado'), ('aceptado', 'revocado'),
    ('verificado', 'revocado')
  );
$$;

-- ---------------------------------------------------------------------
-- Auditoría: solo inserción; registra antes/después de operaciones críticas.
-- ---------------------------------------------------------------------
create table public.auditoria (
  id bigint generated always as identity primary key,
  ocurrido_en timestamptz not null default now(),
  actor_cuenta_id uuid,
  accion text not null,
  tabla text not null,
  registro_id text,
  antes jsonb,
  despues jsonb,
  contexto jsonb
);
create index auditoria_tabla_registro_idx on public.auditoria (tabla, registro_id, ocurrido_en desc);
create index auditoria_actor_idx on public.auditoria (actor_cuenta_id, ocurrido_en desc);

create or replace function privado.auditar()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_antes jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_despues jsonb := case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end;
begin
  insert into public.auditoria (actor_cuenta_id, accion, tabla, registro_id, antes, despues)
  values (
    (select auth.uid()),
    tg_op,
    tg_table_name,
    coalesce(v_despues ->> 'id', v_antes ->> 'id', v_despues ->> 'persona_id', v_antes ->> 'persona_id',
             v_despues ->> 'matricula_id', v_antes ->> 'matricula_id'),
    v_antes,
    v_despues
  );
  return coalesce(new, old);
end;
$$;

create or replace function privado.impedir_cambios()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'REGISTRO_INMUTABLE: % no admite % (usar ajustes o reversos)', tg_table_name, tg_op
    using errcode = 'P0001';
end;
$$;

create trigger auditoria_inmutable before update or delete on public.auditoria
  for each row execute function privado.impedir_cambios();

create or replace function privado.tocar_actualizado_en()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

create trigger personas_actualizado before update on public.personas
  for each row execute function privado.tocar_actualizado_en();
create trigger personas_datos_actualizado before update on public.personas_datos
  for each row execute function privado.tocar_actualizado_en();

create trigger auditar_roles after insert or update or delete on public.roles_asignados
  for each row execute function privado.auditar();
create trigger auditar_vinculos after insert or update or delete on public.vinculos_responsables
  for each row execute function privado.auditar();
create trigger auditar_cuentas after insert or update or delete on public.cuentas
  for each row execute function privado.auditar();

-- ---------------------------------------------------------------------
-- Funciones auxiliares de autorización (usadas por RLS y por las RPC).
-- SECURITY DEFINER en esquema no expuesto: leen tablas de identidad sin
-- depender de las políticas del llamador y sin recursión de RLS.
-- Nunca leen metadatos editables por el usuario.
-- ---------------------------------------------------------------------
create or replace function privado.persona_actual()
returns uuid language sql stable security definer set search_path = '' as $$
  select c.persona_id from public.cuentas c
  where c.id = (select auth.uid()) and c.estado = 'activa';
$$;

create or replace function privado.tiene_rol(p_rol public.rol_personal)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.roles_asignados r
    join public.cuentas c on c.id = r.cuenta_id
    where r.cuenta_id = (select auth.uid())
      and r.rol = p_rol
      and r.revocado_en is null
      and c.estado = 'activa'
  );
$$;

-- Gestión = administración o dirección.
create or replace function privado.es_gestion()
returns boolean language sql stable security definer set search_path = '' as $$
  select privado.tiene_rol('administracion') or privado.tiene_rol('direccion');
$$;

create or replace function privado.es_direccion()
returns boolean language sql stable security definer set search_path = '' as $$
  select privado.tiene_rol('direccion');
$$;

-- ¿La cuenta actual es el propio estudiante?
create or replace function privado.es_el_estudiante(p_estudiante uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.estudiantes e
    where e.id = p_estudiante and e.persona_id = privado.persona_actual()
  );
$$;

-- ¿La cuenta actual es responsable VERIFICADO del estudiante con ese permiso?
-- p_ambito: 'academico' | 'documental' | 'economico' | 'cualquiera'
create or replace function privado.es_responsable_de(p_estudiante uuid, p_ambito text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.vinculos_responsables v
    where v.estudiante_id = p_estudiante
      and v.responsable_persona_id = privado.persona_actual()
      and v.estado = 'verificado'
      and case p_ambito
            when 'academico' then v.permiso_academico
            when 'documental' then v.permiso_documental
            when 'economico' then v.permiso_economico
            when 'cualquiera' then true
            else false
          end
  );
$$;

create or replace function privado.exigir(p_condicion boolean, p_mensaje text default 'NO_AUTORIZADO')
returns void language plpgsql set search_path = '' as $$
begin
  if p_condicion is not true then
    raise exception '%', p_mensaje using errcode = '42501';
  end if;
end;
$$;
