-- =====================================================================
-- 04 · Administración, cobros y gestión empresarial
-- obligación ≠ pago ≠ imputación. Un pago cubre varias obligaciones y una
-- obligación admite pagos parciales. Lo confirmado no se edita: se ajusta.
-- Importes: numeric(14,2) con moneda explícita (ARS en la v1).
-- =====================================================================

create type public.tipo_concepto as enum
  ('matricula', 'cuota', 'curso_especial', 'derecho_examen', 'material', 'otro');
create type public.estado_obligacion as enum ('pendiente', 'parcial', 'pagada', 'anulada');
create type public.medio_pago as enum ('efectivo', 'transferencia', 'pasarela');
create type public.estado_pago as enum ('informado', 'confirmado', 'rechazado', 'reversado');
create type public.tipo_beneficio as enum ('descuento', 'beca', 'promocion_familiar');
create type public.tipo_ajuste as enum ('reverso_pago', 'devolucion', 'anulacion_obligacion', 'nota_credito');

create domain public.importe as numeric(14, 2);
create domain public.moneda as char(3) check (value = 'ARS');

create table public.conceptos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  tipo public.tipo_concepto not null,
  activo boolean not null default true
);

-- Historial de aranceles: cada cambio de precio es una fila nueva con
-- vigencia. Las filas no se modifican en su importe.
create table public.aranceles (
  id uuid primary key default gen_random_uuid(),
  concepto_id uuid not null references public.conceptos (id),
  ciclo_id uuid references public.ciclos_lectivos (id),
  curso_id uuid references public.cursos (id),
  comision_id uuid references public.comisiones (id),
  importe public.importe not null check (importe >= 0),
  moneda public.moneda not null default 'ARS',
  vigente_desde date not null,
  vigente_hasta date,
  creado_por uuid references public.cuentas (id),
  creado_en timestamptz not null default now(),
  check (vigente_hasta is null or vigente_hasta >= vigente_desde)
);
create index aranceles_busqueda_idx on public.aranceles (concepto_id, vigente_desde desc);

create or replace function privado.arancel_importe_inmutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.importe is distinct from old.importe
     or new.moneda is distinct from old.moneda
     or new.concepto_id is distinct from old.concepto_id
     or new.vigente_desde is distinct from old.vigente_desde then
    raise exception 'ARANCEL_INMUTABLE: para cambiar un precio, cerrá la vigencia y creá un arancel nuevo'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger aranceles_inmutables before update on public.aranceles
  for each row execute function privado.arancel_importe_inmutable();

create table public.beneficios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  tipo public.tipo_beneficio not null,
  porcentaje numeric(5, 2) check (porcentaje > 0 and porcentaje <= 100),
  monto_fijo public.importe check (monto_fijo > 0),
  activo boolean not null default true,
  check ((porcentaje is null) <> (monto_fijo is null))
);

-- Otorgar un beneficio es una decisión humana: exige aprobador.
create table public.beneficios_otorgados (
  id uuid primary key default gen_random_uuid(),
  beneficio_id uuid not null references public.beneficios (id),
  matricula_id uuid not null references public.matriculas (id),
  aplica_a public.tipo_concepto not null default 'cuota',
  vigente_desde date not null,
  vigente_hasta date,
  aprobado_por uuid not null references public.cuentas (id),
  aprobado_en timestamptz not null default now(),
  revocado_en timestamptz,
  motivo text
);
create index beneficios_otorgados_matricula_idx on public.beneficios_otorgados (matricula_id);

create table public.obligaciones (
  id uuid primary key default gen_random_uuid(),
  estudiante_id uuid not null references public.estudiantes (id),
  matricula_id uuid references public.matriculas (id),
  responsable_pago_persona_id uuid not null references public.personas (id),
  concepto_id uuid not null references public.conceptos (id),
  descripcion text not null,
  periodo date, -- primer día del mes para cuotas
  -- Foto del precio al generar: los cambios futuros no la tocan.
  arancel_id uuid references public.aranceles (id),
  importe_original public.importe not null check (importe_original >= 0),
  descuento public.importe not null default 0 check (descuento >= 0),
  importe numeric(14, 2) generated always as (importe_original - descuento) stored,
  moneda public.moneda not null default 'ARS',
  vencimiento date not null,
  estado public.estado_obligacion not null default 'pendiente',
  creada_por uuid references public.cuentas (id),
  creada_en timestamptz not null default now(),
  check (descuento <= importe_original)
);
-- No se genera dos veces la misma cuota para una matrícula.
create unique index obligaciones_periodo_uq
  on public.obligaciones (matricula_id, concepto_id, periodo)
  where estado <> 'anulada' and matricula_id is not null and periodo is not null;
create index obligaciones_responsable_idx on public.obligaciones (responsable_pago_persona_id, estado);
create index obligaciones_estudiante_idx on public.obligaciones (estudiante_id);
create index obligaciones_vencimiento_idx on public.obligaciones (vencimiento) where estado in ('pendiente', 'parcial');

create table public.pagos (
  id uuid primary key default gen_random_uuid(),
  pagador_persona_id uuid not null references public.personas (id),
  medio public.medio_pago not null,
  importe public.importe not null check (importe > 0),
  moneda public.moneda not null default 'ARS',
  fecha_pago date not null,
  estado public.estado_pago not null default 'informado',
  comprobante_documento_id uuid,
  -- Pasarela: clave de idempotencia del cobro en el proveedor.
  proveedor text,
  referencia_externa text,
  nota text,
  registrado_por uuid references public.cuentas (id),
  registrado_en timestamptz not null default now(),
  validado_por uuid references public.cuentas (id),
  validado_en timestamptz,
  motivo_rechazo text,
  check ((proveedor is null) = (referencia_externa is null)),
  check (medio <> 'pasarela' or proveedor is not null),
  check (estado not in ('confirmado', 'reversado') or validado_en is not null),
  check (estado <> 'rechazado' or motivo_rechazo is not null)
);
create unique index pagos_referencia_externa_uq
  on public.pagos (proveedor, referencia_externa) where referencia_externa is not null;
create index pagos_pagador_idx on public.pagos (pagador_persona_id, fecha_pago desc);
create index pagos_estado_idx on public.pagos (estado, fecha_pago);

-- Un pago confirmado solo puede pasar a 'reversado'; importes y fechas no cambian.
create or replace function privado.pago_controlar_cambios()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.importe <> old.importe or new.moneda <> old.moneda
     or new.pagador_persona_id <> old.pagador_persona_id or new.medio <> old.medio then
    raise exception 'PAGO_INMUTABLE: importe, moneda, medio y pagador no se modifican' using errcode = 'P0001';
  end if;
  if old.estado = new.estado then
    if old.estado <> 'informado' and (new.fecha_pago <> old.fecha_pago) then
      raise exception 'PAGO_INMUTABLE: un pago % no admite cambios', old.estado using errcode = 'P0001';
    end if;
    return new;
  end if;
  if not ((old.estado, new.estado) in (
      ('informado', 'confirmado'), ('informado', 'rechazado'), ('confirmado', 'reversado'))) then
    raise exception 'TRANSICION_INVALIDA: pago % → %', old.estado, new.estado using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger pagos_controlar_cambios before update on public.pagos
  for each row execute function privado.pago_controlar_cambios();
create trigger pagos_sin_borrado before delete on public.pagos
  for each row execute function privado.impedir_cambios();

create table public.imputaciones (
  id uuid primary key default gen_random_uuid(),
  pago_id uuid not null references public.pagos (id),
  obligacion_id uuid not null references public.obligaciones (id),
  importe public.importe not null check (importe > 0),
  creada_por uuid references public.cuentas (id),
  creada_en timestamptz not null default now(),
  anulada_en timestamptz,
  anulada_por uuid references public.cuentas (id)
);
create index imputaciones_pago_idx on public.imputaciones (pago_id) where anulada_en is null;
create index imputaciones_obligacion_idx on public.imputaciones (obligacion_id) where anulada_en is null;
create trigger imputaciones_sin_borrado before delete on public.imputaciones
  for each row execute function privado.impedir_cambios();

-- Ajustes y reversos auditables sobre movimientos confirmados.
create table public.ajustes (
  id uuid primary key default gen_random_uuid(),
  tipo public.tipo_ajuste not null,
  pago_id uuid references public.pagos (id),
  obligacion_id uuid references public.obligaciones (id),
  importe public.importe not null check (importe > 0),
  moneda public.moneda not null default 'ARS',
  fecha date not null default (now() at time zone 'America/Argentina/Tucuman')::date,
  motivo text not null check (length(btrim(motivo)) >= 5),
  creado_por uuid not null references public.cuentas (id),
  creado_en timestamptz not null default now(),
  check (pago_id is not null or obligacion_id is not null)
);
create trigger ajustes_inmutables before update or delete on public.ajustes
  for each row execute function privado.impedir_cambios();

-- Notificaciones de la pasarela (webhooks). La unicidad por proveedor +
-- id de evento es lo que impide duplicar un cobro ante reintentos.
create table public.eventos_pasarela (
  id uuid primary key default gen_random_uuid(),
  proveedor text not null,
  evento_id_externo text not null,
  tipo text,
  firma_valida boolean not null,
  payload jsonb not null,
  recibido_en timestamptz not null default now(),
  procesado_en timestamptz,
  resultado text,
  pago_id uuid references public.pagos (id),
  unique (proveedor, evento_id_externo)
);

-- Saldos: siempre derivados de pagos e imputaciones (única fuente).
-- Las imputaciones solo existen sobre pagos confirmados y se anulan al
-- reversar, por eso alcanza con sumar las no anuladas.
create view public.obligaciones_saldo with (security_invoker = true) as
select
  o.id as obligacion_id,
  o.estudiante_id,
  o.responsable_pago_persona_id,
  o.importe,
  coalesce(sum(i.importe) filter (where i.anulada_en is null), 0)::numeric(14, 2) as pagado,
  (o.importe - coalesce(sum(i.importe) filter (where i.anulada_en is null), 0))::numeric(14, 2) as saldo,
  o.vencimiento,
  o.estado
from public.obligaciones o
left join public.imputaciones i on i.obligacion_id = o.id
group by o.id;

create view public.pagos_saldo with (security_invoker = true) as
select
  p.id as pago_id,
  p.pagador_persona_id,
  p.importe,
  p.estado,
  coalesce((select sum(i.importe) from public.imputaciones i where i.pago_id = p.id and i.anulada_en is null), 0)::numeric(14, 2) as imputado,
  coalesce((select sum(a.importe) from public.ajustes a where a.pago_id = p.id and a.tipo = 'devolucion'), 0)::numeric(14, 2) as devuelto,
  case when p.estado = 'confirmado' then
    (p.importe
      - coalesce((select sum(i.importe) from public.imputaciones i where i.pago_id = p.id and i.anulada_en is null), 0)
      - coalesce((select sum(a.importe) from public.ajustes a where a.pago_id = p.id and a.tipo = 'devolucion'), 0))::numeric(14, 2)
  else 0::numeric(14, 2) end as saldo_a_favor
from public.pagos p;

-- ---------------------------------------------------------------------
-- Gestión empresarial
-- ---------------------------------------------------------------------
create table public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cuit text,
  contacto text,
  activo boolean not null default true
);

create table public.categorias_gasto (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  activa boolean not null default true
);

create table public.gastos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  categoria_id uuid not null references public.categorias_gasto (id),
  proveedor_id uuid references public.proveedores (id),
  descripcion text not null,
  importe public.importe not null check (importe > 0),
  moneda public.moneda not null default 'ARS',
  medio public.medio_pago not null default 'efectivo' check (medio <> 'pasarela'),
  -- Atribución opcional de costos.
  curso_id uuid references public.cursos (id),
  comision_id uuid references public.comisiones (id),
  comprobante_documento_id uuid,
  anulado_en timestamptz,
  anulado_por uuid references public.cuentas (id),
  motivo_anulacion text,
  registrado_por uuid references public.cuentas (id),
  registrado_en timestamptz not null default now(),
  check ((anulado_en is null) = (motivo_anulacion is null))
);
create index gastos_fecha_idx on public.gastos (fecha) where anulado_en is null;

-- Registro de pagos a docentes. NO es una liquidación laboral: no calcula
-- aportes, retenciones ni recibos de sueldo.
create table public.pagos_docentes (
  id uuid primary key default gen_random_uuid(),
  docente_persona_id uuid not null references public.personas (id),
  periodo date not null,
  fecha_pago date not null,
  importe public.importe not null check (importe > 0),
  moneda public.moneda not null default 'ARS',
  comision_id uuid references public.comisiones (id),
  nota text,
  anulado_en timestamptz,
  motivo_anulacion text,
  registrado_por uuid references public.cuentas (id),
  registrado_en timestamptz not null default now(),
  check ((anulado_en is null) = (motivo_anulacion is null))
);
create index pagos_docentes_fecha_idx on public.pagos_docentes (fecha_pago) where anulado_en is null;

create trigger auditar_obligaciones after insert or update or delete on public.obligaciones
  for each row execute function privado.auditar();
create trigger auditar_pagos after insert or update on public.pagos
  for each row execute function privado.auditar();
create trigger auditar_imputaciones after insert or update on public.imputaciones
  for each row execute function privado.auditar();
create trigger auditar_gastos after insert or update or delete on public.gastos
  for each row execute function privado.auditar();
create trigger auditar_pagos_docentes after insert or update or delete on public.pagos_docentes
  for each row execute function privado.auditar();
create trigger auditar_aranceles after insert or update or delete on public.aranceles
  for each row execute function privado.auditar();
create trigger auditar_beneficios after insert or update or delete on public.beneficios_otorgados
  for each row execute function privado.auditar();
