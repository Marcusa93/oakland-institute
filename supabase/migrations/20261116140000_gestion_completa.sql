-- =====================================================================
-- Gestión completa del instituto
--
-- · Cambio de precios con historial (el precio anterior se cierra solo).
-- · Alta de estudiante y de responsable en una sola operación: si algo
--   falla no queda nada a medio cargar.
-- · Importación desde planillas: cada fila entra completa o no entra.
-- · Número correlativo para los comprobantes de pago.
-- · Motivo de cancelación de una clase.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Precios
-- ---------------------------------------------------------------------
-- Un precio nuevo cierra el anterior del mismo concepto y alcance el día
-- antes de empezar. Las cuotas ya generadas no cambian: guardan su foto.
create or replace function privado.cambiar_arancel(
  p_concepto uuid, p_importe numeric, p_desde date,
  p_ciclo uuid default null, p_curso uuid default null, p_comision uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform privado.exigir(privado.es_direccion());
  if p_importe is null or p_importe < 0 then
    raise exception 'IMPORTE_INVALIDO' using errcode = 'P0001';
  end if;
  if p_desde is null then
    raise exception 'PERIODO_INVALIDO' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.conceptos where id = p_concepto) then
    raise exception 'NO_ENCONTRADO: concepto' using errcode = 'P0002';
  end if;
  -- Dos cambios simultáneos del mismo concepto se ejecutan en serie.
  perform 1 from public.conceptos where id = p_concepto for update;
  if exists (
    select 1 from public.aranceles a
    where a.concepto_id = p_concepto
      and a.ciclo_id is not distinct from p_ciclo
      and a.curso_id is not distinct from p_curso
      and a.comision_id is not distinct from p_comision
      and a.vigente_desde >= p_desde
  ) then
    raise exception 'VIGENCIA_SUPERPUESTA: ya hay un precio que empieza en esa fecha o después' using errcode = 'P0001';
  end if;
  update public.aranceles a
     set vigente_hasta = p_desde - 1
   where a.concepto_id = p_concepto
     and a.ciclo_id is not distinct from p_ciclo
     and a.curso_id is not distinct from p_curso
     and a.comision_id is not distinct from p_comision
     and (a.vigente_hasta is null or a.vigente_hasta >= p_desde);
  insert into public.aranceles (concepto_id, ciclo_id, curso_id, comision_id, importe, vigente_desde, creado_por)
  values (p_concepto, p_ciclo, p_curso, p_comision, p_importe, p_desde, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.cambiar_arancel(
  p_concepto uuid, p_importe numeric, p_desde date,
  p_ciclo uuid default null, p_curso uuid default null, p_comision uuid default null)
returns uuid language sql security invoker set search_path = '' as $$
  select privado.cambiar_arancel(p_concepto, p_importe, p_desde, p_ciclo, p_curso, p_comision);
$$;

-- Revocar un beneficio otorgado (lo puede hacer cualquier cuenta de
-- dirección, no solo quien lo aprobó). Las cuotas ya generadas no cambian.
create or replace function privado.revocar_beneficio(p_otorgado uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform privado.exigir(privado.es_direccion());
  if p_motivo is null or length(btrim(p_motivo)) < 5 then
    raise exception 'MOTIVO_REQUERIDO' using errcode = 'P0001';
  end if;
  update public.beneficios_otorgados
     set revocado_en = now(),
         motivo = concat_ws(' · ', nullif(motivo, ''), 'Revocado: ' || btrim(p_motivo))
   where id = p_otorgado and revocado_en is null;
  if not found then
    raise exception 'TRANSICION_INVALIDA: el beneficio ya estaba revocado' using errcode = 'P0001';
  end if;
end;
$$;

create or replace function public.revocar_beneficio(p_otorgado uuid, p_motivo text)
returns void language sql security invoker set search_path = '' as $$
  select privado.revocar_beneficio(p_otorgado, p_motivo);
$$;

-- ---------------------------------------------------------------------
-- Personas: alta en una sola transacción
-- ---------------------------------------------------------------------
create or replace function privado.alta_persona(
  p_nombres text, p_apellidos text, p_tipo_documento text, p_numero_documento text,
  p_fecha_nacimiento date, p_email text, p_telefono text, p_domicilio text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_persona uuid;
  v_doc text := nullif(btrim(coalesce(p_numero_documento, '')), '');
begin
  if nullif(btrim(coalesce(p_nombres, '')), '') is null or nullif(btrim(coalesce(p_apellidos, '')), '') is null then
    raise exception 'DATOS_INVALIDOS: nombres y apellidos son obligatorios' using errcode = 'P0001';
  end if;
  if p_fecha_nacimiento is not null and p_fecha_nacimiento > privado.hoy() then
    raise exception 'FECHA_FUTURA' using errcode = 'P0001';
  end if;
  insert into public.personas (nombres, apellidos)
  values (btrim(p_nombres), btrim(p_apellidos))
  returning id into v_persona;
  insert into public.personas_datos (persona_id, tipo_documento, numero_documento, fecha_nacimiento, email, telefono, domicilio)
  values (v_persona,
          case when v_doc is null then null else coalesce(nullif(p_tipo_documento, ''), 'DNI') end,
          v_doc, p_fecha_nacimiento,
          lower(nullif(btrim(coalesce(p_email, '')), '')),
          nullif(btrim(coalesce(p_telefono, '')), ''),
          nullif(btrim(coalesce(p_domicilio, '')), ''));
  return v_persona;
end;
$$;

-- Estudiante nuevo (persona + datos + legajo) o legajo para una persona ya cargada.
create or replace function privado.alta_estudiante(
  p_nombres text, p_apellidos text,
  p_tipo_documento text default null, p_numero_documento text default null,
  p_fecha_nacimiento date default null, p_email text default null, p_telefono text default null,
  p_persona uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_persona uuid;
  v_est public.estudiantes;
begin
  perform privado.exigir(privado.es_gestion());
  if p_persona is not null then
    if not exists (select 1 from public.personas where id = p_persona and eliminada_en is null) then
      raise exception 'NO_ENCONTRADO: persona' using errcode = 'P0002';
    end if;
    v_persona := p_persona;
  else
    v_persona := privado.alta_persona(p_nombres, p_apellidos, p_tipo_documento, p_numero_documento,
                                      p_fecha_nacimiento, p_email, p_telefono);
  end if;
  insert into public.estudiantes (persona_id) values (v_persona) returning * into v_est;
  return jsonb_build_object('estudiante_id', v_est.id, 'legajo', v_est.legajo, 'persona_id', v_persona);
end;
$$;

create or replace function public.alta_estudiante(
  p_nombres text, p_apellidos text,
  p_tipo_documento text default null, p_numero_documento text default null,
  p_fecha_nacimiento date default null, p_email text default null, p_telefono text default null,
  p_persona uuid default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select privado.alta_estudiante(p_nombres, p_apellidos, p_tipo_documento, p_numero_documento,
                                 p_fecha_nacimiento, p_email, p_telefono, p_persona);
$$;

-- Persona nueva como responsable de un estudiante (vínculo "invitado").
create or replace function privado.alta_responsable(
  p_estudiante uuid, p_nombres text, p_apellidos text,
  p_tipo_documento text default null, p_numero_documento text default null,
  p_email text default null, p_telefono text default null, p_parentesco text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_persona uuid;
  v_vinculo uuid;
begin
  perform privado.exigir(privado.es_gestion());
  if not exists (select 1 from public.estudiantes where id = p_estudiante) then
    raise exception 'NO_ENCONTRADO: estudiante' using errcode = 'P0002';
  end if;
  v_persona := privado.alta_persona(p_nombres, p_apellidos, p_tipo_documento, p_numero_documento,
                                    null, p_email, p_telefono);
  v_vinculo := privado.invitar_responsable(p_estudiante, v_persona, nullif(btrim(coalesce(p_parentesco, '')), ''));
  return jsonb_build_object('persona_id', v_persona, 'vinculo_id', v_vinculo);
end;
$$;

create or replace function public.alta_responsable(
  p_estudiante uuid, p_nombres text, p_apellidos text,
  p_tipo_documento text default null, p_numero_documento text default null,
  p_email text default null, p_telefono text default null, p_parentesco text default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select privado.alta_responsable(p_estudiante, p_nombres, p_apellidos, p_tipo_documento, p_numero_documento,
                                  p_email, p_telefono, p_parentesco);
$$;

-- ---------------------------------------------------------------------
-- Importación desde planillas
-- ---------------------------------------------------------------------
insert into public.conceptos (codigo, nombre, tipo)
values ('SALDO-ANTERIOR', 'Saldo anterior al sistema', 'otro')
on conflict (codigo) do nothing;

/**
 * Una fila de la planilla: estudiante, responsable opcional y deuda inicial
 * opcional. Todo en una transacción. Claves de p_fila (texto):
 *   nombres, apellidos, tipo_documento, documento, fecha_nacimiento, email, telefono,
 *   resp_nombres, resp_apellidos, resp_tipo_documento, resp_documento, resp_email,
 *   resp_telefono, resp_parentesco, deuda (número), deuda_detalle
 * p_verificar: el vínculo queda verificado (con permisos completos y como
 * responsable de pago) porque el instituto ya conoce a la familia.
 */
create or replace function privado.importar_estudiante(p_fila jsonb, p_verificar boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_alta jsonb;
  v_estudiante uuid;
  v_persona uuid;
  v_resp jsonb;
  v_responsable uuid;
  v_deuda numeric;
  v_concepto uuid;
  v_nacimiento date;
begin
  perform privado.exigir(privado.es_gestion());
  v_nacimiento := nullif(p_fila ->> 'fecha_nacimiento', '')::date;
  v_alta := privado.alta_estudiante(p_fila ->> 'nombres', p_fila ->> 'apellidos',
    p_fila ->> 'tipo_documento', p_fila ->> 'documento', v_nacimiento,
    p_fila ->> 'email', p_fila ->> 'telefono', null);
  v_estudiante := (v_alta ->> 'estudiante_id')::uuid;
  v_persona := (v_alta ->> 'persona_id')::uuid;

  if nullif(btrim(coalesce(p_fila ->> 'resp_apellidos', '')), '') is not null then
    v_resp := privado.alta_responsable(v_estudiante, p_fila ->> 'resp_nombres', p_fila ->> 'resp_apellidos',
      p_fila ->> 'resp_tipo_documento', p_fila ->> 'resp_documento',
      p_fila ->> 'resp_email', p_fila ->> 'resp_telefono', p_fila ->> 'resp_parentesco');
    v_responsable := (v_resp ->> 'persona_id')::uuid;
    if p_verificar then
      perform privado.verificar_vinculo((v_resp ->> 'vinculo_id')::uuid, true, true, true, true, true);
    end if;
  end if;

  v_deuda := nullif(p_fila ->> 'deuda', '')::numeric;
  if v_deuda is not null and v_deuda > 0 then
    select id into v_concepto from public.conceptos where codigo = 'SALDO-ANTERIOR';
    perform privado.crear_obligacion(v_estudiante, coalesce(v_responsable, v_persona), v_concepto,
      coalesce(nullif(btrim(coalesce(p_fila ->> 'deuda_detalle', '')), ''), 'Saldo anterior al sistema'),
      round(v_deuda, 2), privado.hoy(), null);
  end if;

  return v_alta || jsonb_build_object('responsable_id', v_responsable);
end;
$$;

create or replace function public.importar_estudiante(p_fila jsonb, p_verificar boolean default false)
returns jsonb language sql security invoker set search_path = '' as $$
  select privado.importar_estudiante(p_fila, p_verificar);
$$;

-- ---------------------------------------------------------------------
-- Comprobantes de pago numerados
-- ---------------------------------------------------------------------
alter table public.pagos add column numero bigint generated always as identity;
alter table public.pagos add constraint pagos_numero_key unique (numero);

-- ---------------------------------------------------------------------
-- Clases canceladas
-- ---------------------------------------------------------------------
alter table public.clases add column motivo_cancelacion text
  check (motivo_cancelacion is null or length(btrim(motivo_cancelacion)) between 3 and 300);

-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
revoke execute on function
  privado.cambiar_arancel(uuid, numeric, date, uuid, uuid, uuid),
  privado.revocar_beneficio(uuid, text),
  privado.alta_persona(text, text, text, text, date, text, text, text),
  privado.alta_estudiante(text, text, text, text, date, text, text, uuid),
  privado.alta_responsable(uuid, text, text, text, text, text, text, text),
  privado.importar_estudiante(jsonb, boolean),
  public.cambiar_arancel(uuid, numeric, date, uuid, uuid, uuid),
  public.revocar_beneficio(uuid, text),
  public.alta_estudiante(text, text, text, text, date, text, text, uuid),
  public.alta_responsable(uuid, text, text, text, text, text, text, text),
  public.importar_estudiante(jsonb, boolean)
from public, anon;
-- alta_persona no se expone: solo la usan las altas de esta migración.
revoke execute on function privado.alta_persona(text, text, text, text, date, text, text, text) from authenticated;
grant execute on function
  privado.cambiar_arancel(uuid, numeric, date, uuid, uuid, uuid),
  privado.revocar_beneficio(uuid, text),
  privado.alta_estudiante(text, text, text, text, date, text, text, uuid),
  privado.alta_responsable(uuid, text, text, text, text, text, text, text),
  privado.importar_estudiante(jsonb, boolean),
  public.cambiar_arancel(uuid, numeric, date, uuid, uuid, uuid),
  public.revocar_beneficio(uuid, text),
  public.alta_estudiante(text, text, text, text, date, text, text, uuid),
  public.alta_responsable(uuid, text, text, text, text, text, text, text),
  public.importar_estudiante(jsonb, boolean)
to authenticated, service_role;
