-- =====================================================================
-- 14 · Speaking con audio y resumen semanal para familias
-- 1. Bucket privado `audios`:
--      entregas/{actividad}/{matricula}/{archivo}  → grabación del estudiante
--      devoluciones/{entrega}/{archivo}            → devolución hablada del docente
--    Las rutas las genera la base (validando permisos y plazos); el servidor
--    firma la subida para esa ruta exacta. Escuchar exige la política de
--    lectura: el propio estudiante, su familia con permiso académico, el
--    docente de la comisión y gestión. La devolución del docente se oye
--    recién cuando la corrección está publicada.
-- 2. Actividades de habla: la entrega necesita una grabación.
-- 3. resumen_semanal: asistencia, entregas, notas, práctica y medallas de
--    una semana, para el estudiante, su familia, sus docentes y gestión.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('audios', 'audios', false, 10485760,
        array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/aac', 'audio/x-m4a'])
on conflict (id) do nothing;

alter table public.entregas
  add column audio_ruta text,
  add column audio_segundos int check (audio_segundos is null or audio_segundos between 1 and 600),
  add column devolucion_audio text;

-- ---------------------------------------------------------------------
-- Rutas de subida
-- ---------------------------------------------------------------------
create or replace function privado.extension_audio(p_extension text)
returns text language sql immutable set search_path = '' as $$
  select case when lower(p_extension) in ('webm', 'ogg', 'm4a', 'mp4', 'mp3', 'wav', 'aac') then lower(p_extension) end;
$$;

create or replace function privado.ruta_audio_entrega(p_actividad uuid, p_extension text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  a public.actividades;
  v_matricula uuid;
  v_ext text := privado.extension_audio(p_extension);
begin
  if v_ext is null then raise exception 'AUDIO_INVALIDO' using errcode = 'P0001'; end if;
  select * into a from public.actividades where id = p_actividad;
  if not found or a.estado <> 'publicada' then
    raise exception 'ACTIVIDAD_NO_DISPONIBLE' using errcode = 'P0001';
  end if;
  select m.id into v_matricula from public.matriculas m
   where m.comision_id = a.comision_id and m.estado = 'activa' and m.estudiante_id = privado.estudiante_actual();
  perform privado.exigir(v_matricula is not null);
  if a.abre_en > now() or (a.cierra_en is not null and a.cierra_en <= now()) then
    raise exception 'FUERA_DE_PLAZO' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.entregas e where e.actividad_id = a.id and e.matricula_id = v_matricula and e.estado = 'corregida') then
    raise exception 'YA_CORREGIDA' using errcode = 'P0001';
  end if;
  return format('entregas/%s/%s/%s.%s', a.id, v_matricula, gen_random_uuid(), v_ext);
end;
$$;

create or replace function privado.ruta_audio_devolucion(p_entrega uuid, p_extension text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_comision uuid;
  v_ext text := privado.extension_audio(p_extension);
begin
  if v_ext is null then raise exception 'AUDIO_INVALIDO' using errcode = 'P0001'; end if;
  select a.comision_id into v_comision
    from public.entregas e join public.actividades a on a.id = e.actividad_id where e.id = p_entrega;
  if not found then raise exception 'NO_ENCONTRADO' using errcode = 'P0002'; end if;
  perform privado.exigir(privado.es_gestion() or privado.es_docente_de_comision(v_comision));
  return format('devoluciones/%s/%s.%s', p_entrega, gen_random_uuid(), v_ext);
end;
$$;

create or replace function privado.audio_existe(p_ruta text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from storage.objects o where o.bucket_id = 'audios' and o.name = p_ruta);
$$;

-- ¿La cuenta actual puede escuchar este audio?
create or replace function privado.puede_ver_audio(p_ruta text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare
  v_tipo text := split_part(p_ruta, '/', 1);
  v_id uuid;
  v_estudiante uuid;
  v_comision uuid;
  v_publicada boolean;
begin
  if v_tipo = 'entregas' then
    begin
      v_id := split_part(p_ruta, '/', 3)::uuid;
    exception when invalid_text_representation then return false;
    end;
    select m.estudiante_id, m.comision_id into v_estudiante, v_comision from public.matriculas m where m.id = v_id;
    if not found then return false; end if;
    -- La actividad del camino tiene que ser de esa comisión.
    if not exists (select 1 from public.actividades a
                    where a.id::text = split_part(p_ruta, '/', 2) and a.comision_id = v_comision) then
      return false;
    end if;
    return privado.es_gestion() or privado.es_docente_de_comision(v_comision)
        or privado.es_el_estudiante(v_estudiante) or privado.es_responsable_de(v_estudiante, 'academico');
  elsif v_tipo = 'devoluciones' then
    begin
      v_id := split_part(p_ruta, '/', 2)::uuid;
    exception when invalid_text_representation then return false;
    end;
    select m.estudiante_id, a.comision_id, e.publicada into v_estudiante, v_comision, v_publicada
      from public.entregas e join public.matriculas m on m.id = e.matricula_id
      join public.actividades a on a.id = e.actividad_id where e.id = v_id;
    if not found then return false; end if;
    return privado.es_gestion() or privado.es_docente_de_comision(v_comision)
        or (v_publicada and (privado.es_el_estudiante(v_estudiante) or privado.es_responsable_de(v_estudiante, 'academico')));
  end if;
  return false;
end;
$$;

create policy audios_escuchar on storage.objects for select to authenticated using (
  bucket_id = 'audios' and privado.puede_ver_audio(name)
);

-- ---------------------------------------------------------------------
-- Entregar con audio
-- ---------------------------------------------------------------------
drop function public.entregar_actividad(uuid, jsonb, text);
drop function privado.entregar_actividad(uuid, jsonb, text);

create or replace function privado.entregar_actividad(
  p_actividad uuid, p_respuestas jsonb, p_texto text, p_audio text, p_audio_segundos int)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.actividades;
  v_matricula uuid;
  v_auto numeric := 0;
  v_total numeric := 0;
  v_previa public.entregas;
  v_audio text;
  v_segundos int;
begin
  select * into a from public.actividades where id = p_actividad;
  if not found or a.estado <> 'publicada' then
    raise exception 'ACTIVIDAD_NO_DISPONIBLE' using errcode = 'P0001';
  end if;
  select m.id into v_matricula from public.matriculas m
   where m.comision_id = a.comision_id and m.estado = 'activa' and m.estudiante_id = privado.estudiante_actual();
  perform privado.exigir(v_matricula is not null);
  if a.abre_en > now() or (a.cierra_en is not null and a.cierra_en <= now()) then
    raise exception 'FUERA_DE_PLAZO' using errcode = 'P0001';
  end if;
  select * into v_previa from public.entregas where actividad_id = p_actividad and matricula_id = v_matricula for update;
  if found and v_previa.estado = 'corregida' then
    raise exception 'YA_CORREGIDA' using errcode = 'P0001';
  end if;

  if p_audio is not null then
    if p_audio not like format('entregas/%s/%s/%%', a.id, v_matricula) or not privado.audio_existe(p_audio) then
      raise exception 'AUDIO_INVALIDO' using errcode = 'P0001';
    end if;
    v_audio := p_audio;
    v_segundos := least(greatest(coalesce(p_audio_segundos, 1), 1), 600);
  else
    -- Una reentrega sin grabación nueva conserva la anterior.
    v_audio := v_previa.audio_ruta;
    v_segundos := v_previa.audio_segundos;
  end if;
  if a.habilidad = 'habla' and v_audio is null then
    raise exception 'FALTA_AUDIO' using errcode = 'P0001';
  end if;

  select coalesce(sum(p.puntaje) filter (where (coalesce(p_respuestas, '{}'::jsonb) ->> p.id::text) = k.correcta::text), 0),
         coalesce(sum(p.puntaje), 0)
    into v_auto, v_total
    from public.actividad_preguntas p join public.actividad_claves k on k.pregunta_id = p.id
   where p.actividad_id = p_actividad and p.tipo = 'opcion';

  insert into public.entregas (actividad_id, matricula_id, estado, respuestas, texto, entregada_en, puntaje_auto, audio_ruta, audio_segundos)
  values (p_actividad, v_matricula, 'entregada', coalesce(p_respuestas, '{}'::jsonb), p_texto, now(), v_auto, v_audio, v_segundos)
  on conflict (actividad_id, matricula_id) do update
    set estado = 'entregada', respuestas = excluded.respuestas, texto = excluded.texto,
        entregada_en = now(), puntaje_auto = excluded.puntaje_auto,
        audio_ruta = excluded.audio_ruta, audio_segundos = excluded.audio_segundos;

  return jsonb_build_object(
    'entregada', true,
    'aciertos', case when a.evaluacion <> 'acreditante' then v_auto end,
    'total_objetivo', case when a.evaluacion <> 'acreditante' then v_total end);
end;
$$;

create or replace function public.entregar_actividad(
  p_actividad uuid, p_respuestas jsonb, p_texto text default null, p_audio text default null, p_audio_segundos int default null)
returns jsonb language sql security invoker set search_path = '' as $$
  select privado.entregar_actividad(p_actividad, p_respuestas, p_texto, p_audio, p_audio_segundos);
$$;

-- ---------------------------------------------------------------------
-- Corregir con devolución hablada
-- ---------------------------------------------------------------------
drop function public.corregir_entrega(uuid, numeric, text, text, boolean);
drop function privado.corregir_entrega(uuid, numeric, text, text, boolean);

create or replace function privado.corregir_entrega(
  p_entrega uuid, p_nota numeric, p_devolucion text, p_reaccion text, p_publicar boolean,
  p_audio text, p_quitar_audio boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
  e public.entregas;
  a public.actividades;
begin
  select * into e from public.entregas where id = p_entrega for update;
  if not found then raise exception 'NO_ENCONTRADO' using errcode = 'P0002'; end if;
  select * into a from public.actividades where id = e.actividad_id;
  perform privado.exigir(privado.es_gestion() or privado.es_docente_de_comision(a.comision_id));
  if p_nota is not null and (p_nota < 0 or p_nota > a.puntaje_max) then
    raise exception 'NOTA_FUERA_DE_RANGO: entre 0 y %', a.puntaje_max using errcode = 'P0001';
  end if;
  if p_audio is not null and (p_audio not like format('devoluciones/%s/%%', e.id) or not privado.audio_existe(p_audio)) then
    raise exception 'AUDIO_INVALIDO' using errcode = 'P0001';
  end if;
  update public.entregas
     set nota = p_nota, devolucion = nullif(btrim(coalesce(p_devolucion, '')), ''), reaccion = p_reaccion,
         estado = 'corregida', corregida_por = (select auth.uid()), corregida_en = now(),
         publicada = coalesce(p_publicar, false),
         devolucion_audio = case when coalesce(p_quitar_audio, false) then null else coalesce(p_audio, devolucion_audio) end
   where id = p_entrega;
end;
$$;

create or replace function public.corregir_entrega(
  p_entrega uuid, p_nota numeric, p_devolucion text, p_reaccion text default null, p_publicar boolean default true,
  p_audio text default null, p_quitar_audio boolean default false)
returns void language sql security invoker set search_path = '' as $$
  select privado.corregir_entrega(p_entrega, p_nota, p_devolucion, p_reaccion, p_publicar, p_audio, p_quitar_audio);
$$;

-- ---------------------------------------------------------------------
-- Lo que ve el estudiante y su familia: con audios
-- ---------------------------------------------------------------------
drop function public.entregas_de_estudiante(uuid);
drop function privado.entregas_de_estudiante(uuid);

create or replace function privado.entregas_de_estudiante(p_estudiante uuid)
returns table (
  actividad_id uuid, titulo text, habilidad public.habilidad, evaluacion public.tipo_evaluacion,
  cierra_en timestamptz, comision text, estado text, entregada_en timestamptz,
  nota numeric, puntaje_max numeric, devolucion text, reaccion text,
  audio_ruta text, audio_segundos int, devolucion_audio text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.titulo, a.habilidad, a.evaluacion, a.cierra_en, k.nombre,
         case when e.id is null then 'pendiente'
              when e.publicada then 'corregida'
              when e.estado = 'corregida' then 'entregada'
              else e.estado::text end,
         e.entregada_en,
         case when e.publicada then e.nota end, a.puntaje_max,
         case when e.publicada then e.devolucion end,
         case when e.publicada then e.reaccion end,
         e.audio_ruta, e.audio_segundos,
         case when e.publicada then e.devolucion_audio end
  from public.matriculas m
  join public.actividades a on a.comision_id = m.comision_id and a.estado <> 'borrador'
  join public.comisiones k on k.id = m.comision_id
  left join public.entregas e on e.actividad_id = a.id and e.matricula_id = m.id
  where m.estudiante_id = p_estudiante and m.estado = 'activa'
    and (privado.es_el_estudiante(p_estudiante) or privado.es_responsable_de(p_estudiante, 'academico'))
  order by coalesce(a.cierra_en, a.creada_en) desc;
$$;

create or replace function public.entregas_de_estudiante(p_estudiante uuid)
returns table (actividad_id uuid, titulo text, habilidad public.habilidad, evaluacion public.tipo_evaluacion,
  cierra_en timestamptz, comision text, estado text, entregada_en timestamptz,
  nota numeric, puntaje_max numeric, devolucion text, reaccion text,
  audio_ruta text, audio_segundos int, devolucion_audio text)
language sql stable security invoker set search_path = '' as $$ select * from privado.entregas_de_estudiante(p_estudiante); $$;

-- ---------------------------------------------------------------------
-- Resumen semanal
-- ---------------------------------------------------------------------
create or replace function privado.resumen_semanal(p_estudiante uuid, p_desde date)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_desde date := date_trunc('week', coalesce(p_desde, privado.hoy()))::date;
  v_hasta date := v_desde + 6;
  v_ini timestamptz;
  v_fin timestamptz;
begin
  perform privado.exigir(privado.es_el_estudiante(p_estudiante) or privado.es_responsable_de(p_estudiante, 'academico')
                         or privado.es_gestion() or privado.es_docente_del_estudiante(p_estudiante));
  v_ini := v_desde::timestamp at time zone 'America/Argentina/Tucuman';
  v_fin := (v_hasta + 1)::timestamp at time zone 'America/Argentina/Tucuman';

  return jsonb_build_object(
    'desde', v_desde, 'hasta', v_hasta,
    'asistencia', (select jsonb_build_object(
                     'clases', count(*),
                     'presente', count(*) filter (where a.estado = 'presente'),
                     'tarde', count(*) filter (where a.estado = 'tarde'),
                     'ausente', count(*) filter (where a.estado = 'ausente'),
                     'justificada', count(*) filter (where a.estado = 'justificada'))
                   from public.asistencias a join public.clases c on c.id = a.clase_id join public.matriculas m on m.id = a.matricula_id
                   where m.estudiante_id = p_estudiante and c.fecha between v_desde and v_hasta),
    'entregadas', (select count(*) from public.entregas e join public.matriculas m on m.id = e.matricula_id
                   where m.estudiante_id = p_estudiante and e.estado <> 'en_curso' and e.entregada_en >= v_ini and e.entregada_en < v_fin),
    'notas', (select coalesce(jsonb_agg(jsonb_build_object('titulo', a.titulo, 'nota', e.nota, 'puntaje_max', a.puntaje_max, 'reaccion', e.reaccion)
                                        order by e.corregida_en), '[]')
              from public.entregas e join public.matriculas m on m.id = e.matricula_id join public.actividades a on a.id = e.actividad_id
              where m.estudiante_id = p_estudiante and e.publicada and e.corregida_en >= v_ini and e.corregida_en < v_fin),
    'sin_entregar', (select coalesce(jsonb_agg(jsonb_build_object('titulo', a.titulo, 'cierra_en', a.cierra_en) order by a.cierra_en), '[]')
                     from public.matriculas m join public.actividades a on a.comision_id = m.comision_id and a.estado <> 'borrador'
                     left join public.entregas e on e.actividad_id = a.id and e.matricula_id = m.id and e.estado <> 'en_curso'
                     where m.estudiante_id = p_estudiante and m.estado = 'activa' and e.id is null
                       and a.cierra_en >= v_ini and a.cierra_en < least(v_fin, now())),
    'proximas', (select coalesce(jsonb_agg(jsonb_build_object('titulo', a.titulo, 'cierra_en', a.cierra_en) order by a.cierra_en), '[]')
                 from public.matriculas m join public.actividades a on a.comision_id = m.comision_id and a.estado = 'publicada'
                 left join public.entregas e on e.actividad_id = a.id and e.matricula_id = m.id and e.estado <> 'en_curso'
                 where m.estudiante_id = p_estudiante and m.estado = 'activa' and e.id is null
                   and a.cierra_en > now() and a.cierra_en <= now() + interval '7 days'),
    'practica', (select jsonb_build_object(
                    'xp', coalesce(sum(i.xp), 0),
                    'ejercicios', count(*),
                    'aciertos', count(*) filter (where i.correcta),
                    'dias', count(distinct (i.respondido_en at time zone 'America/Argentina/Tucuman')::date))
                 from public.practica_intentos i
                 where i.estudiante_id = p_estudiante and i.respondido_en >= v_ini and i.respondido_en < v_fin),
    'xp_semana_anterior', (select coalesce(sum(i.xp), 0) from public.practica_intentos i
                           where i.estudiante_id = p_estudiante and i.respondido_en >= v_ini - interval '7 days' and i.respondido_en < v_ini),
    'racha', (select coalesce(p.racha, 0) from public.progreso_estudiantes p where p.estudiante_id = p_estudiante),
    'meta_semanal', (select p.meta_semanal from public.progreso_estudiantes p where p.estudiante_id = p_estudiante),
    'medallas', (select coalesce(jsonb_agg(jsonb_build_object('nombre', d.nombre, 'icono', d.icono) order by o.obtenida_en), '[]')
                 from public.medallas_obtenidas o join public.medallas d on d.codigo = o.medalla
                 where o.estudiante_id = p_estudiante and o.obtenida_en >= v_ini and o.obtenida_en < v_fin)
  );
end;
$$;

create or replace function public.resumen_semanal(p_estudiante uuid, p_desde date default null)
returns jsonb language sql stable security invoker set search_path = '' as $$ select privado.resumen_semanal(p_estudiante, p_desde); $$;

create or replace function public.ruta_audio_entrega(p_actividad uuid, p_extension text)
returns text language sql stable security invoker set search_path = '' as $$ select privado.ruta_audio_entrega(p_actividad, p_extension); $$;
create or replace function public.ruta_audio_devolucion(p_entrega uuid, p_extension text)
returns text language sql stable security invoker set search_path = '' as $$ select privado.ruta_audio_devolucion(p_entrega, p_extension); $$;

-- ---------------------------------------------------------------------
-- Permisos (los privilegios por defecto están revocados)
-- ---------------------------------------------------------------------
revoke execute on function
  privado.extension_audio(text), privado.ruta_audio_entrega(uuid, text), privado.ruta_audio_devolucion(uuid, text),
  privado.audio_existe(text), privado.puede_ver_audio(text),
  privado.entregar_actividad(uuid, jsonb, text, text, int),
  privado.corregir_entrega(uuid, numeric, text, text, boolean, text, boolean),
  privado.entregas_de_estudiante(uuid), privado.resumen_semanal(uuid, date),
  public.entregar_actividad(uuid, jsonb, text, text, int),
  public.corregir_entrega(uuid, numeric, text, text, boolean, text, boolean),
  public.entregas_de_estudiante(uuid), public.resumen_semanal(uuid, date),
  public.ruta_audio_entrega(uuid, text), public.ruta_audio_devolucion(uuid, text)
from public, anon;
grant execute on function
  privado.extension_audio(text), privado.ruta_audio_entrega(uuid, text), privado.ruta_audio_devolucion(uuid, text),
  privado.audio_existe(text), privado.puede_ver_audio(text),
  privado.entregar_actividad(uuid, jsonb, text, text, int),
  privado.corregir_entrega(uuid, numeric, text, text, boolean, text, boolean),
  privado.entregas_de_estudiante(uuid), privado.resumen_semanal(uuid, date),
  public.entregar_actividad(uuid, jsonb, text, text, int),
  public.corregir_entrega(uuid, numeric, text, text, boolean, text, boolean),
  public.entregas_de_estudiante(uuid), public.resumen_semanal(uuid, date),
  public.ruta_audio_entrega(uuid, text), public.ruta_audio_devolucion(uuid, text)
to authenticated, service_role;
