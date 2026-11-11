-- =====================================================================
-- 05 · Comunicación, documentos privados y ayuda contextual
-- =====================================================================

create type public.tipo_comunicacion as enum ('institucional', 'comision', 'individual');
create type public.categoria_comunicacion as enum ('general', 'academica', 'economica');
create type public.canal as enum ('interno', 'email', 'whatsapp');
create type public.estado_envio as enum ('pendiente', 'enviado', 'entregado', 'leido', 'fallido');
create type public.tipo_documento_archivo as enum
  ('identidad', 'autorizacion', 'ficha', 'comprobante_pago', 'comprobante_gasto', 'otro');

create table public.comunicaciones (
  id uuid primary key default gen_random_uuid(),
  tipo public.tipo_comunicacion not null,
  categoria public.categoria_comunicacion not null default 'general',
  asunto text not null check (length(btrim(asunto)) > 0),
  cuerpo text not null,
  comision_id uuid references public.comisiones (id),
  autor_cuenta_id uuid not null references public.cuentas (id),
  estado text not null default 'borrador' check (estado in ('borrador', 'enviada')),
  creada_en timestamptz not null default now(),
  enviada_en timestamptz,
  check (tipo <> 'comision' or comision_id is not null),
  check (estado <> 'enviada' or enviada_en is not null)
);
create index comunicaciones_autor_idx on public.comunicaciones (autor_cuenta_id, creada_en desc);

-- Un registro por destinatario y canal: envío, entrega y lectura por separado
-- (solo se completa lo que el canal permite conocer).
create table public.comunicacion_envios (
  id uuid primary key default gen_random_uuid(),
  comunicacion_id uuid not null references public.comunicaciones (id) on delete cascade,
  destinatario_persona_id uuid not null references public.personas (id),
  -- Estudiante al que refiere el aviso (para mostrárselo al tutor en contexto).
  estudiante_id uuid references public.estudiantes (id),
  canal public.canal not null default 'interno',
  estado public.estado_envio not null default 'pendiente',
  intentos int not null default 0,
  proximo_intento_en timestamptz,
  ultimo_error text,
  id_externo text,
  enviado_en timestamptz,
  entregado_en timestamptz,
  leido_en timestamptz,
  -- Idempotencia: reintentar el envío no duplica el mensaje.
  unique (comunicacion_id, destinatario_persona_id, canal)
);
create index comunicacion_envios_destinatario_idx
  on public.comunicacion_envios (destinatario_persona_id, estado);
create index comunicacion_envios_pendientes_idx
  on public.comunicacion_envios (proximo_intento_en) where estado in ('pendiente', 'fallido');

create table public.preferencias_notificacion (
  persona_id uuid not null references public.personas (id) on delete cascade,
  canal public.canal not null,
  categoria public.categoria_comunicacion not null,
  habilitado boolean not null default true,
  primary key (persona_id, canal, categoria),
  -- Los avisos internos no se pueden desactivar: son el registro institucional.
  check (canal <> 'interno' or habilitado)
);

-- ---------------------------------------------------------------------
-- Documentos: metadatos acá, archivo en bucket privado de Storage.
-- La ruta del objeto es la clave que usan las políticas de Storage.
-- ---------------------------------------------------------------------
create table public.documentos (
  id uuid primary key default gen_random_uuid(),
  tipo public.tipo_documento_archivo not null,
  nombre text not null,
  estudiante_id uuid references public.estudiantes (id),
  persona_id uuid references public.personas (id),
  ruta text not null unique,
  tamano_bytes bigint check (tamano_bytes >= 0),
  tipo_mime text,
  subido_por uuid references public.cuentas (id),
  creado_en timestamptz not null default now(),
  -- Política de conservación: fecha a partir de la cual corresponde eliminar.
  conservar_hasta date,
  eliminado_en timestamptz,
  check (tipo in ('comprobante_gasto') or estudiante_id is not null or persona_id is not null)
);
create index documentos_estudiante_idx on public.documentos (estudiante_id) where eliminado_en is null;
create index documentos_persona_idx on public.documentos (persona_id) where eliminado_en is null;

alter table public.pagos
  add constraint pagos_comprobante_fk foreign key (comprobante_documento_id) references public.documentos (id);
alter table public.gastos
  add constraint gastos_comprobante_fk foreign key (comprobante_documento_id) references public.documentos (id);

create trigger auditar_documentos after insert or update or delete on public.documentos
  for each row execute function privado.auditar();

-- ---------------------------------------------------------------------
-- Ayuda contextual: documentación institucional APROBADA, por audiencia.
-- Es lo único que el asistente puede citar en la primera etapa.
-- ---------------------------------------------------------------------
create table public.documentos_ayuda (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  titulo text not null,
  contenido text not null,
  -- 'visitante' | 'estudiante' | 'tutor' | 'docente' | 'administracion' | 'direccion'
  audiencia text[] not null check (
    cardinality(audiencia) > 0
    and audiencia <@ array['visitante', 'estudiante', 'tutor', 'docente', 'administracion', 'direccion']
  ),
  estado text not null default 'borrador' check (estado in ('borrador', 'aprobado', 'retirado')),
  version int not null default 1,
  aprobado_por uuid references public.cuentas (id),
  aprobado_en timestamptz,
  actualizado_en timestamptz not null default now(),
  busqueda tsvector generated always as (
    setweight(to_tsvector('spanish'::regconfig, titulo), 'A') || setweight(to_tsvector('spanish'::regconfig, contenido), 'B')
  ) stored,
  -- aprobado_por nulo = contenido de la carga inicial.
  check (estado <> 'aprobado' or aprobado_en is not null)
);
create index documentos_ayuda_busqueda_idx on public.documentos_ayuda using gin (busqueda);

-- Uso del asistente: límites por rol y control de costos. No guarda el
-- contenido de las preguntas (minimización); solo contadores.
create table public.asistente_uso (
  cuenta_id uuid not null references public.cuentas (id) on delete cascade,
  dia date not null,
  consultas int not null default 0,
  tokens_entrada bigint not null default 0,
  tokens_salida bigint not null default 0,
  primary key (cuenta_id, dia)
);

-- Límite diario de consultas al asistente por perfil (lo ajusta dirección).
create table public.asistente_limites (
  perfil text primary key check (perfil in ('estudiante', 'tutor', 'docente', 'administracion', 'direccion')),
  consultas_diarias int not null check (consultas_diarias >= 0)
);
insert into public.asistente_limites (perfil, consultas_diarias) values
  ('estudiante', 30), ('tutor', 20), ('docente', 60), ('administracion', 60), ('direccion', 60);

-- Tareas programadas con idempotencia (generación de cuotas, reintentos).
create table public.tareas_ejecutadas (
  tarea text not null,
  clave text not null,
  ejecutada_en timestamptz not null default now(),
  resultado jsonb,
  primary key (tarea, clave)
);
