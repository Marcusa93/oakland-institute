-- =====================================================================
-- Importación: hermanos con el mismo responsable
--
-- Si el responsable de una fila ya está cargado (mismo documento, o mismo
-- email cuando no hay documento), se lo vincula en lugar de crear otra
-- persona. Así dos hermanos de la planilla quedan con la misma madre.
-- =====================================================================

create or replace function privado.importar_estudiante(p_fila jsonb, p_verificar boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_alta jsonb;
  v_estudiante uuid;
  v_persona uuid;
  v_responsable uuid;
  v_vinculo uuid;
  v_deuda numeric;
  v_concepto uuid;
  v_doc text := nullif(btrim(coalesce(p_fila ->> 'resp_documento', '')), '');
  v_email text := lower(nullif(btrim(coalesce(p_fila ->> 'resp_email', '')), ''));
  v_resp jsonb;
begin
  perform privado.exigir(privado.es_gestion());
  v_alta := privado.alta_estudiante(p_fila ->> 'nombres', p_fila ->> 'apellidos',
    p_fila ->> 'tipo_documento', p_fila ->> 'documento', nullif(p_fila ->> 'fecha_nacimiento', '')::date,
    p_fila ->> 'email', p_fila ->> 'telefono', null);
  v_estudiante := (v_alta ->> 'estudiante_id')::uuid;
  v_persona := (v_alta ->> 'persona_id')::uuid;

  if nullif(btrim(coalesce(p_fila ->> 'resp_apellidos', '')), '') is not null then
    -- ¿Ya está cargado? Primero por documento; sin documento, por email (si hay uno solo).
    if v_doc is not null then
      select d.persona_id into v_responsable
        from public.personas_datos d join public.personas p on p.id = d.persona_id and p.eliminada_en is null
       where d.numero_documento = v_doc
       limit 1;
    elsif v_email is not null then
      select min(d.persona_id::text)::uuid into v_responsable
        from public.personas_datos d join public.personas p on p.id = d.persona_id and p.eliminada_en is null
       where lower(d.email) = v_email
      having count(*) = 1;
    end if;

    if v_responsable is not null then
      v_vinculo := privado.invitar_responsable(v_estudiante, v_responsable,
        nullif(btrim(coalesce(p_fila ->> 'resp_parentesco', '')), ''));
    else
      v_resp := privado.alta_responsable(v_estudiante, p_fila ->> 'resp_nombres', p_fila ->> 'resp_apellidos',
        p_fila ->> 'resp_tipo_documento', v_doc, v_email, p_fila ->> 'resp_telefono', p_fila ->> 'resp_parentesco');
      v_responsable := (v_resp ->> 'persona_id')::uuid;
      v_vinculo := (v_resp ->> 'vinculo_id')::uuid;
    end if;
    if p_verificar then
      perform privado.verificar_vinculo(v_vinculo, true, true, true, true, true);
    end if;
  end if;

  v_deuda := nullif(p_fila ->> 'deuda', '')::numeric;
  if v_deuda is not null and v_deuda > 0 then
    select id into v_concepto from public.conceptos where codigo = 'SALDO-ANTERIOR';
    perform privado.crear_obligacion(v_estudiante, coalesce(v_responsable, v_persona), v_concepto,
      coalesce(nullif(btrim(coalesce(p_fila ->> 'deuda_detalle', '')), ''), 'Saldo anterior al sistema'),
      round(v_deuda, 2), privado.hoy(), null);
  end if;

  if (p_fila ->> 'estado') in ('aspirante', 'activo', 'inactivo', 'egresado') then
    update public.estudiantes set estado = (p_fila ->> 'estado')::public.estado_estudiante where id = v_estudiante;
  end if;

  return v_alta || jsonb_build_object('responsable_id', v_responsable);
end;
$$;
