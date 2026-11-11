-- =====================================================================
-- 03 · Captación y admisiones
-- consulta ≠ solicitud de inscripción ≠ reserva de vacante ≠ matrícula
-- =====================================================================

create type public.origen_consulta as enum
  ('web', 'whatsapp', 'telefono', 'presencial', 'referido', 'redes', 'otro');
create type public.estado_consulta as enum
  ('nueva', 'contactada', 'nivelacion', 'solicitud', 'ganada', 'perdida');
create type public.tipo_consulta as enum ('consulta', 'preinscripcion');
create type public.estado_solicitud as enum
  ('pendiente', 'en_revision', 'aprobada', 'rechazada', 'cancelada', 'confirmada');
create type public.estado_nivelacion as enum ('programada', 'realizada', 'ausente', 'cancelada');

-- Textos legales versionados (privacidad, autorizaciones). El contenido lo
-- define el instituto; acá solo se versiona y se registra quién aceptó qué.
create table public.versiones_consentimiento (
  id uuid primary key default gen_random_uuid(),
  tipo text not null,
  version int not null check (version > 0),
  texto text not null,
  vigente_desde timestamptz not null default now(),
  aprobado_por uuid references public.cuentas (id),
  unique (tipo, version)
);

create table public.consentimientos (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.versiones_consentimiento (id),
  persona_id uuid references public.personas (id),
  estudiante_id uuid references public.estudiantes (id),
  consulta_id uuid,
  otorgado_en timestamptz not null default now(),
  revocado_en timestamptz,
  medio text not null default 'web'
);
create index consentimientos_persona_idx on public.consentimientos (persona_id);

create table public.consultas (
  id uuid primary key default gen_random_uuid(),
  creada_en timestamptz not null default now(),
  tipo public.tipo_consulta not null default 'consulta',
  -- Datos mínimos de contacto del adulto que consulta.
  nombre_contacto text not null check (length(btrim(nombre_contacto)) between 2 and 120),
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  telefono text check (telefono is null or length(telefono) between 6 and 30),
  es_para_menor boolean not null default false,
  nombre_estudiante text check (nombre_estudiante is null or length(nombre_estudiante) <= 120),
  edad_estudiante int check (edad_estudiante between 3 and 99),
  curso_interes_id uuid references public.cursos (id),
  comision_interes_id uuid references public.comisiones (id),
  mensaje text check (mensaje is null or length(mensaje) <= 2000),
  origen public.origen_consulta not null default 'web',
  origen_detalle text check (origen_detalle is null or length(origen_detalle) <= 200),
  consentimiento_version_id uuid references public.versiones_consentimiento (id),
  -- Seguimiento comercial
  estado public.estado_consulta not null default 'nueva',
  responsable_cuenta_id uuid references public.cuentas (id),
  proxima_accion text,
  proxima_accion_en timestamptz,
  motivo_perdida text,
  -- Se completan al convertir (única fuente: no se recargan los datos).
  persona_contacto_id uuid references public.personas (id),
  estudiante_id uuid references public.estudiantes (id),
  check (email is not null or telefono is not null),
  check (estado <> 'perdida' or motivo_perdida is not null)
);
create index consultas_estado_idx on public.consultas (estado, proxima_accion_en);
create index consultas_creada_idx on public.consultas (creada_en desc);

alter table public.consentimientos
  add constraint consentimientos_consulta_fk foreign key (consulta_id) references public.consultas (id) on delete set null;

create table public.consulta_eventos (
  id uuid primary key default gen_random_uuid(),
  consulta_id uuid not null references public.consultas (id) on delete cascade,
  ocurrido_en timestamptz not null default now(),
  autor_cuenta_id uuid references public.cuentas (id),
  tipo text not null check (tipo in ('creacion', 'nota', 'cambio_estado', 'asignacion', 'contacto')),
  estado_anterior public.estado_consulta,
  estado_nuevo public.estado_consulta,
  nota text
);
create index consulta_eventos_idx on public.consulta_eventos (consulta_id, ocurrido_en);

-- Historial automático: la fuente del historial es el propio cambio.
create or replace function privado.registrar_evento_consulta()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.consulta_eventos (consulta_id, autor_cuenta_id, tipo, estado_nuevo)
    values (new.id, (select auth.uid()), 'creacion', new.estado);
  elsif new.estado is distinct from old.estado then
    insert into public.consulta_eventos (consulta_id, autor_cuenta_id, tipo, estado_anterior, estado_nuevo, nota)
    values (new.id, (select auth.uid()), 'cambio_estado', old.estado, new.estado, new.motivo_perdida);
  elsif new.responsable_cuenta_id is distinct from old.responsable_cuenta_id then
    insert into public.consulta_eventos (consulta_id, autor_cuenta_id, tipo)
    values (new.id, (select auth.uid()), 'asignacion');
  end if;
  return new;
end;
$$;
create trigger consultas_historial after insert or update on public.consultas
  for each row execute function privado.registrar_evento_consulta();

create table public.nivelaciones (
  id uuid primary key default gen_random_uuid(),
  consulta_id uuid references public.consultas (id) on delete set null,
  estudiante_id uuid references public.estudiantes (id),
  programada_para timestamptz,
  estado public.estado_nivelacion not null default 'programada',
  evaluador_persona_id uuid references public.personas (id),
  nivel_sugerido_id uuid references public.niveles (id),
  observaciones text,
  creada_en timestamptz not null default now(),
  check (consulta_id is not null or estudiante_id is not null),
  check (estado <> 'realizada' or nivel_sugerido_id is not null)
);

create table public.solicitudes_inscripcion (
  id uuid primary key default gen_random_uuid(),
  consulta_id uuid references public.consultas (id) on delete set null,
  estudiante_id uuid not null references public.estudiantes (id),
  comision_id uuid not null references public.comisiones (id),
  -- Adulto que inicia el trámite (el propio estudiante si es mayor).
  solicitante_persona_id uuid not null references public.personas (id),
  responsable_pago_persona_id uuid not null references public.personas (id),
  estado public.estado_solicitud not null default 'pendiente',
  nivelacion_id uuid references public.nivelaciones (id),
  reserva_id uuid references public.reservas_vacante (id),
  matricula_id uuid references public.matriculas (id),
  motivo_cierre text,
  creada_por uuid references public.cuentas (id),
  creada_en timestamptz not null default now(),
  resuelta_en timestamptz,
  check (estado <> 'confirmada' or matricula_id is not null)
);
create unique index solicitudes_abierta_uq
  on public.solicitudes_inscripcion (estudiante_id, comision_id)
  where estado in ('pendiente', 'en_revision', 'aprobada');
create index solicitudes_estado_idx on public.solicitudes_inscripcion (estado, creada_en);

create trigger auditar_solicitudes after insert or update or delete on public.solicitudes_inscripcion
  for each row execute function privado.auditar();

-- Límite de envíos del formulario público: como máximo 5 consultas por
-- contacto (email o teléfono) por hora. Frena el abuso básico sin CAPTCHA.
create or replace function privado.limitar_consultas_publicas()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_recientes int;
begin
  if (select auth.uid()) is not null then
    return new; -- carga interna por personal: sin límite
  end if;
  -- Un visitante no puede fijar campos de seguimiento.
  new.estado := 'nueva';
  new.responsable_cuenta_id := null;
  new.proxima_accion := null;
  new.proxima_accion_en := null;
  new.motivo_perdida := null;
  new.persona_contacto_id := null;
  new.estudiante_id := null;
  new.origen := 'web';
  select count(*) into v_recientes
  from public.consultas c
  where c.creada_en > now() - interval '1 hour'
    and ((new.email is not null and lower(c.email) = lower(new.email))
      or (new.telefono is not null and c.telefono = new.telefono));
  if v_recientes >= 5 then
    raise exception 'DEMASIADAS_CONSULTAS' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger consultas_limite before insert on public.consultas
  for each row execute function privado.limitar_consultas_publicas();
