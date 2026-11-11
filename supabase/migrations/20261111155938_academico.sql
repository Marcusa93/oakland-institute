-- =====================================================================
-- 02 · Gestión académica
-- curso (propuesta) ≠ nivel (ubicación) ≠ comisión (grupo) ≠ clase (encuentro)
-- =====================================================================

create type public.estado_ciclo as enum ('planificado', 'activo', 'cerrado');
create type public.publico_curso as enum ('ninos', 'adolescentes', 'adultos', 'todos');
create type public.modalidad as enum ('presencial', 'virtual', 'mixta');
create type public.estado_comision as enum ('borrador', 'abierta', 'en_curso', 'finalizada', 'cancelada');
create type public.estado_clase as enum ('programada', 'dictada', 'cancelada');
create type public.estado_matricula as enum ('activa', 'baja', 'cambiada', 'finalizada');
create type public.estado_asistencia as enum ('presente', 'ausente', 'tarde', 'justificada');
create type public.estado_reserva as enum ('vigente', 'convertida', 'vencida', 'cancelada');
create type public.estado_espera as enum ('esperando', 'ofrecida', 'convertida', 'retirada');
create type public.visibilidad_observacion as enum ('gestion', 'docentes', 'familia');
create type public.timerange as range (subtype = time);

create table public.ciclos_lectivos (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  fecha_inicio date not null,
  fecha_fin date not null,
  estado public.estado_ciclo not null default 'planificado',
  check (fecha_fin > fecha_inicio)
);

create table public.niveles (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  orden int not null,
  descripcion text,
  -- Referencia al MCER: configuración académica revisada por el instituto.
  -- No es una acreditación y no se emite nada a partir de este dato.
  mcer_referencia text check (mcer_referencia in ('Pre-A1', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2')),
  mcer_revisado_por uuid references public.cuentas (id),
  mcer_revisado_en timestamptz,
  check ((mcer_referencia is null) or (mcer_revisado_por is not null and mcer_revisado_en is not null))
);

create table public.cursos (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  nombre text not null,
  descripcion text,
  publico public.publico_curso not null default 'todos',
  edad_minima int check (edad_minima between 3 and 99),
  edad_maxima int check (edad_maxima between 3 and 99),
  modalidad public.modalidad not null default 'presencial',
  publicado boolean not null default false,
  activo boolean not null default true,
  orden int not null default 0,
  creado_en timestamptz not null default now(),
  check (edad_maxima is null or edad_minima is null or edad_maxima >= edad_minima)
);

create table public.aulas (
  id uuid primary key default gen_random_uuid(),
  sede_id uuid not null references public.sedes (id),
  nombre text not null,
  capacidad int check (capacidad > 0),
  activa boolean not null default true,
  unique (sede_id, nombre)
);

create table public.comisiones (
  id uuid primary key default gen_random_uuid(),
  curso_id uuid not null references public.cursos (id),
  nivel_id uuid not null references public.niveles (id),
  ciclo_id uuid not null references public.ciclos_lectivos (id),
  sede_id uuid not null references public.sedes (id),
  nombre text not null,
  cupo int not null check (cupo > 0),
  modalidad public.modalidad not null default 'presencial',
  estado public.estado_comision not null default 'borrador',
  publicada boolean not null default false,
  fecha_inicio date not null,
  fecha_fin date not null,
  creado_en timestamptz not null default now(),
  unique (ciclo_id, nombre),
  check (fecha_fin >= fecha_inicio)
);
create index comisiones_ciclo_idx on public.comisiones (ciclo_id, estado);
create index comisiones_curso_idx on public.comisiones (curso_id);

create table public.comision_docentes (
  id uuid primary key default gen_random_uuid(),
  comision_id uuid not null references public.comisiones (id) on delete cascade,
  docente_persona_id uuid not null references public.personas (id),
  funcion text not null default 'titular' check (funcion in ('titular', 'auxiliar', 'suplente')),
  desde date not null,
  hasta date,
  check (hasta is null or hasta >= desde)
);
create unique index comision_docentes_uq
  on public.comision_docentes (comision_id, docente_persona_id) where hasta is null;
create index comision_docentes_docente_idx on public.comision_docentes (docente_persona_id);

create table public.comision_horarios (
  id uuid primary key default gen_random_uuid(),
  comision_id uuid not null references public.comisiones (id) on delete cascade,
  aula_id uuid references public.aulas (id),
  dia_semana int not null check (dia_semana between 1 and 7), -- 1 = lunes (ISO)
  hora_inicio time not null,
  hora_fin time not null,
  vigencia daterange not null,
  check (hora_fin > hora_inicio),
  -- Conflicto de aula: misma aula, mismo día, horas y vigencias superpuestas.
  constraint aula_sin_superposicion exclude using gist (
    aula_id with =,
    dia_semana with =,
    public.timerange(hora_inicio, hora_fin) with &&,
    vigencia with &&
  ) where (aula_id is not null)
);
create index comision_horarios_comision_idx on public.comision_horarios (comision_id);

-- Conflictos de docentes: no es una restricción declarativa porque cruza dos
-- tablas; se valida al asignar docente y al cargar horario.
create or replace function privado.conflictos_docente(p_docente uuid, p_comision uuid)
returns table (comision_en_conflicto uuid, dia_semana int, hora_inicio time, hora_fin time)
language sql stable set search_path = '' as $$
  select h2.comision_id, h2.dia_semana, h2.hora_inicio, h2.hora_fin
  from public.comision_horarios h1
  join public.comision_horarios h2
    on h2.comision_id <> h1.comision_id
   and h2.dia_semana = h1.dia_semana
   and public.timerange(h2.hora_inicio, h2.hora_fin) && public.timerange(h1.hora_inicio, h1.hora_fin)
   and h2.vigencia && h1.vigencia
  join public.comision_docentes d2
    on d2.comision_id = h2.comision_id
   and d2.docente_persona_id = p_docente
   and d2.hasta is null
  where h1.comision_id = p_comision;
$$;

create or replace function privado.validar_conflicto_docente()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_conflicto record;
  v_docente uuid;
begin
  if tg_table_name = 'comision_docentes' then
    if new.hasta is not null then return new; end if;
    select * into v_conflicto from privado.conflictos_docente(new.docente_persona_id, new.comision_id) limit 1;
    if found then
      raise exception 'CONFLICTO_DOCENTE: ya dicta otra comisión el día % de % a %',
        v_conflicto.dia_semana, v_conflicto.hora_inicio, v_conflicto.hora_fin using errcode = 'P0001';
    end if;
  else
    for v_docente in
      select d.docente_persona_id from public.comision_docentes d
      where d.comision_id = new.comision_id and d.hasta is null
    loop
      select * into v_conflicto from privado.conflictos_docente(v_docente, new.comision_id) limit 1;
      if found then
        raise exception 'CONFLICTO_DOCENTE: un docente de la comisión ya dicta otra el día % de % a %',
          v_conflicto.dia_semana, v_conflicto.hora_inicio, v_conflicto.hora_fin using errcode = 'P0001';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

-- AFTER: la fila nueva ya es visible para la consulta de superposición.
create constraint trigger docente_sin_superposicion
  after insert or update on public.comision_docentes
  for each row execute function privado.validar_conflicto_docente();
create constraint trigger horario_sin_superposicion_docente
  after insert or update on public.comision_horarios
  for each row execute function privado.validar_conflicto_docente();

create table public.clases (
  id uuid primary key default gen_random_uuid(),
  comision_id uuid not null references public.comisiones (id) on delete cascade,
  fecha date not null,
  hora_inicio time not null,
  hora_fin time not null,
  aula_id uuid references public.aulas (id),
  docente_persona_id uuid references public.personas (id),
  estado public.estado_clase not null default 'programada',
  tema text,
  unique (comision_id, fecha, hora_inicio),
  check (hora_fin > hora_inicio)
);
create index clases_fecha_idx on public.clases (fecha);

-- Matrícula = inscripción confirmada. Solo se crea desde la función
-- transaccional que controla cupos (ver 06_funciones_operativas).
create table public.matriculas (
  id uuid primary key default gen_random_uuid(),
  estudiante_id uuid not null references public.estudiantes (id),
  comision_id uuid not null references public.comisiones (id),
  estado public.estado_matricula not null default 'activa',
  fecha_alta date not null default (now() at time zone 'America/Argentina/Tucuman')::date,
  fecha_baja date,
  motivo_baja text,
  -- Trazabilidad de cambios de comisión y continuidad entre ciclos.
  matricula_anterior_id uuid references public.matriculas (id),
  creada_por uuid references public.cuentas (id),
  creada_en timestamptz not null default now(),
  check (estado = 'activa' or fecha_baja is not null)
);
create unique index matriculas_activa_uq
  on public.matriculas (estudiante_id, comision_id) where estado = 'activa';
create index matriculas_comision_idx on public.matriculas (comision_id) where estado = 'activa';
create index matriculas_estudiante_idx on public.matriculas (estudiante_id);

-- Lado económico de la matrícula, en tabla aparte: los docentes leen
-- matrículas de sus comisiones pero no quién paga ni las condiciones pactadas.
create table public.matriculas_pago (
  matricula_id uuid primary key references public.matriculas (id) on delete cascade,
  responsable_pago_persona_id uuid not null references public.personas (id),
  -- Foto de las condiciones económicas al inscribir.
  condiciones jsonb not null default '{}'::jsonb
);
create index matriculas_pago_responsable_idx on public.matriculas_pago (responsable_pago_persona_id);

create table public.reservas_vacante (
  id uuid primary key default gen_random_uuid(),
  comision_id uuid not null references public.comisiones (id),
  estudiante_id uuid not null references public.estudiantes (id),
  estado public.estado_reserva not null default 'vigente',
  vence_en timestamptz not null,
  creada_por uuid references public.cuentas (id),
  creada_en timestamptz not null default now()
);
create unique index reservas_vigente_uq
  on public.reservas_vacante (comision_id, estudiante_id) where estado = 'vigente';
create index reservas_comision_idx on public.reservas_vacante (comision_id) where estado = 'vigente';

create table public.lista_espera (
  id uuid primary key default gen_random_uuid(),
  comision_id uuid not null references public.comisiones (id),
  estudiante_id uuid not null references public.estudiantes (id),
  estado public.estado_espera not null default 'esperando',
  creada_en timestamptz not null default now()
);
create unique index lista_espera_uq
  on public.lista_espera (comision_id, estudiante_id) where estado in ('esperando', 'ofrecida');

create table public.asistencias (
  id uuid primary key default gen_random_uuid(),
  clase_id uuid not null references public.clases (id) on delete cascade,
  matricula_id uuid not null references public.matriculas (id),
  estado public.estado_asistencia not null,
  observacion text,
  registrada_por uuid references public.cuentas (id),
  registrada_en timestamptz not null default now(),
  unique (clase_id, matricula_id)
);
create index asistencias_matricula_idx on public.asistencias (matricula_id);

-- La asistencia debe corresponder a una matrícula de la misma comisión.
-- SECURITY DEFINER: valida la integridad real, sin depender de lo que la RLS
-- le deje ver a quien registra.
create or replace function privado.validar_asistencia()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.clases c
    join public.matriculas m on m.comision_id = c.comision_id
    where c.id = new.clase_id and m.id = new.matricula_id
  ) then
    raise exception 'ASISTENCIA_INVALIDA: la matrícula no pertenece a la comisión de la clase'
      using errcode = 'P0001';
  end if;
  new.registrada_por := coalesce((select auth.uid()), new.registrada_por);
  new.registrada_en := now();
  return new;
end;
$$;
create trigger asistencias_validar before insert or update on public.asistencias
  for each row execute function privado.validar_asistencia();

create table public.observaciones_estudiante (
  id uuid primary key default gen_random_uuid(),
  estudiante_id uuid not null references public.estudiantes (id),
  autor_cuenta_id uuid not null references public.cuentas (id),
  visibilidad public.visibilidad_observacion not null default 'gestion',
  texto text not null check (length(btrim(texto)) > 0),
  creada_en timestamptz not null default now()
);
create index observaciones_estudiante_idx on public.observaciones_estudiante (estudiante_id, creada_en desc);

-- ¿La cuenta actual es docente vigente de la comisión?
create or replace function privado.es_docente_de_comision(p_comision uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select privado.tiene_rol('docente') and exists (
    select 1 from public.comision_docentes d
    where d.comision_id = p_comision
      and d.docente_persona_id = privado.persona_actual()
      and d.hasta is null
  );
$$;

-- ¿La cuenta actual es docente de alguna comisión donde el estudiante tiene
-- matrícula activa? (el acceso docente termina con la baja o el cambio)
create or replace function privado.es_docente_del_estudiante(p_estudiante uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select privado.tiene_rol('docente') and exists (
    select 1
    from public.matriculas m
    join public.comision_docentes d on d.comision_id = m.comision_id
    where m.estudiante_id = p_estudiante
      and m.estado = 'activa'
      and d.docente_persona_id = privado.persona_actual()
      and d.hasta is null
  );
$$;

-- ¿La cuenta actual participa de la comisión? (docente vigente, o estudiante /
-- responsable académico con matrícula activa)
create or replace function privado.participa_en_comision(p_comision uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select privado.es_docente_de_comision(p_comision) or exists (
    select 1 from public.matriculas m
    join public.estudiantes e on e.id = m.estudiante_id
    where m.comision_id = p_comision and m.estado = 'activa'
      and (e.persona_id = privado.persona_actual() or privado.es_responsable_de(e.id, 'academico'))
  );
$$;

-- Lugares ocupados = matrículas activas + reservas vigentes no vencidas.
create or replace function privado.ocupacion_comision(p_comision uuid)
returns int language sql stable security definer set search_path = '' as $$
  select (
    (select count(*) from public.matriculas m where m.comision_id = p_comision and m.estado = 'activa')
    +
    (select count(*) from public.reservas_vacante r
      where r.comision_id = p_comision and r.estado = 'vigente' and r.vence_en > now())
  )::int;
$$;

create trigger auditar_matriculas after insert or update or delete on public.matriculas
  for each row execute function privado.auditar();
create trigger auditar_matriculas_pago after insert or update or delete on public.matriculas_pago
  for each row execute function privado.auditar();
create trigger auditar_reservas after insert or update or delete on public.reservas_vacante
  for each row execute function privado.auditar();
