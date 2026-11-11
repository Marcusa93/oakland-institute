-- =====================================================================
-- 13 · Notas no publicadas fuera de informes y de la vista del estudiante
-- 1. datos_informe solo incluye notas publicadas: un informe enviado a la
--    familia no puede adelantar una nota que el docente todavía no publicó.
-- 2. entregas_de_estudiante: una corrección sin publicar se ve como
--    "entregada" (antes decía "corregida" con la nota vacía).
-- =====================================================================

create or replace function privado.entregas_de_estudiante(p_estudiante uuid)
returns table (
  actividad_id uuid, titulo text, habilidad public.habilidad, evaluacion public.tipo_evaluacion,
  cierra_en timestamptz, comision text, estado text, entregada_en timestamptz,
  nota numeric, puntaje_max numeric, devolucion text, reaccion text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.titulo, a.habilidad, a.evaluacion, a.cierra_en, k.nombre,
         case when e.id is null then 'pendiente'
              when e.publicada then 'corregida'
              when e.estado = 'corregida' then 'entregada'
              else e.estado::text end,
         e.entregada_en,
         case when e.publicada then e.nota end, a.puntaje_max,
         case when e.publicada then e.devolucion end,
         case when e.publicada then e.reaccion end
  from public.matriculas m
  join public.actividades a on a.comision_id = m.comision_id and a.estado <> 'borrador'
  join public.comisiones k on k.id = m.comision_id
  left join public.entregas e on e.actividad_id = a.id and e.matricula_id = m.id
  where m.estudiante_id = p_estudiante and m.estado = 'activa'
    and (privado.es_el_estudiante(p_estudiante) or privado.es_responsable_de(p_estudiante, 'academico'))
  order by coalesce(a.cierra_en, a.creada_en) desc;
$$;

create or replace function privado.datos_informe(p_estudiante uuid, p_desde date, p_hasta date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform privado.exigir(privado.es_gestion() or privado.es_docente_del_estudiante(p_estudiante));
  return jsonb_build_object(
    'periodo', jsonb_build_object('desde', p_desde, 'hasta', p_hasta),
    'estudiante', (select jsonb_build_object('nombre', p.nombres || ' ' || p.apellidos, 'legajo', e.legajo)
                   from public.estudiantes e join public.personas p on p.id = e.persona_id where e.id = p_estudiante),
    'comisiones', (select coalesce(jsonb_agg(jsonb_build_object('comision', k.nombre, 'nivel', n.nombre)), '[]')
                   from public.matriculas m join public.comisiones k on k.id = m.comision_id join public.niveles n on n.id = k.nivel_id
                   where m.estudiante_id = p_estudiante and m.estado = 'activa'),
    'asistencia', (select jsonb_build_object(
                     'clases', count(*),
                     'presente', count(*) filter (where a.estado = 'presente'),
                     'tarde', count(*) filter (where a.estado = 'tarde'),
                     'ausente', count(*) filter (where a.estado = 'ausente'),
                     'justificada', count(*) filter (where a.estado = 'justificada'),
                     'porcentaje', case when count(*) > 0 then round(100.0 * count(*) filter (where a.estado in ('presente', 'tarde')) / count(*)) end)
                   from public.asistencias a join public.clases c on c.id = a.clase_id join public.matriculas m on m.id = a.matricula_id
                   where m.estudiante_id = p_estudiante and c.fecha between p_desde and p_hasta),
    'actividades', (select coalesce(jsonb_agg(jsonb_build_object(
                       'titulo', a.titulo, 'habilidad', a.habilidad, 'evaluacion', a.evaluacion,
                       'estado', case when e.id is null then 'sin entregar'
                                      when e.publicada then 'corregida'
                                      else 'entregada' end,
                       'nota', case when e.publicada then e.nota end,
                       'puntaje_max', a.puntaje_max)
                       order by a.cierra_en nulls last), '[]')
                    from public.matriculas m join public.actividades a on a.comision_id = m.comision_id and a.estado <> 'borrador'
                    left join public.entregas e on e.actividad_id = a.id and e.matricula_id = m.id
                    where m.estudiante_id = p_estudiante and (a.creada_en::date between p_desde and p_hasta)),
    'practica', (select jsonb_build_object(
                    'xp', coalesce(sum(i.xp), 0),
                    'ejercicios', count(*),
                    'aciertos', count(*) filter (where i.correcta),
                    'dias', count(distinct (i.respondido_en at time zone 'America/Argentina/Tucuman')::date))
                 from public.practica_intentos i
                 where i.estudiante_id = p_estudiante and (i.respondido_en at time zone 'America/Argentina/Tucuman')::date between p_desde and p_hasta),
    'medallas', (select coalesce(jsonb_agg(m.nombre order by m.orden), '[]')
                 from public.medallas_obtenidas o join public.medallas m on m.codigo = o.medalla where o.estudiante_id = p_estudiante),
    'alertas_abiertas', (select coalesce(jsonb_agg(jsonb_build_object('tipo', a.tipo, 'detalle', a.detalle)), '[]')
                         from public.alertas a where a.estudiante_id = p_estudiante and a.estado <> 'resuelta')
  );
end;
$$;
