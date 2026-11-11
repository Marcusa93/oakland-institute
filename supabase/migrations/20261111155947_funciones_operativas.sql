-- =====================================================================
-- 06 · Operaciones críticas (transaccionales)
--
-- Patrón: la lógica vive en `privado.*` (SECURITY DEFINER, esquema no
-- expuesto, con verificación de rol adentro). En `public.*` hay envoltorios
-- SECURITY INVOKER que son la única superficie invocable desde la API.
-- Las tablas que estas funciones protegen (matrículas, pagos, imputaciones,
-- obligaciones, vínculos, roles) NO tienen permisos de escritura directa.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Perfiles efectivos de la cuenta actual
-- ---------------------------------------------------------------------
create or replace function privado.perfiles_actuales()
returns text[] language sql stable security definer set search_path = '' as $$
  select case
    when (select auth.uid()) is null or privado.persona_actual() is null then array['visitante']
    else coalesce((
      select array_agg(p order by p) from (
        select r.rol::text as p from public.roles_asignados r
          where r.cuenta_id = (select auth.uid()) and r.revocado_en is null
        union
        select 'estudiante' where exists (
          select 1 from public.estudiantes e where e.persona_id = privado.persona_actual())
        union
        select 'tutor' where exists (
          select 1 from public.vinculos_responsables v
          where v.responsable_persona_id = privado.persona_actual() and v.estado = 'verificado')
        -- Quien figura como responsable de pago accede a su cuenta aunque no
        -- tenga un vínculo familiar (por ejemplo, un tercero que paga).
        union
        select 'tutor' where exists (
          select 1 from public.matriculas_pago mp
          where mp.responsable_pago_persona_id = privado.persona_actual())
      ) t
    ), array[]::text[])
  end;
$$;

create or replace function public.mi_contexto()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'persona_id', privado.persona_actual(),
    'perfiles', to_jsonb(privado.perfiles_actuales())
  );
$$;

-- ---------------------------------------------------------------------
-- Roles de personal (solo dirección)
-- ---------------------------------------------------------------------
create or replace function privado.otorgar_rol(p_cuenta uuid, p_rol public.rol_personal)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform privado.exigir(privado.es_direccion());
  insert into public.roles_asignados (cuenta_id, rol, otorgado_por)
  values (p_cuenta, p_rol, (select auth.uid()))
  on conflict (cuenta_id, rol) where revocado_en is null do nothing
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function privado.revocar_rol(p_cuenta uuid, p_rol public.rol_personal)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform privado.exigir(privado.es_direccion());
  if p_rol = 'direccion' and (
    select count(*) from public.roles_asignados where rol = 'direccion' and revocado_en is null
  ) <= 1 then
    raise exception 'ULTIMA_DIRECCION: debe quedar al menos una cuenta de dirección' using errcode = 'P0001';
  end if;
  update public.roles_asignados
     set revocado_en = now(), revocado_por = (select auth.uid())
   where cuenta_id = p_cuenta and rol = p_rol and revocado_en is null;
end;
$$;

create or replace function public.otorgar_rol(p_cuenta uuid, p_rol public.rol_personal)
returns uuid language sql security invoker set search_path = '' as $$ select privado.otorgar_rol(p_cuenta, p_rol); $$;
create or replace function public.revocar_rol(p_cuenta uuid, p_rol public.rol_personal)
returns void language sql security invoker set search_path = '' as $$ select privado.revocar_rol(p_cuenta, p_rol); $$;

-- ---------------------------------------------------------------------
-- Vínculos responsable ↔ estudiante
-- ---------------------------------------------------------------------
create or replace function privado.invitar_responsable(
  p_estudiante uuid, p_responsable uuid, p_parentesco text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform privado.exigir(privado.es_gestion());
  if exists (select 1 from public.estudiantes e where e.id = p_estudiante and e.persona_id = p_responsable) then
    raise exception 'VINCULO_INVALIDO: una persona no puede ser responsable de sí misma' using errcode = 'P0001';
  end if;
  insert into public.vinculos_responsables (estudiante_id, responsable_persona_id, parentesco, invitado_por)
  values (p_estudiante, p_responsable, p_parentesco, (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

-- Responde el propio responsable invitado (aceptar o rechazar).
create or replace function privado.responder_vinculo(p_vinculo uuid, p_aceptar boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.vinculos_responsables;
begin
  select * into v from public.vinculos_responsables where id = p_vinculo for update;
  perform privado.exigir(found and v.responsable_persona_id = privado.persona_actual());
  if v.estado <> 'invitado' then
    raise exception 'TRANSICION_INVALIDA: el vínculo está %', v.estado using errcode = 'P0001';
  end if;
  update public.vinculos_responsables
     set estado = case when p_aceptar then 'aceptado' else 'rechazado' end::public.estado_vinculo,
         aceptado_en = case when p_aceptar then now() end,
         motivo_cierre = case when p_aceptar then null else 'Rechazado por la persona invitada' end
   where id = p_vinculo;
end;
$$;

-- Validación administrativa: recién acá se otorgan permisos.
create or replace function privado.verificar_vinculo(
  p_vinculo uuid, p_academico boolean, p_documental boolean, p_economico boolean,
  p_responsable_pago boolean default false, p_contacto_emergencia boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.vinculos_responsables;
begin
  perform privado.exigir(privado.es_gestion());
  select * into v from public.vinculos_responsables where id = p_vinculo for update;
  if not found then raise exception 'NO_ENCONTRADO' using errcode = 'P0002'; end if;
  if v.estado = 'verificado' then
    null; -- modificación de permisos de un vínculo ya verificado
  elsif not privado.vinculo_transicion_valida(v.estado, 'verificado') then
    raise exception 'TRANSICION_INVALIDA: el vínculo está %', v.estado using errcode = 'P0001';
  end if;
  update public.vinculos_responsables
     set estado = 'verificado',
         permiso_academico = p_academico,
         permiso_documental = p_documental,
         permiso_economico = p_economico or p_responsable_pago,
         es_responsable_pago = p_responsable_pago,
         es_contacto_emergencia = p_contacto_emergencia,
         verificado_por = coalesce(v.verificado_por, (select auth.uid())),
         verificado_en = coalesce(v.verificado_en, now())
   where id = p_vinculo;
end;
$$;

create or replace function privado.revocar_vinculo(p_vinculo uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare v public.vinculos_responsables;
begin
  perform privado.exigir(privado.es_gestion());
  if p_motivo is null or length(btrim(p_motivo)) < 5 then
    raise exception 'MOTIVO_REQUERIDO' using errcode = 'P0001';
  end if;
  select * into v from public.vinculos_responsables where id = p_vinculo for update;
  if not found then raise exception 'NO_ENCONTRADO' using errcode = 'P0002'; end if;
  if not privado.vinculo_transicion_valida(v.estado, 'revocado') then
    raise exception 'TRANSICION_INVALIDA: el vínculo está %', v.estado using errcode = 'P0001';
  end if;
  update public.vinculos_responsables
     set estado = 'revocado', revocado_en = now(), revocado_por = (select auth.uid()),
         motivo_cierre = p_motivo,
         permiso_academico = false, permiso_documental = false, permiso_economico = false,
         es_responsable_pago = false
   where id = p_vinculo;
end;
$$;

create or replace function public.invitar_responsable(p_estudiante uuid, p_responsable uuid, p_parentesco text default null)
returns uuid language sql security invoker set search_path = '' as $$ select privado.invitar_responsable(p_estudiante, p_responsable, p_parentesco); $$;
create or replace function public.responder_vinculo(p_vinculo uuid, p_aceptar boolean)
returns void language sql security invoker set search_path = '' as $$ select privado.responder_vinculo(p_vinculo, p_aceptar); $$;
create or replace function public.verificar_vinculo(
  p_vinculo uuid, p_academico boolean, p_documental boolean, p_economico boolean,
  p_responsable_pago boolean default false, p_contacto_emergencia boolean default false)
returns void language sql security invoker set search_path = '' as $$
  select privado.verificar_vinculo(p_vinculo, p_academico, p_documental, p_economico, p_responsable_pago, p_contacto_emergencia);
$$;
create or replace function public.revocar_vinculo(p_vinculo uuid, p_motivo text)
returns void language sql security invoker set search_path = '' as $$ select privado.revocar_vinculo(p_vinculo, p_motivo); $$;

-- ---------------------------------------------------------------------
-- Aranceles y obligaciones
-- ---------------------------------------------------------------------
-- Arancel vigente más específico: comisión > curso > ciclo > general.
create or replace function privado.arancel_vigente(p_tipo public.tipo_concepto, p_comision uuid, p_fecha date)
returns public.aranceles language sql stable security definer set search_path = '' as $$
  select a.*
  from public.aranceles a
  join public.conceptos c on c.id = a.concepto_id and c.activo
  join public.comisiones k on k.id = p_comision
  where c.tipo = p_tipo
    and a.vigente_desde <= p_fecha
    and (a.vigente_hasta is null or a.vigente_hasta >= p_fecha)
    and (a.comision_id is null or a.comision_id = k.id)
    and (a.curso_id is null or a.curso_id = k.curso_id)
    and (a.ciclo_id is null or a.ciclo_id = k.ciclo_id)
  order by (a.comision_id is not null) desc, (a.curso_id is not null) desc,
           (a.ciclo_id is not null) desc, a.vigente_desde desc
  limit 1;
$$;

-- Descuento aplicable por beneficios aprobados y vigentes (tope: el importe).
create or replace function privado.descuento_matricula(
  p_matricula uuid, p_tipo public.tipo_concepto, p_fecha date, p_importe numeric)
returns numeric language sql stable security definer set search_path = '' as $$
  select least(p_importe, coalesce(sum(
    case when b.porcentaje is not null then round(p_importe * b.porcentaje / 100, 2) else b.monto_fijo end
  ), 0))::numeric(14, 2)
  from public.beneficios_otorgados o
  join public.beneficios b on b.id = o.beneficio_id
  where o.matricula_id = p_matricula
    and o.aplica_a = p_tipo
    and o.revocado_en is null
    and o.vigente_desde <= p_fecha
    and (o.vigente_hasta is null or o.vigente_hasta >= p_fecha);
$$;

create or replace function privado.recalcular_obligacion(p_obligacion uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_importe numeric;
  v_pagado numeric;
  v_estado public.estado_obligacion;
begin
  select o.importe, o.estado into v_importe, v_estado
  from public.obligaciones o where o.id = p_obligacion for update;
  if v_estado = 'anulada' then return; end if;
  select coalesce(sum(i.importe), 0) into v_pagado
  from public.imputaciones i
  join public.pagos p on p.id = i.pago_id
  where i.obligacion_id = p_obligacion and i.anulada_en is null and p.estado = 'confirmado';
  update public.obligaciones
     set estado = case
           when v_pagado >= v_importe then 'pagada'
           when v_pagado > 0 then 'parcial'
           else 'pendiente' end::public.estado_obligacion
   where id = p_obligacion;
end;
$$;

create or replace function privado.hoy()
returns date language sql stable set search_path = '' as $$
  select (now() at time zone 'America/Argentina/Tucuman')::date;
$$;

-- ---------------------------------------------------------------------
-- Cupos: reserva, confirmación de inscripción, cambio y baja
-- Todas toman un bloqueo de fila sobre la comisión (FOR UPDATE): dos
-- operaciones simultáneas sobre la misma comisión se ejecutan en serie.
-- ---------------------------------------------------------------------
create or replace function privado.bloquear_comision(p_comision uuid)
returns public.comisiones language plpgsql security definer set search_path = '' as $$
declare k public.comisiones;
begin
  select * into k from public.comisiones where id = p_comision for update;
  if not found then raise exception 'NO_ENCONTRADO: comisión' using errcode = 'P0002'; end if;
  -- Las reservas vencidas liberan su lugar.
  update public.reservas_vacante set estado = 'vencida'
   where comision_id = p_comision and estado = 'vigente' and vence_en <= now();
  return k;
end;
$$;

create or replace function privado.reservar_vacante(p_estudiante uuid, p_comision uuid, p_horas int default 72)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  k public.comisiones;
  v_id uuid;
begin
  perform privado.exigir(privado.es_gestion());
  if p_horas is null or p_horas < 1 or p_horas > 24 * 30 then
    raise exception 'PLAZO_INVALIDO' using errcode = 'P0001';
  end if;
  k := privado.bloquear_comision(p_comision);
  if k.estado not in ('abierta', 'en_curso') then
    raise exception 'COMISION_NO_DISPONIBLE: la comisión está %', k.estado using errcode = 'P0001';
  end if;
  if privado.ocupacion_comision(p_comision) >= k.cupo then
    raise exception 'SIN_CUPO' using errcode = 'P0001';
  end if;
  insert into public.reservas_vacante (comision_id, estudiante_id, vence_en, creada_por)
  values (p_comision, p_estudiante, now() + make_interval(hours => p_horas), (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function privado.confirmar_inscripcion(
  p_estudiante uuid, p_comision uuid, p_responsable_pago uuid,
  p_solicitud uuid default null, p_matricula_anterior uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  k public.comisiones;
  v_reserva uuid;
  v_matricula uuid;
  v_arancel public.aranceles;
  v_hoy date := privado.hoy();
  v_descuento numeric;
  v_condiciones jsonb := '{}'::jsonb;
  v_cuota public.aranceles;
begin
  perform privado.exigir(privado.es_gestion());
  k := privado.bloquear_comision(p_comision);
  if k.estado not in ('abierta', 'en_curso') then
    raise exception 'COMISION_NO_DISPONIBLE: la comisión está %', k.estado using errcode = 'P0001';
  end if;
  if exists (select 1 from public.matriculas m
             where m.estudiante_id = p_estudiante and m.comision_id = p_comision and m.estado = 'activa') then
    raise exception 'YA_INSCRIPTO' using errcode = 'P0001';
  end if;

  -- Una reserva vigente del mismo estudiante ya ocupa su lugar: se convierte.
  select r.id into v_reserva from public.reservas_vacante r
   where r.comision_id = p_comision and r.estudiante_id = p_estudiante and r.estado = 'vigente';
  if v_reserva is null and privado.ocupacion_comision(p_comision) >= k.cupo then
    raise exception 'SIN_CUPO' using errcode = 'P0001';
  end if;

  v_arancel := privado.arancel_vigente('matricula', p_comision, v_hoy);
  v_cuota := privado.arancel_vigente('cuota', p_comision, v_hoy);
  v_condiciones := jsonb_build_object(
    'fecha', v_hoy,
    'arancel_matricula', case when v_arancel.id is not null then
      jsonb_build_object('arancel_id', v_arancel.id, 'importe', v_arancel.importe, 'moneda', v_arancel.moneda) end,
    'arancel_cuota_al_inscribir', case when v_cuota.id is not null then
      jsonb_build_object('arancel_id', v_cuota.id, 'importe', v_cuota.importe, 'moneda', v_cuota.moneda) end
  );

  insert into public.matriculas (estudiante_id, comision_id, matricula_anterior_id, creada_por)
  values (p_estudiante, p_comision, p_matricula_anterior, (select auth.uid()))
  returning id into v_matricula;
  insert into public.matriculas_pago (matricula_id, responsable_pago_persona_id, condiciones)
  values (v_matricula, p_responsable_pago, v_condiciones);

  if v_reserva is not null then
    update public.reservas_vacante set estado = 'convertida' where id = v_reserva;
  end if;
  update public.lista_espera set estado = 'convertida'
   where comision_id = p_comision and estudiante_id = p_estudiante and estado in ('esperando', 'ofrecida');
  update public.estudiantes set estado = 'activo' where id = p_estudiante and estado <> 'activo';

  if p_solicitud is not null then
    update public.solicitudes_inscripcion
       set estado = 'confirmada', matricula_id = v_matricula, resuelta_en = now()
     where id = p_solicitud and estudiante_id = p_estudiante and comision_id = p_comision
       and estado in ('pendiente', 'en_revision', 'aprobada');
    if not found then
      raise exception 'SOLICITUD_INVALIDA: no corresponde o ya fue resuelta' using errcode = 'P0001';
    end if;
    update public.consultas c set estado = 'ganada', estudiante_id = p_estudiante
      from public.solicitudes_inscripcion s
     where s.id = p_solicitud and c.id = s.consulta_id and c.estado <> 'ganada';
  end if;

  -- Derecho de matrícula: solo en inscripciones nuevas (no en cambios de comisión).
  if v_arancel.id is not null and v_arancel.importe > 0 and p_matricula_anterior is null then
    v_descuento := privado.descuento_matricula(v_matricula, 'matricula', v_hoy, v_arancel.importe);
    insert into public.obligaciones (estudiante_id, matricula_id, responsable_pago_persona_id, concepto_id,
      descripcion, arancel_id, importe_original, descuento, moneda, vencimiento, creada_por)
    values (p_estudiante, v_matricula, p_responsable_pago, v_arancel.concepto_id,
      'Matrícula · ' || k.nombre, v_arancel.id, v_arancel.importe, v_descuento, v_arancel.moneda,
      v_hoy + 10, (select auth.uid()));
  end if;

  return v_matricula;
end;
$$;

create or replace function privado.dar_de_baja_matricula(p_matricula uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform privado.exigir(privado.es_gestion());
  if p_motivo is null or length(btrim(p_motivo)) < 3 then
    raise exception 'MOTIVO_REQUERIDO' using errcode = 'P0001';
  end if;
  update public.matriculas
     set estado = 'baja', fecha_baja = privado.hoy(), motivo_baja = p_motivo
   where id = p_matricula and estado = 'activa';
  if not found then raise exception 'MATRICULA_NO_ACTIVA' using errcode = 'P0001'; end if;
  -- Las obligaciones ya generadas no se anulan solas: es una decisión de gestión.
end;
$$;

create or replace function privado.cambiar_comision(p_matricula uuid, p_nueva_comision uuid, p_motivo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  m public.matriculas;
  v_nueva uuid;
begin
  perform privado.exigir(privado.es_gestion());
  select * into m from public.matriculas where id = p_matricula and estado = 'activa' for update;
  if not found then raise exception 'MATRICULA_NO_ACTIVA' using errcode = 'P0001'; end if;
  if m.comision_id = p_nueva_comision then
    raise exception 'MISMA_COMISION' using errcode = 'P0001';
  end if;
  -- confirmar_inscripcion bloquea la comisión destino y controla el cupo.
  v_nueva := privado.confirmar_inscripcion(
    m.estudiante_id, p_nueva_comision,
    (select mp.responsable_pago_persona_id from public.matriculas_pago mp where mp.matricula_id = m.id),
    null, m.id);
  update public.matriculas
     set estado = 'cambiada', fecha_baja = privado.hoy(), motivo_baja = coalesce(p_motivo, 'Cambio de comisión')
   where id = p_matricula;
  -- Las cuotas pendientes siguen a la nueva matrícula.
  update public.obligaciones set matricula_id = v_nueva
   where matricula_id = p_matricula and estado in ('pendiente', 'parcial')
     and periodo is not null and periodo >= date_trunc('month', privado.hoy())::date;
  return v_nueva;
end;
$$;

create or replace function privado.cancelar_reserva(p_reserva uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform privado.exigir(privado.es_gestion());
  update public.reservas_vacante set estado = 'cancelada' where id = p_reserva and estado = 'vigente';
  if not found then raise exception 'TRANSICION_INVALIDA: la reserva ya no está vigente' using errcode = 'P0001'; end if;
end;
$$;
create or replace function public.cancelar_reserva(p_reserva uuid)
returns void language sql security invoker set search_path = '' as $$ select privado.cancelar_reserva(p_reserva); $$;

create or replace function public.reservar_vacante(p_estudiante uuid, p_comision uuid, p_horas int default 72)
returns uuid language sql security invoker set search_path = '' as $$ select privado.reservar_vacante(p_estudiante, p_comision, p_horas); $$;
create or replace function public.confirmar_inscripcion(
  p_estudiante uuid, p_comision uuid, p_responsable_pago uuid, p_solicitud uuid default null)
returns uuid language sql security invoker set search_path = '' as $$
  select privado.confirmar_inscripcion(p_estudiante, p_comision, p_responsable_pago, p_solicitud, null);
$$;
create or replace function public.dar_de_baja_matricula(p_matricula uuid, p_motivo text)
returns void language sql security invoker set search_path = '' as $$ select privado.dar_de_baja_matricula(p_matricula, p_motivo); $$;
create or replace function public.cambiar_comision(p_matricula uuid, p_nueva_comision uuid, p_motivo text default null)
returns uuid language sql security invoker set search_path = '' as $$ select privado.cambiar_comision(p_matricula, p_nueva_comision, p_motivo); $$;

-- ---------------------------------------------------------------------
-- Generación de cuotas (idempotente por matrícula + concepto + período)
-- ---------------------------------------------------------------------
create or replace function privado.generar_cuotas_interno(p_periodo date, p_dia_vencimiento int, p_actor uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_periodo date := date_trunc('month', p_periodo)::date;
  v_fin date := (date_trunc('month', p_periodo) + interval '1 month - 1 day')::date;
  v_total int := 0;
  r record;
  a public.aranceles;
  v_desc numeric;
begin
  if p_dia_vencimiento not between 1 and 28 then
    raise exception 'DIA_INVALIDO' using errcode = 'P0001';
  end if;
  for r in
    select m.id as matricula_id, m.estudiante_id, m.comision_id, mp.responsable_pago_persona_id, k.nombre
    from public.matriculas m
    join public.matriculas_pago mp on mp.matricula_id = m.id
    join public.comisiones k on k.id = m.comision_id
    where m.estado = 'activa' and k.fecha_inicio <= v_fin and k.fecha_fin >= v_periodo
      and m.fecha_alta <= v_fin
  loop
    -- Se usa el arancel vigente al inicio del período: un aumento posterior
    -- no modifica cuotas ya generadas.
    a := privado.arancel_vigente('cuota', r.comision_id, v_periodo);
    continue when a.id is null or a.importe = 0;
    v_desc := privado.descuento_matricula(r.matricula_id, 'cuota', v_periodo, a.importe);
    insert into public.obligaciones (estudiante_id, matricula_id, responsable_pago_persona_id, concepto_id,
      descripcion, periodo, arancel_id, importe_original, descuento, moneda, vencimiento, creada_por)
    values (r.estudiante_id, r.matricula_id, r.responsable_pago_persona_id, a.concepto_id,
      'Cuota ' || to_char(v_periodo, 'MM/YYYY') || ' · ' || r.nombre, v_periodo, a.id, a.importe, v_desc,
      a.moneda, v_periodo + (p_dia_vencimiento - 1), p_actor)
    on conflict (matricula_id, concepto_id, periodo)
      where estado <> 'anulada' and matricula_id is not null and periodo is not null
    do nothing;
    if found then v_total := v_total + 1; end if;
  end loop;
  return v_total;
end;
$$;

create or replace function privado.generar_cuotas(p_periodo date, p_dia_vencimiento int)
returns int language plpgsql security definer set search_path = '' as $$
begin
  perform privado.exigir(privado.es_gestion());
  return privado.generar_cuotas_interno(p_periodo, p_dia_vencimiento, (select auth.uid()));
end;
$$;
create or replace function public.generar_cuotas(p_periodo date, p_dia_vencimiento int default 10)
returns int language sql security invoker set search_path = '' as $$ select privado.generar_cuotas(p_periodo, p_dia_vencimiento); $$;

-- Variante para la tarea programada (solo service_role; ver permisos en 07).
create or replace function public.generar_cuotas_programada(p_periodo date, p_dia_vencimiento int default 10)
returns int language plpgsql security invoker set search_path = '' as $$
declare v_n int;
begin
  v_n := privado.generar_cuotas_interno(p_periodo, p_dia_vencimiento, null);
  insert into public.tareas_ejecutadas (tarea, clave, resultado)
  values ('generar_cuotas', to_char(p_periodo, 'YYYY-MM'), jsonb_build_object('generadas', v_n))
  on conflict (tarea, clave) do update set ejecutada_en = now(), resultado = excluded.resultado;
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------
-- Pagos, validación, imputación, reversos y devoluciones
-- ---------------------------------------------------------------------
create or replace function privado.imputar_interno(p_pago uuid, p_obligacion uuid, p_importe numeric, p_actor uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  p public.pagos;
  o public.obligaciones;
  v_disponible numeric;
  v_saldo numeric;
  v_id uuid;
begin
  if p_importe is null or p_importe <= 0 then
    raise exception 'IMPORTE_INVALIDO' using errcode = 'P0001';
  end if;
  -- Orden de bloqueo fijo (pago → obligación) para evitar interbloqueos.
  select * into p from public.pagos where id = p_pago for update;
  if not found then raise exception 'NO_ENCONTRADO: pago' using errcode = 'P0002'; end if;
  if p.estado <> 'confirmado' then
    raise exception 'PAGO_NO_CONFIRMADO: solo se imputan pagos confirmados (estado %)', p.estado using errcode = 'P0001';
  end if;
  select * into o from public.obligaciones where id = p_obligacion for update;
  if not found then raise exception 'NO_ENCONTRADO: obligación' using errcode = 'P0002'; end if;
  if o.estado in ('anulada', 'pagada') then
    raise exception 'OBLIGACION_NO_IMPUTABLE: está %', o.estado using errcode = 'P0001';
  end if;
  if o.moneda <> p.moneda then raise exception 'MONEDA_DISTINTA' using errcode = 'P0001'; end if;

  select p.importe
       - coalesce((select sum(i.importe) from public.imputaciones i where i.pago_id = p_pago and i.anulada_en is null), 0)
       - coalesce((select sum(a.importe) from public.ajustes a where a.pago_id = p_pago and a.tipo = 'devolucion'), 0)
    into v_disponible;
  select o.importe - coalesce(sum(i.importe), 0) into v_saldo
    from public.imputaciones i join public.pagos pg on pg.id = i.pago_id
   where i.obligacion_id = p_obligacion and i.anulada_en is null and pg.estado = 'confirmado';

  if p_importe > v_disponible then
    raise exception 'EXCEDE_PAGO: disponible %', v_disponible using errcode = 'P0001';
  end if;
  if p_importe > v_saldo then
    raise exception 'EXCEDE_OBLIGACION: saldo %', v_saldo using errcode = 'P0001';
  end if;

  insert into public.imputaciones (pago_id, obligacion_id, importe, creada_por)
  values (p_pago, p_obligacion, p_importe, p_actor) returning id into v_id;
  perform privado.recalcular_obligacion(p_obligacion);
  return v_id;
end;
$$;

-- Gestión registra un cobro. p_confirmar=true solo si quien registra verificó
-- la acreditación (efectivo recibido o transferencia vista en el banco).
-- p_imputaciones: [{"obligacion_id": "...", "importe": 1234.50}, ...]
create or replace function privado.registrar_pago(
  p_pagador uuid, p_medio public.medio_pago, p_importe numeric, p_fecha date,
  p_confirmar boolean default false, p_imputaciones jsonb default '[]'::jsonb,
  p_nota text default null, p_comprobante uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_pago uuid;
  v_yo uuid := (select auth.uid());
  it jsonb;
begin
  perform privado.exigir(privado.es_gestion());
  if p_medio = 'pasarela' then
    raise exception 'MEDIO_INVALIDO: los pagos de pasarela ingresan por notificación validada' using errcode = 'P0001';
  end if;
  if p_fecha > privado.hoy() then
    raise exception 'FECHA_FUTURA' using errcode = 'P0001';
  end if;
  insert into public.pagos (pagador_persona_id, medio, importe, fecha_pago, estado, nota,
                            comprobante_documento_id, registrado_por, validado_por, validado_en)
  values (p_pagador, p_medio, p_importe, p_fecha,
          case when p_confirmar then 'confirmado' else 'informado' end::public.estado_pago,
          p_nota, p_comprobante, v_yo,
          case when p_confirmar then v_yo end, case when p_confirmar then now() end)
  returning id into v_pago;

  if jsonb_array_length(coalesce(p_imputaciones, '[]'::jsonb)) > 0 then
    if not p_confirmar then
      raise exception 'PAGO_NO_CONFIRMADO: no se imputa un pago sin acreditar' using errcode = 'P0001';
    end if;
    for it in select * from jsonb_array_elements(p_imputaciones) loop
      perform privado.imputar_interno(v_pago, (it ->> 'obligacion_id')::uuid, (it ->> 'importe')::numeric, v_yo);
    end loop;
  end if;
  return v_pago;
end;
$$;

-- Un responsable informa una transferencia con su comprobante. Queda
-- 'informado': la imagen sola no acredita nada hasta que gestión la valide.
create or replace function privado.informar_transferencia(p_importe numeric, p_fecha date, p_comprobante uuid, p_nota text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_persona uuid := privado.persona_actual();
  v_pago uuid;
begin
  perform privado.exigir(v_persona is not null);
  -- Solo informa pagos quien tiene algo que pagar o permiso económico.
  perform privado.exigir(
    exists (select 1 from public.obligaciones o where o.responsable_pago_persona_id = v_persona)
    or exists (select 1 from public.vinculos_responsables v
               where v.responsable_persona_id = v_persona and v.estado = 'verificado' and v.permiso_economico),
    'NO_AUTORIZADO: no tenés obligaciones a tu cargo');
  if p_fecha > privado.hoy() then raise exception 'FECHA_FUTURA' using errcode = 'P0001'; end if;
  if p_comprobante is not null and not exists (
    select 1 from public.documentos d
    where d.id = p_comprobante and d.tipo = 'comprobante_pago'
      and d.persona_id = v_persona and d.subido_por = (select auth.uid())
  ) then
    raise exception 'COMPROBANTE_INVALIDO' using errcode = 'P0001';
  end if;
  insert into public.pagos (pagador_persona_id, medio, importe, fecha_pago, estado, nota,
                            comprobante_documento_id, registrado_por)
  values (v_persona, 'transferencia', p_importe, p_fecha, 'informado', p_nota, p_comprobante, (select auth.uid()))
  returning id into v_pago;
  return v_pago;
end;
$$;

create or replace function privado.validar_pago(p_pago uuid, p_aprobar boolean, p_motivo text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.pagos;
begin
  perform privado.exigir(privado.es_gestion());
  select * into p from public.pagos where id = p_pago for update;
  if not found then raise exception 'NO_ENCONTRADO: pago' using errcode = 'P0002'; end if;
  if p.estado <> 'informado' then
    raise exception 'TRANSICION_INVALIDA: el pago ya está %', p.estado using errcode = 'P0001';
  end if;
  if not p_aprobar and (p_motivo is null or length(btrim(p_motivo)) < 3) then
    raise exception 'MOTIVO_REQUERIDO' using errcode = 'P0001';
  end if;
  update public.pagos
     set estado = case when p_aprobar then 'confirmado' else 'rechazado' end::public.estado_pago,
         validado_por = (select auth.uid()), validado_en = now(),
         motivo_rechazo = case when p_aprobar then null else p_motivo end
   where id = p_pago;
end;
$$;

create or replace function privado.imputar_pago(p_pago uuid, p_obligacion uuid, p_importe numeric)
returns uuid language plpgsql security definer set search_path = '' as $$
begin
  perform privado.exigir(privado.es_gestion());
  return privado.imputar_interno(p_pago, p_obligacion, p_importe, (select auth.uid()));
end;
$$;

-- Reverso: el pago confirmado no se borra ni se edita; se marca reversado,
-- se anulan sus imputaciones y queda un ajuste con motivo y autor.
create or replace function privado.reversar_pago(p_pago uuid, p_motivo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  p public.pagos;
  v_ajuste uuid;
  v_obl uuid;
begin
  perform privado.exigir(privado.es_gestion());
  select * into p from public.pagos where id = p_pago for update;
  if not found then raise exception 'NO_ENCONTRADO: pago' using errcode = 'P0002'; end if;
  if p.estado <> 'confirmado' then
    raise exception 'TRANSICION_INVALIDA: solo se reversan pagos confirmados' using errcode = 'P0001';
  end if;
  insert into public.ajustes (tipo, pago_id, importe, moneda, motivo, creado_por)
  values ('reverso_pago', p_pago, p.importe, p.moneda, p_motivo, (select auth.uid()))
  returning id into v_ajuste;
  update public.pagos set estado = 'reversado' where id = p_pago;
  for v_obl in
    update public.imputaciones set anulada_en = now(), anulada_por = (select auth.uid())
     where pago_id = p_pago and anulada_en is null
    returning obligacion_id
  loop
    perform privado.recalcular_obligacion(v_obl);
  end loop;
  return v_ajuste;
end;
$$;

create or replace function privado.registrar_devolucion(p_pago uuid, p_importe numeric, p_motivo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  p public.pagos;
  v_disponible numeric;
  v_ajuste uuid;
begin
  perform privado.exigir(privado.es_gestion());
  select * into p from public.pagos where id = p_pago for update;
  if not found or p.estado <> 'confirmado' then
    raise exception 'PAGO_NO_CONFIRMADO' using errcode = 'P0001';
  end if;
  select p.importe
       - coalesce((select sum(i.importe) from public.imputaciones i where i.pago_id = p_pago and i.anulada_en is null), 0)
       - coalesce((select sum(a.importe) from public.ajustes a where a.pago_id = p_pago and a.tipo = 'devolucion'), 0)
    into v_disponible;
  if p_importe is null or p_importe <= 0 or p_importe > v_disponible then
    raise exception 'EXCEDE_SALDO_A_FAVOR: disponible %', v_disponible using errcode = 'P0001';
  end if;
  insert into public.ajustes (tipo, pago_id, importe, moneda, motivo, creado_por)
  values ('devolucion', p_pago, p_importe, p.moneda, p_motivo, (select auth.uid()))
  returning id into v_ajuste;
  return v_ajuste;
end;
$$;

create or replace function privado.anular_obligacion(p_obligacion uuid, p_motivo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  o public.obligaciones;
  v_ajuste uuid;
begin
  perform privado.exigir(privado.es_gestion());
  select * into o from public.obligaciones where id = p_obligacion for update;
  if not found then raise exception 'NO_ENCONTRADO: obligación' using errcode = 'P0002'; end if;
  if o.estado <> 'pendiente' then
    raise exception 'OBLIGACION_CON_PAGOS: reversá o reimputá los pagos antes de anular (estado %)', o.estado
      using errcode = 'P0001';
  end if;
  insert into public.ajustes (tipo, obligacion_id, importe, moneda, motivo, creado_por)
  values ('anulacion_obligacion', p_obligacion, greatest(o.importe, 0.01), o.moneda, p_motivo, (select auth.uid()))
  returning id into v_ajuste;
  update public.obligaciones set estado = 'anulada' where id = p_obligacion;
  return v_ajuste;
end;
$$;

create or replace function public.registrar_pago(
  p_pagador uuid, p_medio public.medio_pago, p_importe numeric, p_fecha date,
  p_confirmar boolean default false, p_imputaciones jsonb default '[]'::jsonb,
  p_nota text default null, p_comprobante uuid default null)
returns uuid language sql security invoker set search_path = '' as $$
  select privado.registrar_pago(p_pagador, p_medio, p_importe, p_fecha, p_confirmar, p_imputaciones, p_nota, p_comprobante);
$$;
create or replace function public.informar_transferencia(p_importe numeric, p_fecha date, p_comprobante uuid, p_nota text default null)
returns uuid language sql security invoker set search_path = '' as $$ select privado.informar_transferencia(p_importe, p_fecha, p_comprobante, p_nota); $$;
create or replace function public.validar_pago(p_pago uuid, p_aprobar boolean, p_motivo text default null)
returns void language sql security invoker set search_path = '' as $$ select privado.validar_pago(p_pago, p_aprobar, p_motivo); $$;
create or replace function public.imputar_pago(p_pago uuid, p_obligacion uuid, p_importe numeric)
returns uuid language sql security invoker set search_path = '' as $$ select privado.imputar_pago(p_pago, p_obligacion, p_importe); $$;
create or replace function public.reversar_pago(p_pago uuid, p_motivo text)
returns uuid language sql security invoker set search_path = '' as $$ select privado.reversar_pago(p_pago, p_motivo); $$;
create or replace function public.registrar_devolucion(p_pago uuid, p_importe numeric, p_motivo text)
returns uuid language sql security invoker set search_path = '' as $$ select privado.registrar_devolucion(p_pago, p_importe, p_motivo); $$;
create or replace function public.anular_obligacion(p_obligacion uuid, p_motivo text)
returns uuid language sql security invoker set search_path = '' as $$ select privado.anular_obligacion(p_obligacion, p_motivo); $$;

-- ---------------------------------------------------------------------
-- Notificaciones de pasarela (integración pendiente; la base ya garantiza
-- idempotencia). La firma se valida en el servidor ANTES de llamar acá.
-- Solo service_role.
-- ---------------------------------------------------------------------
create or replace function public.procesar_evento_pasarela(
  p_proveedor text, p_evento_id text, p_tipo text, p_firma_valida boolean,
  p_referencia_pago text, p_importe numeric, p_fecha date,
  p_pagador uuid, p_obligacion uuid, p_payload jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_evento uuid;
  v_pago uuid;
  v_previo public.eventos_pasarela;
begin
  insert into public.eventos_pasarela (proveedor, evento_id_externo, tipo, firma_valida, payload)
  values (p_proveedor, p_evento_id, p_tipo, p_firma_valida, coalesce(p_payload, '{}'::jsonb))
  on conflict (proveedor, evento_id_externo) do nothing
  returning id into v_evento;

  if v_evento is null then
    select * into v_previo from public.eventos_pasarela
     where proveedor = p_proveedor and evento_id_externo = p_evento_id;
    return jsonb_build_object('duplicado', true, 'resultado', v_previo.resultado, 'pago_id', v_previo.pago_id);
  end if;

  if not p_firma_valida then
    update public.eventos_pasarela set procesado_en = now(), resultado = 'firma_invalida' where id = v_evento;
    return jsonb_build_object('duplicado', false, 'resultado', 'firma_invalida');
  end if;
  if p_tipo <> 'pago_aprobado' then
    update public.eventos_pasarela set procesado_en = now(), resultado = 'ignorado' where id = v_evento;
    return jsonb_build_object('duplicado', false, 'resultado', 'ignorado');
  end if;

  -- Segunda barrera: aunque el proveedor mande otro id de evento para el
  -- mismo cobro, la referencia del pago es única.
  insert into public.pagos (pagador_persona_id, medio, importe, fecha_pago, estado, proveedor,
                            referencia_externa, validado_en, nota)
  values (p_pagador, 'pasarela', p_importe, p_fecha, 'confirmado', p_proveedor, p_referencia_pago, now(),
          'Acreditado por notificación de pasarela')
  on conflict (proveedor, referencia_externa) where referencia_externa is not null do nothing
  returning id into v_pago;

  if v_pago is null then
    select id into v_pago from public.pagos where proveedor = p_proveedor and referencia_externa = p_referencia_pago;
    update public.eventos_pasarela set procesado_en = now(), resultado = 'pago_ya_registrado', pago_id = v_pago
     where id = v_evento;
    return jsonb_build_object('duplicado', true, 'resultado', 'pago_ya_registrado', 'pago_id', v_pago);
  end if;

  if p_obligacion is not null then
    begin
      perform privado.imputar_interno(v_pago, p_obligacion, p_importe, null);
    exception when sqlstate 'P0001' then
      -- El cobro es real aunque no pueda imputarse: queda como saldo a favor
      -- para conciliación manual.
      update public.eventos_pasarela set resultado = 'acreditado_sin_imputar' where id = v_evento;
    end;
  end if;
  update public.eventos_pasarela
     set procesado_en = now(), resultado = coalesce(resultado, 'acreditado'), pago_id = v_pago
   where id = v_evento;
  return jsonb_build_object('duplicado', false, 'resultado', 'acreditado', 'pago_id', v_pago);
end;
$$;

-- ---------------------------------------------------------------------
-- Comunicaciones
-- ---------------------------------------------------------------------
create or replace function privado.enviar_comunicacion(p_comunicacion uuid, p_destinatarios uuid[] default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  c public.comunicaciones;
  v_gestion boolean := privado.es_gestion();
  v_n int;
begin
  select * into c from public.comunicaciones where id = p_comunicacion for update;
  if not found then raise exception 'NO_ENCONTRADO' using errcode = 'P0002'; end if;
  perform privado.exigir(c.autor_cuenta_id = (select auth.uid()));
  if c.estado = 'enviada' then
    return (select count(*) from public.comunicacion_envios e
             where e.comunicacion_id = p_comunicacion and e.canal = 'interno');
  end if;

  if not v_gestion then
    -- Docentes: solo sus comisiones, nunca temas económicos ni avisos institucionales.
    perform privado.exigir(privado.tiene_rol('docente') and c.categoria <> 'economica'
                           and c.tipo <> 'institucional', 'NO_AUTORIZADO: alcance del aviso');
    if c.tipo = 'comision' then
      perform privado.exigir(privado.es_docente_de_comision(c.comision_id), 'NO_AUTORIZADO: comisión ajena');
    end if;
  end if;

  create temp table if not exists _dest (persona_id uuid, estudiante_id uuid) on commit drop;
  truncate _dest;

  if c.tipo = 'individual' then
    if p_destinatarios is null or cardinality(p_destinatarios) = 0 then
      raise exception 'SIN_DESTINATARIOS' using errcode = 'P0001';
    end if;
    insert into _dest (persona_id) select distinct unnest(p_destinatarios);
    if not v_gestion and exists (
      -- Cada destinatario debe ser estudiante o responsable académico de un
      -- estudiante de las comisiones del docente.
      select 1 from _dest d where not exists (
        select 1 from public.estudiantes e
        where privado.es_docente_del_estudiante(e.id)
          and (e.persona_id = d.persona_id or exists (
            select 1 from public.vinculos_responsables v
            where v.estudiante_id = e.id and v.responsable_persona_id = d.persona_id
              and v.estado = 'verificado' and v.permiso_academico))
      )
    ) then
      raise exception 'NO_AUTORIZADO: destinatario fuera de tus comisiones' using errcode = '42501';
    end if;
    if c.categoria = 'economica' and exists (
      select 1 from _dest d where not exists (
        select 1 from public.matriculas_pago mp where mp.responsable_pago_persona_id = d.persona_id
        union all
        select 1 from public.vinculos_responsables v
        where v.responsable_persona_id = d.persona_id and v.estado = 'verificado' and v.permiso_economico
      )
    ) then
      raise exception 'DESTINATARIO_NO_ECONOMICO: los avisos económicos van al responsable de pago' using errcode = 'P0001';
    end if;
  else
    -- Por comisión o institucional: estudiantes con matrícula activa y sus
    -- responsables según la categoría del aviso.
    insert into _dest (persona_id, estudiante_id)
    select distinct x.persona_id, x.estudiante_id from (
      select e.persona_id, e.id as estudiante_id
      from public.matriculas m join public.estudiantes e on e.id = m.estudiante_id
      where m.estado = 'activa' and (c.tipo = 'institucional' or m.comision_id = c.comision_id)
        and c.categoria <> 'economica'
      union all
      select v.responsable_persona_id, v.estudiante_id
      from public.matriculas m join public.vinculos_responsables v on v.estudiante_id = m.estudiante_id
      where m.estado = 'activa' and (c.tipo = 'institucional' or m.comision_id = c.comision_id)
        and v.estado = 'verificado'
        and case when c.categoria = 'economica' then v.permiso_economico else v.permiso_academico end
      union all
      select mp.responsable_pago_persona_id, m.estudiante_id
      from public.matriculas m join public.matriculas_pago mp on mp.matricula_id = m.id
      where m.estado = 'activa' and (c.tipo = 'institucional' or m.comision_id = c.comision_id)
        and c.categoria = 'economica'
    ) x;
  end if;

  -- Aviso interno: siempre. Correo: si hay dirección y la persona no lo desactivó.
  insert into public.comunicacion_envios (comunicacion_id, destinatario_persona_id, estudiante_id, canal, estado, enviado_en)
  select distinct on (d.persona_id) p_comunicacion, d.persona_id, d.estudiante_id, 'interno', 'enviado', now()
  from _dest d order by d.persona_id
  on conflict (comunicacion_id, destinatario_persona_id, canal) do nothing;

  insert into public.comunicacion_envios (comunicacion_id, destinatario_persona_id, estudiante_id, canal, estado, proximo_intento_en)
  select distinct on (d.persona_id) p_comunicacion, d.persona_id, d.estudiante_id, 'email', 'pendiente', now()
  from _dest d
  join public.personas_datos pd on pd.persona_id = d.persona_id and pd.email is not null
  where not exists (
    select 1 from public.preferencias_notificacion pn
    where pn.persona_id = d.persona_id and pn.canal = 'email' and pn.categoria = c.categoria and not pn.habilitado)
  order by d.persona_id
  on conflict (comunicacion_id, destinatario_persona_id, canal) do nothing;

  update public.comunicaciones set estado = 'enviada', enviada_en = now() where id = p_comunicacion;
  select count(*) into v_n from public.comunicacion_envios e
   where e.comunicacion_id = p_comunicacion and e.canal = 'interno';
  return v_n;
end;
$$;

create or replace function privado.marcar_leida(p_envio uuid)
returns void language sql security definer set search_path = '' as $$
  update public.comunicacion_envios
     set estado = 'leido', leido_en = coalesce(leido_en, now())
   where id = p_envio and canal = 'interno'
     and destinatario_persona_id = privado.persona_actual();
$$;

create or replace function public.enviar_comunicacion(p_comunicacion uuid, p_destinatarios uuid[] default null)
returns int language sql security invoker set search_path = '' as $$ select privado.enviar_comunicacion(p_comunicacion, p_destinatarios); $$;
create or replace function public.marcar_leida(p_envio uuid)
returns void language sql security invoker set search_path = '' as $$ select privado.marcar_leida(p_envio); $$;

-- ---------------------------------------------------------------------
-- Oferta pública para la landing (datos mínimos, sin personas)
-- ---------------------------------------------------------------------
create or replace function privado.oferta_publicada()
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(curso order by (curso ->> 'orden')::int, curso ->> 'nombre'), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'id', c.id, 'slug', c.slug, 'nombre', c.nombre, 'descripcion', c.descripcion,
      'publico', c.publico, 'edad_minima', c.edad_minima, 'edad_maxima', c.edad_maxima,
      'modalidad', c.modalidad, 'orden', c.orden,
      'comisiones', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', k.id, 'nombre', k.nombre, 'nivel', n.nombre, 'modalidad', k.modalidad,
          'fecha_inicio', k.fecha_inicio,
          -- Solo se publica si hay lugar, nunca cuántos inscriptos hay.
          'hay_vacantes', privado.ocupacion_comision(k.id) < k.cupo,
          'horarios', coalesce((
            select jsonb_agg(jsonb_build_object(
              'dia_semana', h.dia_semana, 'hora_inicio', to_char(h.hora_inicio, 'HH24:MI'),
              'hora_fin', to_char(h.hora_fin, 'HH24:MI')) order by h.dia_semana, h.hora_inicio)
            from public.comision_horarios h where h.comision_id = k.id), '[]'::jsonb)
        ) order by n.orden, k.nombre)
        from public.comisiones k join public.niveles n on n.id = k.nivel_id
        where k.curso_id = c.id and k.publicada and k.estado in ('abierta', 'en_curso')
      ), '[]'::jsonb)
    ) as curso
    from public.cursos c where c.publicado and c.activo
  ) t;
$$;

create or replace function public.oferta_publicada()
returns jsonb language sql stable security invoker set search_path = '' as $$ select privado.oferta_publicada(); $$;

-- ---------------------------------------------------------------------
-- Ayuda contextual: búsqueda sobre documentación aprobada.
-- SECURITY INVOKER: la RLS de documentos_ayuda filtra por audiencia ANTES
-- de que el texto llegue al asistente.
-- ---------------------------------------------------------------------
create or replace function public.buscar_ayuda(p_consulta text, p_limite int default 4)
returns table (id uuid, slug text, titulo text, fragmento text, relevancia real)
language sql stable security invoker set search_path = '' as $$
  select d.id, d.slug, d.titulo,
         ts_headline('spanish'::regconfig, d.contenido, q, 'MaxWords=60, MinWords=25, StartSel=«, StopSel=»'),
         ts_rank(d.busqueda, q)
  from public.documentos_ayuda d,
       websearch_to_tsquery('spanish'::regconfig, left(coalesce(p_consulta, ''), 300)) q
  where d.busqueda @@ q
  order by ts_rank(d.busqueda, q) desc
  limit least(greatest(coalesce(p_limite, 4), 1), 8);
$$;

-- Cuenta una consulta al asistente si no se superó el límite diario. El
-- límite sale de la tabla (el mayor entre los perfiles de la cuenta): el
-- cliente no puede elegirlo.
create or replace function privado.registrar_uso_asistente()
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_limite int;
  v_n int;
begin
  perform privado.exigir(privado.persona_actual() is not null);
  select coalesce(max(l.consultas_diarias), 0) into v_limite
    from public.asistente_limites l where l.perfil = any (privado.perfiles_actuales());
  if v_limite <= 0 then return false; end if;
  insert into public.asistente_uso (cuenta_id, dia, consultas)
  values ((select auth.uid()), privado.hoy(), 1)
  on conflict (cuenta_id, dia) do update set consultas = public.asistente_uso.consultas + 1
    where public.asistente_uso.consultas < v_limite
  returning consultas into v_n;
  return v_n is not null;
end;
$$;
create or replace function public.registrar_uso_asistente()
returns boolean language sql security invoker set search_path = '' as $$ select privado.registrar_uso_asistente(); $$;

-- ---------------------------------------------------------------------
-- Tablero de dirección (informe de gestión, no contable).
-- Fórmulas documentadas en docs/06-indicadores.md.
-- ---------------------------------------------------------------------
create or replace function privado.tablero_direccion(p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_hoy date := privado.hoy();
  v_cobros numeric; v_devoluciones numeric; v_gastos numeric; v_docentes numeric;
  v_devengado numeric; v_pendiente numeric; v_vencido numeric;
  v_consultas int; v_ganadas int;
  v_ocupacion jsonb;
begin
  perform privado.exigir(privado.es_direccion());
  if p_desde is null or p_hasta is null or p_hasta < p_desde then
    raise exception 'PERIODO_INVALIDO' using errcode = 'P0001';
  end if;

  -- CAJA: pagos confirmados por fecha de pago (los reversados no cuentan).
  select coalesce(sum(importe), 0) into v_cobros from public.pagos
   where estado = 'confirmado' and fecha_pago between p_desde and p_hasta;
  select coalesce(sum(importe), 0) into v_devoluciones from public.ajustes
   where tipo = 'devolucion' and fecha between p_desde and p_hasta;
  select coalesce(sum(importe), 0) into v_gastos from public.gastos
   where anulado_en is null and fecha between p_desde and p_hasta;
  select coalesce(sum(importe), 0) into v_docentes from public.pagos_docentes
   where anulado_en is null and fecha_pago between p_desde and p_hasta;

  -- DEVENGADO: obligaciones no anuladas con vencimiento en el período, netas de descuentos.
  select coalesce(sum(importe), 0) into v_devengado from public.obligaciones
   where estado <> 'anulada' and vencimiento between p_desde and p_hasta;

  -- SALDOS a hoy (no dependen del período).
  select coalesce(sum(s.saldo), 0), coalesce(sum(s.saldo) filter (where s.vencimiento < v_hoy), 0)
    into v_pendiente, v_vencido
    from public.obligaciones_saldo s where s.estado in ('pendiente', 'parcial');

  select count(*), count(*) filter (where estado = 'ganada') into v_consultas, v_ganadas
    from public.consultas where (creada_en at time zone 'America/Argentina/Tucuman')::date between p_desde and p_hasta;

  select coalesce(jsonb_agg(jsonb_build_object(
           'comision_id', k.id, 'comision', k.nombre, 'cupo', k.cupo,
           'inscriptos', (select count(*) from public.matriculas m where m.comision_id = k.id and m.estado = 'activa')
         ) order by k.nombre), '[]'::jsonb)
    into v_ocupacion
    from public.comisiones k where k.estado in ('abierta', 'en_curso');

  return jsonb_build_object(
    'periodo', jsonb_build_object('desde', p_desde, 'hasta', p_hasta),
    'moneda', 'ARS',
    'caja', jsonb_build_object(
      'cobros', v_cobros, 'devoluciones', v_devoluciones, 'gastos', v_gastos,
      'pagos_docentes', v_docentes,
      'flujo_neto', v_cobros - v_devoluciones - v_gastos - v_docentes),
    'devengado', jsonb_build_object('obligaciones_del_periodo', v_devengado),
    'saldos_a_hoy', jsonb_build_object('pendiente', v_pendiente, 'vencido', v_vencido),
    'captacion', jsonb_build_object(
      'consultas', v_consultas, 'ganadas', v_ganadas,
      -- null = sin datos suficientes (no se muestra 0 %).
      'conversion', case when v_consultas > 0 then round(v_ganadas::numeric / v_consultas, 4) end),
    'ocupacion', v_ocupacion
  );
end;
$$;

create or replace function public.tablero_direccion(p_desde date, p_hasta date)
returns jsonb language sql stable security invoker set search_path = '' as $$ select privado.tablero_direccion(p_desde, p_hasta); $$;

-- Ocupación por comisión para pantallas de gestión y docentes (respeta RLS).
create view public.comisiones_ocupacion with (security_invoker = true) as
select k.id as comision_id, k.cupo,
       (select count(*) from public.matriculas m where m.comision_id = k.id and m.estado = 'activa')::int as inscriptos,
       (select count(*) from public.reservas_vacante r
         where r.comision_id = k.id and r.estado = 'vigente' and r.vence_en > now())::int as reservas
from public.comisiones k;
