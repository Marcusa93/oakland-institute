-- =====================================================================
-- 11 · Campus: actividades, práctica gamificada, alertas, informes,
--      evaluación docente, mensajería institucional y contenido del sitio.
--
-- Principios que se hacen cumplir acá (no en la interfaz):
--  · Las respuestas correctas nunca llegan al navegador del estudiante.
--  · El plazo de entrega lo controla el servidor.
--  · La nota la decide el docente y el estudiante la ve recién publicada.
--  · Puntos de juego ≠ evidencia de aprendizaje: repetir lo mismo no suma.
--  · Ranking por comisión, solo entre sus integrantes y con opción de salir.
--  · Mensajería con reglas explícitas: no hay chat abierto entre desconocidos.
-- =====================================================================

create type public.habilidad as enum ('vocabulario', 'lectura', 'gramatica', 'escucha', 'escritura', 'habla');
create type public.tipo_evaluacion as enum ('practica', 'formativa', 'acreditante');
create type public.estado_actividad as enum ('borrador', 'publicada', 'cerrada');
create type public.estado_entrega as enum ('en_curso', 'entregada', 'corregida');
create type public.tipo_alerta as enum ('ausentismo', 'participacion', 'rendimiento');

-- ---------------------------------------------------------------------
-- Auxiliares
-- ---------------------------------------------------------------------
create or replace function privado.estudiante_actual()
returns uuid language sql stable security definer set search_path = '' as $$
  select e.id from public.estudiantes e where e.persona_id = privado.persona_actual();
$$;

create or replace function privado.es_personal(p_persona uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.cuentas c join public.roles_asignados r on r.cuenta_id = c.id
    where c.persona_id = p_persona and c.estado = 'activa' and r.revocado_en is null);
$$;

create or replace function privado.inicio_semana()
returns date language sql stable set search_path = '' as $$
  select date_trunc('week', privado.hoy())::date;
$$;

-- ---------------------------------------------------------------------
-- Actividades y entregas
-- ---------------------------------------------------------------------
create table public.actividades (
  id uuid primary key default gen_random_uuid(),
  comision_id uuid not null references public.comisiones (id),
  autor_cuenta_id uuid references public.cuentas (id),
  titulo text not null check (length(btrim(titulo)) between 3 and 160),
  consigna text not null check (length(btrim(consigna)) > 0),
  habilidad public.habilidad not null,
  evaluacion public.tipo_evaluacion not null default 'formativa',
  abre_en timestamptz not null default now(),
  cierra_en timestamptz,
  puntaje_max numeric(5, 2) not null default 10 check (puntaje_max > 0),
  estado public.estado_actividad not null default 'borrador',
  creada_en timestamptz not null default now(),
  check (cierra_en is null or cierra_en > abre_en)
);
create index actividades_comision_idx on public.actividades (comision_id, estado, cierra_en);

create table public.actividad_preguntas (
  id uuid primary key default gen_random_uuid(),
  actividad_id uuid not null references public.actividades (id) on delete cascade,
  orden int not null,
  enunciado text not null check (length(btrim(enunciado)) > 0),
  tipo text not null check (tipo in ('opcion', 'texto')),
  opciones jsonb not null default '[]'::jsonb,
  puntaje numeric(5, 2) not null default 1 check (puntaje >= 0),
  unique (actividad_id, orden),
  check (tipo <> 'opcion' or jsonb_array_length(opciones) between 2 and 6)
);

-- Clave de corrección aparte: los estudiantes no tienen ninguna política sobre ella.
create table public.actividad_claves (
  pregunta_id uuid primary key references public.actividad_preguntas (id) on delete cascade,
  correcta int not null check (correcta >= 0)
);

create table public.entregas (
  id uuid primary key default gen_random_uuid(),
  actividad_id uuid not null references public.actividades (id),
  matricula_id uuid not null references public.matriculas (id),
  estado public.estado_entrega not null default 'en_curso',
  respuestas jsonb not null default '{}'::jsonb,
  texto text check (texto is null or length(texto) <= 8000),
  iniciada_en timestamptz not null default now(),
  entregada_en timestamptz,
  puntaje_auto numeric(5, 2),
  nota numeric(5, 2),
  devolucion text,
  reaccion text check (reaccion is null or reaccion in ('excelente', 'muy_bien', 'bien', 'a_mejorar')),
  corregida_por uuid references public.cuentas (id),
  corregida_en timestamptz,
  publicada boolean not null default false,
  unique (actividad_id, matricula_id),
  check (nota is null or nota >= 0)
);
create index entregas_matricula_idx on public.entregas (matricula_id);

-- El estudiante entrega: el servidor controla el plazo y corrige lo objetivo.
create or replace function privado.entregar_actividad(p_actividad uuid, p_respuestas jsonb, p_texto text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.actividades;
  v_matricula uuid;
  v_auto numeric := 0;
  v_total numeric := 0;
  v_previa public.entregas;
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

  select coalesce(sum(p.puntaje) filter (where (coalesce(p_respuestas, '{}'::jsonb) ->> p.id::text) = k.correcta::text), 0),
         coalesce(sum(p.puntaje), 0)
    into v_auto, v_total
    from public.actividad_preguntas p join public.actividad_claves k on k.pregunta_id = p.id
   where p.actividad_id = p_actividad and p.tipo = 'opcion';

  insert into public.entregas (actividad_id, matricula_id, estado, respuestas, texto, entregada_en, puntaje_auto)
  values (p_actividad, v_matricula, 'entregada', coalesce(p_respuestas, '{}'::jsonb), p_texto, now(), v_auto)
  on conflict (actividad_id, matricula_id) do update
    set estado = 'entregada', respuestas = excluded.respuestas, texto = excluded.texto,
        entregada_en = now(), puntaje_auto = excluded.puntaje_auto;

  -- En lo acreditante el resultado se ve recién cuando el docente publica.
  return jsonb_build_object(
    'entregada', true,
    'aciertos', case when a.evaluacion <> 'acreditante' then v_auto end,
    'total_objetivo', case when a.evaluacion <> 'acreditante' then v_total end);
end;
$$;

create or replace function privado.corregir_entrega(
  p_entrega uuid, p_nota numeric, p_devolucion text, p_reaccion text, p_publicar boolean)
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
  update public.entregas
     set nota = p_nota, devolucion = nullif(btrim(coalesce(p_devolucion, '')), ''), reaccion = p_reaccion,
         estado = 'corregida', corregida_por = (select auth.uid()), corregida_en = now(),
         publicada = coalesce(p_publicar, false)
   where id = p_entrega;
end;
$$;

-- Lo que ve el estudiante (o su familia): la nota solo si está publicada.
create or replace function privado.entregas_de_estudiante(p_estudiante uuid)
returns table (
  actividad_id uuid, titulo text, habilidad public.habilidad, evaluacion public.tipo_evaluacion,
  cierra_en timestamptz, comision text, estado text, entregada_en timestamptz,
  nota numeric, puntaje_max numeric, devolucion text, reaccion text)
language sql stable security definer set search_path = '' as $$
  select a.id, a.titulo, a.habilidad, a.evaluacion, a.cierra_en, k.nombre,
         case when e.id is null then 'pendiente' when e.publicada then 'corregida' else e.estado::text end,
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

-- Preguntas para resolver: sin la clave.
create or replace function privado.preguntas_de_actividad(p_actividad uuid)
returns table (id uuid, orden int, enunciado text, tipo text, opciones jsonb, puntaje numeric)
language sql stable security definer set search_path = '' as $$
  select p.id, p.orden, p.enunciado, p.tipo, p.opciones, p.puntaje
  from public.actividad_preguntas p
  join public.actividades a on a.id = p.actividad_id
  where p.actividad_id = p_actividad and a.estado <> 'borrador'
    and (privado.participa_en_comision(a.comision_id) or privado.es_gestion())
  order by p.orden;
$$;

-- ---------------------------------------------------------------------
-- Práctica gamificada
-- ---------------------------------------------------------------------
create table public.ejercicios (
  id uuid primary key default gen_random_uuid(),
  habilidad public.habilidad not null,
  nivel_id uuid references public.niveles (id),
  dificultad smallint not null default 1 check (dificultad between 1 and 3),
  tipo text not null check (tipo in ('opcion', 'completar', 'ordenar', 'escuchar')),
  enunciado text not null,
  opciones jsonb not null default '[]'::jsonb,
  respuesta text not null,
  explicacion text,
  audio_texto text,
  estado text not null default 'borrador' check (estado in ('borrador', 'revisado', 'retirado')),
  creado_por uuid references public.cuentas (id),
  revisado_por uuid references public.cuentas (id),
  revisado_en timestamptz,
  creado_en timestamptz not null default now(),
  check (estado <> 'revisado' or revisado_en is not null)
);
create index ejercicios_habilidad_idx on public.ejercicios (habilidad, estado);

create table public.practica_intentos (
  id bigint generated always as identity primary key,
  estudiante_id uuid not null references public.estudiantes (id),
  ejercicio_id uuid not null references public.ejercicios (id),
  correcta boolean not null,
  xp int not null default 0 check (xp >= 0),
  respondido_en timestamptz not null default now()
);
create index practica_intentos_estudiante_idx on public.practica_intentos (estudiante_id, respondido_en desc);

create table public.progreso_estudiantes (
  estudiante_id uuid primary key references public.estudiantes (id),
  racha int not null default 0,
  mejor_racha int not null default 0,
  ultima_practica date,
  comodines int not null default 0 check (comodines between 0 and 2),
  meta_semanal int not null default 100 check (meta_semanal between 20 and 1000),
  alias text check (alias is null or alias ~ '^[[:alnum:] _.-]{3,20}$'),
  mostrar_en_ranking boolean not null default true
);

create table public.medallas (
  codigo text primary key,
  nombre text not null,
  descripcion text not null,
  icono text not null,
  orden int not null default 0
);

create table public.medallas_obtenidas (
  estudiante_id uuid not null references public.estudiantes (id),
  medalla text not null references public.medallas (codigo),
  obtenida_en timestamptz not null default now(),
  primary key (estudiante_id, medalla)
);

insert into public.medallas (codigo, nombre, descripcion, icono, orden) values
  ('primer_paso', 'Primer paso', 'Completaste tu primera práctica.', '🌱', 1),
  ('racha_3', 'Tres al hilo', 'Practicaste 3 días seguidos.', '🔥', 2),
  ('racha_7', 'Semana completa', 'Practicaste 7 días seguidos.', '⚡', 3),
  ('xp_100', '100 XP', 'Sumaste 100 puntos de práctica.', '⭐', 4),
  ('xp_500', '500 XP', 'Sumaste 500 puntos de práctica.', '🌟', 5),
  ('meta_semanal', 'Meta cumplida', 'Llegaste a tu meta de la semana.', '🎯', 6),
  ('vocabulario_10', 'Coleccionista de palabras', '10 ejercicios de vocabulario distintos bien resueltos.', '📚', 7),
  ('gramatica_10', 'Arquitecto de frases', '10 ejercicios de gramática distintos bien resueltos.', '🧩', 8),
  ('escucha_10', 'Buen oído', '10 ejercicios de escucha distintos bien resueltos.', '🎧', 9),
  ('lectura_10', 'Lector', '10 ejercicios de lectura distintos bien resueltos.', '📖', 10),
  ('entrega_puntual', 'Puntual', 'Entregaste 3 actividades a tiempo.', '⏰', 11);

-- Próxima lección: ejercicios revisados de la habilidad, primero los que
-- costaron (repetición espaciada simple), después los nuevos y por último
-- los ya dominados hace tiempo. Nunca devuelve la respuesta.
create or replace function privado.siguiente_leccion(p_habilidad public.habilidad, p_cantidad int)
returns table (id uuid, tipo text, enunciado text, opciones jsonb, audio_texto text, dificultad smallint)
language sql volatile security definer set search_path = '' as $$
  with yo as (select privado.estudiante_actual() as est),
  niveles as (
    select k.nivel_id from public.matriculas m join public.comisiones k on k.id = m.comision_id, yo
    where m.estudiante_id = yo.est and m.estado = 'activa'
  ),
  historial as (
    select i.ejercicio_id,
           bool_or(i.correcta) filter (where i.respondido_en = (select max(j.respondido_en) from public.practica_intentos j
                                                                 where j.estudiante_id = i.estudiante_id and j.ejercicio_id = i.ejercicio_id)) as ultima_bien,
           max(i.respondido_en) as ultima
    from public.practica_intentos i, yo where i.estudiante_id = yo.est
    group by i.ejercicio_id
  )
  select e.id, e.tipo, e.enunciado, e.opciones, e.audio_texto, e.dificultad
  from public.ejercicios e
  left join historial h on h.ejercicio_id = e.id
  where e.habilidad = p_habilidad and e.estado = 'revisado'
    and (e.nivel_id is null or e.nivel_id in (select nivel_id from niveles) or not exists (select 1 from niveles))
    and (select est from yo) is not null
  order by
    case when h.ejercicio_id is not null and not h.ultima_bien and h.ultima < now() - interval '10 minutes' then 0
         when h.ejercicio_id is null then 1
         when h.ultima < now() - interval '3 days' then 2
         else 3 end,
    e.dificultad, random()
  limit least(greatest(coalesce(p_cantidad, 5), 1), 10);
$$;

create or replace function privado.otorgar_medalla(p_estudiante uuid, p_codigo text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  insert into public.medallas_obtenidas (estudiante_id, medalla) values (p_estudiante, p_codigo)
  on conflict do nothing;
  return found;
end;
$$;

create or replace function privado.responder_ejercicio(p_ejercicio uuid, p_respuesta text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_est uuid := privado.estudiante_actual();
  e public.ejercicios;
  v_ok boolean;
  v_xp int := 0;
  p public.progreso_estudiantes;
  v_hoy date := privado.hoy();
  v_nuevas text[] := '{}';
  v_total int;
  v_semana int;
  v_dominados int;
  normalizar constant text := '[[:space:][:punct:]]+';
begin
  perform privado.exigir(v_est is not null, 'NO_AUTORIZADO: solo estudiantes');
  select * into e from public.ejercicios where id = p_ejercicio and estado = 'revisado';
  if not found then raise exception 'NO_ENCONTRADO' using errcode = 'P0002'; end if;

  v_ok := lower(btrim(regexp_replace(coalesce(p_respuesta, ''), normalizar, ' ', 'g')))
        = lower(btrim(regexp_replace(e.respuesta, normalizar, ' ', 'g')));

  -- XP solo la primera vez que se resuelve bien en el día: repetir no infla.
  if v_ok and not exists (
    select 1 from public.practica_intentos i
    where i.estudiante_id = v_est and i.ejercicio_id = p_ejercicio and i.correcta
      and i.respondido_en > now() - interval '20 hours') then
    v_xp := 10 + (e.dificultad - 1) * 5;
  end if;
  insert into public.practica_intentos (estudiante_id, ejercicio_id, correcta, xp) values (v_est, p_ejercicio, v_ok, v_xp);

  -- Racha: un día sin practicar se cubre con un comodín (se gana uno cada 7 días).
  insert into public.progreso_estudiantes (estudiante_id) values (v_est) on conflict do nothing;
  select * into p from public.progreso_estudiantes where estudiante_id = v_est for update;
  if p.ultima_practica is distinct from v_hoy then
    if p.ultima_practica = v_hoy - 1 then
      p.racha := p.racha + 1;
    elsif p.ultima_practica = v_hoy - 2 and p.comodines > 0 then
      p.racha := p.racha + 1;
      p.comodines := p.comodines - 1;
    else
      p.racha := 1;
    end if;
    if p.racha > 0 and p.racha % 7 = 0 then p.comodines := least(p.comodines + 1, 2); end if;
    update public.progreso_estudiantes
       set racha = p.racha, mejor_racha = greatest(mejor_racha, p.racha), ultima_practica = v_hoy, comodines = p.comodines
     where estudiante_id = v_est;
  end if;

  select coalesce(sum(xp), 0) into v_total from public.practica_intentos where estudiante_id = v_est;
  select coalesce(sum(xp), 0) into v_semana from public.practica_intentos
   where estudiante_id = v_est and respondido_en >= privado.inicio_semana();
  select count(distinct i.ejercicio_id) into v_dominados
    from public.practica_intentos i join public.ejercicios x on x.id = i.ejercicio_id
   where i.estudiante_id = v_est and i.correcta and x.habilidad = e.habilidad;

  if privado.otorgar_medalla(v_est, 'primer_paso') then v_nuevas := array_append(v_nuevas, 'primer_paso'); end if;
  if p.racha >= 3 and privado.otorgar_medalla(v_est, 'racha_3') then v_nuevas := array_append(v_nuevas, 'racha_3'); end if;
  if p.racha >= 7 and privado.otorgar_medalla(v_est, 'racha_7') then v_nuevas := array_append(v_nuevas, 'racha_7'); end if;
  if v_total >= 100 and privado.otorgar_medalla(v_est, 'xp_100') then v_nuevas := array_append(v_nuevas, 'xp_100'); end if;
  if v_total >= 500 and privado.otorgar_medalla(v_est, 'xp_500') then v_nuevas := array_append(v_nuevas, 'xp_500'); end if;
  if v_semana >= (select meta_semanal from public.progreso_estudiantes where estudiante_id = v_est)
     and privado.otorgar_medalla(v_est, 'meta_semanal') then v_nuevas := array_append(v_nuevas, 'meta_semanal'); end if;
  if v_dominados >= 10 and e.habilidad::text in ('vocabulario', 'gramatica', 'escucha', 'lectura')
     and privado.otorgar_medalla(v_est, e.habilidad::text || '_10') then v_nuevas := array_append(v_nuevas, (e.habilidad::text || '_10')); end if;

  return jsonb_build_object(
    'correcta', v_ok,
    'respuesta', e.respuesta,
    'explicacion', e.explicacion,
    'xp', v_xp,
    'xp_total', v_total,
    'xp_semana', v_semana,
    'racha', p.racha,
    'medallas_nuevas', coalesce((select jsonb_agg(jsonb_build_object('codigo', m.codigo, 'nombre', m.nombre, 'icono', m.icono))
                                 from public.medallas m where m.codigo = any (v_nuevas)), '[]'::jsonb));
end;
$$;

-- Panel del estudiante: XP, racha, meta, medallas y dominio por habilidad.
-- El dominio cuenta ejercicios DISTINTOS bien resueltos (evidencia), no XP.
create or replace function privado.mi_progreso()
returns jsonb language sql stable security definer set search_path = '' as $$
  with yo as (select privado.estudiante_actual() as est)
  select case when (select est from yo) is null then null else jsonb_build_object(
    'xp_total', (select coalesce(sum(xp), 0) from public.practica_intentos i, yo where i.estudiante_id = yo.est),
    'xp_semana', (select coalesce(sum(xp), 0) from public.practica_intentos i, yo
                  where i.estudiante_id = yo.est and i.respondido_en >= privado.inicio_semana()),
    'racha', coalesce((select case when p.ultima_practica >= privado.hoy() - 1
                                    or (p.ultima_practica = privado.hoy() - 2 and p.comodines > 0) then p.racha else 0 end
                       from public.progreso_estudiantes p, yo where p.estudiante_id = yo.est), 0),
    'mejor_racha', coalesce((select p.mejor_racha from public.progreso_estudiantes p, yo where p.estudiante_id = yo.est), 0),
    'comodines', coalesce((select p.comodines from public.progreso_estudiantes p, yo where p.estudiante_id = yo.est), 0),
    'meta_semanal', coalesce((select p.meta_semanal from public.progreso_estudiantes p, yo where p.estudiante_id = yo.est), 100),
    'alias', (select p.alias from public.progreso_estudiantes p, yo where p.estudiante_id = yo.est),
    'mostrar_en_ranking', coalesce((select p.mostrar_en_ranking from public.progreso_estudiantes p, yo where p.estudiante_id = yo.est), true),
    'practico_hoy', coalesce((select p.ultima_practica = privado.hoy() from public.progreso_estudiantes p, yo where p.estudiante_id = yo.est), false),
    'habilidades', (
      select jsonb_agg(jsonb_build_object(
        'habilidad', h.h,
        'disponibles', (select count(*) from public.ejercicios x where x.habilidad = h.h and x.estado = 'revisado'),
        'dominados', (select count(distinct i.ejercicio_id) from public.practica_intentos i join public.ejercicios x on x.id = i.ejercicio_id, yo
                      where i.estudiante_id = yo.est and i.correcta and x.habilidad = h.h)) order by h.h)
      from unnest(enum_range(null::public.habilidad)) as h(h)),
    'medallas', (
      select jsonb_agg(jsonb_build_object('codigo', m.codigo, 'nombre', m.nombre, 'descripcion', m.descripcion, 'icono', m.icono,
                                          'obtenida_en', o.obtenida_en) order by m.orden)
      from public.medallas m left join public.medallas_obtenidas o on o.medalla = m.codigo and o.estudiante_id = (select est from yo))
  ) end;
$$;

create or replace function privado.configurar_practica(p_alias text, p_mostrar boolean, p_meta int)
returns void language plpgsql security definer set search_path = '' as $$
declare v_est uuid := privado.estudiante_actual();
begin
  perform privado.exigir(v_est is not null);
  insert into public.progreso_estudiantes (estudiante_id) values (v_est) on conflict do nothing;
  update public.progreso_estudiantes
     set alias = nullif(btrim(coalesce(p_alias, '')), ''),
         mostrar_en_ranking = coalesce(p_mostrar, mostrar_en_ranking),
         meta_semanal = coalesce(p_meta, meta_semanal)
   where estudiante_id = v_est;
end;
$$;

-- Ranking de USO de la semana dentro de una comisión. Solo lo ven sus
-- integrantes; muestra alias o nombre + inicial; quien eligió no aparecer
-- no aparece (salvo para sí mismo, sin posición).
create or replace function privado.ranking_comision(p_comision uuid)
returns table (posicion int, nombre text, xp_semana int, soy_yo boolean)
language sql stable security definer set search_path = '' as $$
  with participantes as (
    select e.id as est, coalesce(pr.alias, p.nombres || ' ' || left(p.apellidos, 1) || '.') as nombre,
           coalesce(pr.mostrar_en_ranking, true) as visible,
           (select coalesce(sum(i.xp), 0) from public.practica_intentos i
             where i.estudiante_id = e.id and i.respondido_en >= privado.inicio_semana())::int as xp
    from public.matriculas m
    join public.estudiantes e on e.id = m.estudiante_id
    join public.personas p on p.id = e.persona_id
    left join public.progreso_estudiantes pr on pr.estudiante_id = e.id
    where m.comision_id = p_comision and m.estado = 'activa'
  )
  select case when visible then (rank() over (partition by visible order by xp desc))::int end,
         nombre, xp, est = privado.estudiante_actual()
  from participantes
  where (visible or est = privado.estudiante_actual())
    and (privado.participa_en_comision(p_comision) or privado.es_gestion())
  order by visible desc, xp desc, nombre;
$$;

-- ---------------------------------------------------------------------
-- Alertas automáticas
-- ---------------------------------------------------------------------
create table public.alertas (
  id uuid primary key default gen_random_uuid(),
  tipo public.tipo_alerta not null,
  estudiante_id uuid not null references public.estudiantes (id),
  comision_id uuid not null references public.comisiones (id),
  nivel text not null default 'atencion' check (nivel in ('atencion', 'urgente')),
  detalle text not null,
  datos jsonb not null default '{}'::jsonb,
  clave text not null unique,
  estado text not null default 'abierta' check (estado in ('abierta', 'en_seguimiento', 'resuelta')),
  nota text,
  creada_en timestamptz not null default now(),
  actualizada_por uuid references public.cuentas (id),
  actualizada_en timestamptz
);
create index alertas_comision_idx on public.alertas (comision_id, estado);

create or replace function privado.evaluar_alertas_matricula(p_matricula uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  m public.matriculas;
  v_semana text := to_char(privado.hoy(), 'IYYY-IW');
  v_aus int;
  v_clases int;
  v_presentes int;
  v_prom numeric;
  v_ultima_nota numeric;
  v_corregidas int;
  v_vencidas int;
  v_ultima_practica date;
  v_n int := 0;
begin
  select * into m from public.matriculas where id = p_matricula and estado = 'activa';
  if not found then return 0; end if;

  -- Ausentismo: 2 o más ausencias en las últimas 4 clases registradas.
  select count(*) filter (where s.estado = 'ausente'), count(*)
    into v_aus, v_clases
    from (select a.estado from public.asistencias a join public.clases c on c.id = a.clase_id
          where a.matricula_id = p_matricula order by c.fecha desc, c.hora_inicio desc limit 4) s;
  if v_aus >= 2 then
    insert into public.alertas (tipo, estudiante_id, comision_id, nivel, detalle, datos, clave)
    values ('ausentismo', m.estudiante_id, m.comision_id, case when v_aus >= 3 then 'urgente' else 'atencion' end,
            format('%s ausencias en las últimas %s clases.', v_aus, v_clases),
            jsonb_build_object('ausencias', v_aus, 'clases', v_clases),
            'aus:' || p_matricula || ':' || v_semana)
    on conflict (clave) do update set nivel = excluded.nivel, detalle = excluded.detalle, datos = excluded.datos
      where public.alertas.estado <> 'resuelta';
    v_n := v_n + 1;
  end if;

  -- Rendimiento: la última corrección debajo del 40 % o el promedio de las
  -- últimas dos debajo del 50 %.
  select avg(e.nota / a.puntaje_max), count(*), (array_agg(e.nota / a.puntaje_max order by e.corregida_en desc))[1]
    into v_prom, v_corregidas, v_ultima_nota
    from (select e2.* from public.entregas e2 where e2.matricula_id = p_matricula and e2.estado = 'corregida' and e2.nota is not null
          order by e2.corregida_en desc limit 2) e
    join public.actividades a on a.id = e.actividad_id;
  if v_corregidas >= 1 and (v_ultima_nota < 0.4 or (v_corregidas >= 2 and v_prom < 0.5)) then
    insert into public.alertas (tipo, estudiante_id, comision_id, detalle, datos, clave)
    values ('rendimiento', m.estudiante_id, m.comision_id,
            format('Última nota: %s %% del puntaje (promedio reciente %s %%).', round(v_ultima_nota * 100), round(v_prom * 100)),
            jsonb_build_object('promedio', round(v_prom, 2)), 'ren:' || p_matricula || ':' || v_semana)
    on conflict (clave) do nothing;
    v_n := v_n + 1;
  end if;

  -- Participación: actividades vencidas sin entregar o 10 días sin practicar.
  select count(*) into v_vencidas from public.actividades a
   where a.comision_id = m.comision_id and a.estado <> 'borrador' and a.cierra_en < now()
     and a.cierra_en > now() - interval '21 days'
     and not exists (select 1 from public.entregas e where e.actividad_id = a.id and e.matricula_id = p_matricula and e.estado <> 'en_curso');
  select ultima_practica into v_ultima_practica from public.progreso_estudiantes where estudiante_id = m.estudiante_id;
  if v_vencidas >= 2 or (v_vencidas >= 1 and (v_ultima_practica is null or v_ultima_practica < privado.hoy() - 10)) then
    insert into public.alertas (tipo, estudiante_id, comision_id, detalle, datos, clave)
    values ('participacion', m.estudiante_id, m.comision_id,
            format('%s actividades vencidas sin entregar%s.', v_vencidas,
                   case when v_ultima_practica is null then ' y sin práctica registrada'
                        when v_ultima_practica < privado.hoy() - 10 then ' y más de 10 días sin practicar' else '' end),
            jsonb_build_object('vencidas', v_vencidas, 'ultima_practica', v_ultima_practica),
            'par:' || p_matricula || ':' || v_semana)
    on conflict (clave) do nothing;
    v_n := v_n + 1;
  end if;
  return v_n;
end;
$$;

create or replace function privado.alertas_por_asistencia()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform privado.evaluar_alertas_matricula(new.matricula_id);
  return new;
end;
$$;
create trigger asistencias_alertas after insert or update of estado on public.asistencias
  for each row execute function privado.alertas_por_asistencia();

create or replace function privado.alertas_por_correccion()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.estado = 'corregida' then perform privado.evaluar_alertas_matricula(new.matricula_id); end if;
  return new;
end;
$$;
create trigger entregas_alertas after update of estado, nota on public.entregas
  for each row execute function privado.alertas_por_correccion();

-- Revisión completa (docente: sus comisiones; gestión o tarea programada: todas).
create or replace function privado.revisar_alertas()
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_total int := 0;
  r record;
begin
  perform privado.exigir(privado.es_gestion() or privado.tiene_rol('docente'));
  for r in
    select m.id from public.matriculas m
    where m.estado = 'activa' and (privado.es_gestion() or privado.es_docente_de_comision(m.comision_id))
  loop
    v_total := v_total + privado.evaluar_alertas_matricula(r.id);
  end loop;
  return v_total;
end;
$$;

-- ---------------------------------------------------------------------
-- Informes por estudiante
-- ---------------------------------------------------------------------
create table public.informes (
  id uuid primary key default gen_random_uuid(),
  estudiante_id uuid not null references public.estudiantes (id),
  autor_cuenta_id uuid not null references public.cuentas (id),
  periodo text not null,
  datos jsonb not null,
  comentario text,
  recomendaciones text,
  destinatario text not null default 'direccion' check (destinatario in ('direccion', 'familia')),
  estado text not null default 'borrador' check (estado in ('borrador', 'enviado')),
  creado_en timestamptz not null default now(),
  enviado_en timestamptz,
  check (estado <> 'enviado' or enviado_en is not null)
);
create index informes_estudiante_idx on public.informes (estudiante_id, creado_en desc);

-- Datos del informe calculados por la base: el texto lo escribe una persona.
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
                       'estado', coalesce(e.estado::text, 'sin entregar'), 'nota', e.nota, 'puntaje_max', a.puntaje_max)
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

-- ---------------------------------------------------------------------
-- Evaluación docente (solo dirección; el docente ve lo que se le comparte)
-- ---------------------------------------------------------------------
create table public.evaluaciones_docentes (
  id uuid primary key default gen_random_uuid(),
  docente_persona_id uuid not null references public.personas (id),
  evaluador_cuenta_id uuid not null references public.cuentas (id),
  periodo text not null,
  puntajes jsonb not null,
  fortalezas text,
  a_mejorar text,
  compartida boolean not null default false,
  creada_en timestamptz not null default now()
);
create index evaluaciones_docente_idx on public.evaluaciones_docentes (docente_persona_id, creada_en desc);

-- ---------------------------------------------------------------------
-- Mensajería institucional (hilos con participantes y reglas)
-- ---------------------------------------------------------------------
create table public.hilos (
  id uuid primary key default gen_random_uuid(),
  asunto text not null check (length(btrim(asunto)) between 2 and 140),
  estudiante_id uuid references public.estudiantes (id),
  creado_por uuid not null references public.cuentas (id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);

create table public.hilo_participantes (
  hilo_id uuid not null references public.hilos (id) on delete cascade,
  persona_id uuid not null references public.personas (id),
  leido_en timestamptz,
  primary key (hilo_id, persona_id)
);
create index hilo_participantes_persona_idx on public.hilo_participantes (persona_id);

create table public.mensajes (
  id uuid primary key default gen_random_uuid(),
  hilo_id uuid not null references public.hilos (id) on delete cascade,
  autor_persona_id uuid not null references public.personas (id),
  cuerpo text not null check (length(btrim(cuerpo)) between 1 and 4000),
  creado_en timestamptz not null default now()
);
create index mensajes_hilo_idx on public.mensajes (hilo_id, creado_en);
create trigger mensajes_inmutables before update or delete on public.mensajes
  for each row execute function privado.impedir_cambios();

create or replace function privado.es_participante(p_hilo uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.hilo_participantes h
                 where h.hilo_id = p_hilo and h.persona_id = privado.persona_actual());
$$;

-- ¿Puede la cuenta actual iniciar una conversación con esta persona?
create or replace function privado.puede_escribir_a(p_destino uuid, p_estudiante uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    -- Gestión: con cualquiera.
    when privado.es_gestion() then true
    -- Personal con personal.
    when privado.es_personal(privado.persona_actual()) and privado.es_personal(p_destino) then true
    -- Docente → estudiante o responsable académico de un estudiante de sus comisiones.
    when privado.tiene_rol('docente') and p_estudiante is not null and privado.es_docente_del_estudiante(p_estudiante)
      and (exists (select 1 from public.estudiantes e where e.id = p_estudiante and e.persona_id = p_destino)
           or exists (select 1 from public.vinculos_responsables v where v.estudiante_id = p_estudiante
                      and v.responsable_persona_id = p_destino and v.estado = 'verificado' and v.permiso_academico)) then true
    -- Familia o estudiante → docentes de ese estudiante o personal de gestión.
    when p_estudiante is not null
      and (privado.es_el_estudiante(p_estudiante) or privado.es_responsable_de(p_estudiante, 'academico'))
      and (exists (select 1 from public.matriculas m join public.comision_docentes d on d.comision_id = m.comision_id
                   where m.estudiante_id = p_estudiante and m.estado = 'activa' and d.hasta is null and d.docente_persona_id = p_destino)
           or exists (select 1 from public.cuentas c join public.roles_asignados r on r.cuenta_id = c.id
                      where c.persona_id = p_destino and r.revocado_en is null and r.rol in ('administracion', 'direccion'))) then true
    else false
  end;
$$;

create or replace function privado.iniciar_hilo(p_destinatarios uuid[], p_asunto text, p_cuerpo text, p_estudiante uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_yo uuid := privado.persona_actual();
  v_hilo uuid;
  d uuid;
begin
  perform privado.exigir(v_yo is not null);
  if p_destinatarios is null or cardinality(p_destinatarios) = 0 or cardinality(p_destinatarios) > 10 then
    raise exception 'DESTINATARIOS_INVALIDOS' using errcode = 'P0001';
  end if;
  foreach d in array p_destinatarios loop
    if d = v_yo or not privado.puede_escribir_a(d, p_estudiante) then
      raise exception 'NO_AUTORIZADO: no podés escribirle a esa persona por este canal' using errcode = '42501';
    end if;
  end loop;
  insert into public.hilos (asunto, estudiante_id, creado_por) values (p_asunto, p_estudiante, (select auth.uid()))
  returning id into v_hilo;
  insert into public.hilo_participantes (hilo_id, persona_id, leido_en)
  select v_hilo, x, case when x = v_yo then now() end from (select distinct unnest(p_destinatarios || v_yo) as x) t;
  insert into public.mensajes (hilo_id, autor_persona_id, cuerpo) values (v_hilo, v_yo, p_cuerpo);
  return v_hilo;
end;
$$;

create or replace function privado.responder_hilo(p_hilo uuid, p_cuerpo text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform privado.exigir(privado.es_participante(p_hilo));
  insert into public.mensajes (hilo_id, autor_persona_id, cuerpo) values (p_hilo, privado.persona_actual(), p_cuerpo)
  returning id into v_id;
  update public.hilos set actualizado_en = now() where id = p_hilo;
  update public.hilo_participantes set leido_en = now() where hilo_id = p_hilo and persona_id = privado.persona_actual();
  return v_id;
end;
$$;

create or replace function privado.marcar_hilo_leido(p_hilo uuid)
returns void language sql security definer set search_path = '' as $$
  update public.hilo_participantes set leido_en = now()
   where hilo_id = p_hilo and persona_id = privado.persona_actual();
$$;

-- ---------------------------------------------------------------------
-- Contenido editable de la landing
-- ---------------------------------------------------------------------
create table public.sitio_contenido (
  clave text primary key check (clave in ('portada', 'pasos', 'preguntas', 'contacto', 'anuncio', 'certificaciones')),
  valor jsonb not null,
  actualizado_por uuid references public.cuentas (id),
  actualizado_en timestamptz not null default now()
);
create trigger auditar_sitio after insert or update on public.sitio_contenido
  for each row execute function privado.auditar();
create trigger auditar_evaluaciones after insert or update or delete on public.evaluaciones_docentes
  for each row execute function privado.auditar();

-- ---------------------------------------------------------------------
-- Envoltorios públicos
-- ---------------------------------------------------------------------
create or replace function public.entregar_actividad(p_actividad uuid, p_respuestas jsonb, p_texto text default null)
returns jsonb language sql security invoker set search_path = '' as $$ select privado.entregar_actividad(p_actividad, p_respuestas, p_texto); $$;
create or replace function public.corregir_entrega(p_entrega uuid, p_nota numeric, p_devolucion text, p_reaccion text default null, p_publicar boolean default true)
returns void language sql security invoker set search_path = '' as $$ select privado.corregir_entrega(p_entrega, p_nota, p_devolucion, p_reaccion, p_publicar); $$;
create or replace function public.entregas_de_estudiante(p_estudiante uuid)
returns table (actividad_id uuid, titulo text, habilidad public.habilidad, evaluacion public.tipo_evaluacion,
  cierra_en timestamptz, comision text, estado text, entregada_en timestamptz,
  nota numeric, puntaje_max numeric, devolucion text, reaccion text)
language sql stable security invoker set search_path = '' as $$ select * from privado.entregas_de_estudiante(p_estudiante); $$;
create or replace function public.preguntas_de_actividad(p_actividad uuid)
returns table (id uuid, orden int, enunciado text, tipo text, opciones jsonb, puntaje numeric)
language sql stable security invoker set search_path = '' as $$ select * from privado.preguntas_de_actividad(p_actividad); $$;
create or replace function public.siguiente_leccion(p_habilidad public.habilidad, p_cantidad int default 5)
returns table (id uuid, tipo text, enunciado text, opciones jsonb, audio_texto text, dificultad smallint)
language sql security invoker set search_path = '' as $$ select * from privado.siguiente_leccion(p_habilidad, p_cantidad); $$;
create or replace function public.responder_ejercicio(p_ejercicio uuid, p_respuesta text)
returns jsonb language sql security invoker set search_path = '' as $$ select privado.responder_ejercicio(p_ejercicio, p_respuesta); $$;
create or replace function public.mi_progreso()
returns jsonb language sql stable security invoker set search_path = '' as $$ select privado.mi_progreso(); $$;
create or replace function public.configurar_practica(p_alias text default null, p_mostrar boolean default null, p_meta int default null)
returns void language sql security invoker set search_path = '' as $$ select privado.configurar_practica(p_alias, p_mostrar, p_meta); $$;
create or replace function public.ranking_comision(p_comision uuid)
returns table (posicion int, nombre text, xp_semana int, soy_yo boolean)
language sql stable security invoker set search_path = '' as $$ select * from privado.ranking_comision(p_comision); $$;
create or replace function public.revisar_alertas()
returns int language sql security invoker set search_path = '' as $$ select privado.revisar_alertas(); $$;
-- Tarea programada (solo service_role): revisa todas las inscripciones activas.
create or replace function public.revisar_alertas_programada()
returns int language plpgsql security invoker set search_path = '' as $$
declare v int := 0; r record;
begin
  for r in select id from public.matriculas where estado = 'activa' loop
    v := v + privado.evaluar_alertas_matricula(r.id);
  end loop;
  return v;
end;
$$;
create or replace function public.datos_informe(p_estudiante uuid, p_desde date, p_hasta date)
returns jsonb language sql stable security invoker set search_path = '' as $$ select privado.datos_informe(p_estudiante, p_desde, p_hasta); $$;
create or replace function public.iniciar_hilo(p_destinatarios uuid[], p_asunto text, p_cuerpo text, p_estudiante uuid default null)
returns uuid language sql security invoker set search_path = '' as $$ select privado.iniciar_hilo(p_destinatarios, p_asunto, p_cuerpo, p_estudiante); $$;
create or replace function public.responder_hilo(p_hilo uuid, p_cuerpo text)
returns uuid language sql security invoker set search_path = '' as $$ select privado.responder_hilo(p_hilo, p_cuerpo); $$;
create or replace function public.marcar_hilo_leido(p_hilo uuid)
returns void language sql security invoker set search_path = '' as $$ select privado.marcar_hilo_leido(p_hilo); $$;

-- ---------------------------------------------------------------------
-- Permisos
-- ---------------------------------------------------------------------
revoke execute on all functions in schema privado from public, anon;
grant execute on all functions in schema privado to authenticated, service_role;
revoke execute on function privado.evaluar_alertas_matricula(uuid) from authenticated;
-- Internas de cobros (ver 07): nunca invocables con sesión de usuario.
revoke execute on function privado.generar_cuotas_interno(date, int, uuid) from authenticated;
revoke execute on function privado.imputar_interno(uuid, uuid, numeric, uuid) from authenticated;
revoke execute on function privado.recalcular_obligacion(uuid) from authenticated;
revoke execute on function privado.bloquear_comision(uuid) from authenticated;
revoke execute on function privado.otorgar_medalla(uuid, text) from authenticated;
-- Lo que necesita el visitante (perfiles y oferta) sigue habilitado.
grant execute on function privado.persona_actual(), privado.tiene_rol(public.rol_personal), privado.es_gestion(),
  privado.es_direccion(), privado.perfiles_actuales(), privado.oferta_publicada(), privado.ocupacion_comision(uuid) to anon;

revoke execute on all functions in schema public from public, anon;
grant execute on function public.oferta_publicada(), public.buscar_ayuda(text, int) to anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke execute on function public.procesar_evento_pasarela(text, text, text, boolean, text, numeric, date, uuid, uuid, jsonb),
  public.generar_cuotas_programada(date, int), public.revisar_alertas_programada() from authenticated;

grant select on public.actividades, public.actividad_preguntas, public.actividad_claves, public.entregas,
  public.ejercicios, public.medallas, public.alertas, public.informes, public.evaluaciones_docentes,
  public.hilos, public.hilo_participantes, public.mensajes, public.sitio_contenido to authenticated;
grant insert, update, delete on public.actividades, public.actividad_preguntas, public.actividad_claves to authenticated;
grant insert, update on public.ejercicios, public.informes, public.evaluaciones_docentes, public.sitio_contenido to authenticated;
grant update on public.alertas to authenticated;
grant select on public.sitio_contenido, public.medallas to anon;
grant all on public.actividades, public.actividad_preguntas, public.actividad_claves, public.entregas, public.ejercicios,
  public.practica_intentos, public.progreso_estudiantes, public.medallas, public.medallas_obtenidas, public.alertas,
  public.informes, public.evaluaciones_docentes, public.hilos, public.hilo_participantes, public.mensajes,
  public.sitio_contenido to service_role;

alter table public.actividades enable row level security;
alter table public.actividad_preguntas enable row level security;
alter table public.actividad_claves enable row level security;
alter table public.entregas enable row level security;
alter table public.ejercicios enable row level security;
alter table public.practica_intentos enable row level security;
alter table public.progreso_estudiantes enable row level security;
alter table public.medallas enable row level security;
alter table public.medallas_obtenidas enable row level security;
alter table public.alertas enable row level security;
alter table public.informes enable row level security;
alter table public.evaluaciones_docentes enable row level security;
alter table public.hilos enable row level security;
alter table public.hilo_participantes enable row level security;
alter table public.mensajes enable row level security;
alter table public.sitio_contenido enable row level security;

-- Actividades: el docente de la comisión las arma; estudiantes y familias
-- ven las publicadas de sus comisiones.
create policy actividades_lectura on public.actividades for select to authenticated using (
  (select privado.es_gestion()) or privado.es_docente_de_comision(comision_id)
  or (estado <> 'borrador' and privado.participa_en_comision(comision_id))
);
create policy actividades_alta on public.actividades for insert to authenticated with check (
  ((select privado.es_gestion()) or privado.es_docente_de_comision(comision_id)) and autor_cuenta_id = (select auth.uid())
);
create policy actividades_edicion on public.actividades for update to authenticated
  using ((select privado.es_gestion()) or privado.es_docente_de_comision(comision_id))
  with check ((select privado.es_gestion()) or privado.es_docente_de_comision(comision_id));
create policy actividades_baja on public.actividades for delete to authenticated
  using (estado = 'borrador' and ((select privado.es_gestion()) or privado.es_docente_de_comision(comision_id)));

create or replace function privado.puede_editar_actividad(p_actividad uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.actividades a where a.id = p_actividad
                 and (privado.es_gestion() or privado.es_docente_de_comision(a.comision_id)));
$$;
grant execute on function privado.puede_editar_actividad(uuid) to authenticated;

-- Preguntas: solo quien arma la actividad (los estudiantes usan preguntas_de_actividad).
create policy preguntas_docente on public.actividad_preguntas for select to authenticated using (privado.puede_editar_actividad(actividad_id));
create policy preguntas_alta on public.actividad_preguntas for insert to authenticated with check (privado.puede_editar_actividad(actividad_id));
create policy preguntas_edicion on public.actividad_preguntas for update to authenticated
  using (privado.puede_editar_actividad(actividad_id)) with check (privado.puede_editar_actividad(actividad_id));
create policy preguntas_baja on public.actividad_preguntas for delete to authenticated using (privado.puede_editar_actividad(actividad_id));

create policy claves_docente on public.actividad_claves for select to authenticated using (
  exists (select 1 from public.actividad_preguntas p where p.id = pregunta_id and privado.puede_editar_actividad(p.actividad_id)));
create policy claves_alta on public.actividad_claves for insert to authenticated with check (
  exists (select 1 from public.actividad_preguntas p where p.id = pregunta_id and privado.puede_editar_actividad(p.actividad_id)));
create policy claves_edicion on public.actividad_claves for update to authenticated
  using (exists (select 1 from public.actividad_preguntas p where p.id = pregunta_id and privado.puede_editar_actividad(p.actividad_id)))
  with check (exists (select 1 from public.actividad_preguntas p where p.id = pregunta_id and privado.puede_editar_actividad(p.actividad_id)));
create policy claves_baja on public.actividad_claves for delete to authenticated using (
  exists (select 1 from public.actividad_preguntas p where p.id = pregunta_id and privado.puede_editar_actividad(p.actividad_id)));

-- Entregas: tabla para docentes y gestión. Estudiantes y familias leen por
-- entregas_de_estudiante (nota solo publicada) y escriben por entregar_actividad.
create policy entregas_docente on public.entregas for select to authenticated using (
  (select privado.es_gestion())
  or exists (select 1 from public.actividades a where a.id = actividad_id and privado.es_docente_de_comision(a.comision_id))
);

-- Banco de ejercicios: docentes y gestión. Los estudiantes no leen la tabla
-- (tiene las respuestas): practican con siguiente_leccion / responder_ejercicio.
create policy ejercicios_lectura on public.ejercicios for select to authenticated
  using ((select privado.es_gestion()) or (select privado.tiene_rol('docente')));
create policy ejercicios_alta on public.ejercicios for insert to authenticated with check (
  ((select privado.es_gestion()) or (select privado.tiene_rol('docente'))) and creado_por = (select auth.uid()));
create policy ejercicios_edicion on public.ejercicios for update to authenticated
  using ((select privado.es_gestion()) or (select privado.tiene_rol('docente')))
  with check ((select privado.es_gestion()) or (select privado.tiene_rol('docente')));

create policy medallas_lectura on public.medallas for select to anon, authenticated using (true);
-- intentos, progreso y medallas obtenidas: solo por funciones (sin políticas para usuarios).

create policy alertas_lectura on public.alertas for select to authenticated using (
  (select privado.es_gestion()) or privado.es_docente_de_comision(comision_id));
create policy alertas_edicion on public.alertas for update to authenticated
  using ((select privado.es_gestion()) or privado.es_docente_de_comision(comision_id))
  with check ((select privado.es_gestion()) or privado.es_docente_de_comision(comision_id));

create policy informes_lectura on public.informes for select to authenticated using (
  (select privado.es_direccion())
  or autor_cuenta_id = (select auth.uid())
  or (estado = 'enviado' and destinatario = 'familia'
      and (privado.es_responsable_de(estudiante_id, 'academico') or privado.es_el_estudiante(estudiante_id)))
);
create policy informes_alta on public.informes for insert to authenticated with check (
  autor_cuenta_id = (select auth.uid())
  and ((select privado.es_gestion()) or privado.es_docente_del_estudiante(estudiante_id)));
create policy informes_edicion on public.informes for update to authenticated
  using (autor_cuenta_id = (select auth.uid()) and estado = 'borrador')
  with check (autor_cuenta_id = (select auth.uid()));

create policy evaluaciones_lectura on public.evaluaciones_docentes for select to authenticated using (
  (select privado.es_direccion()) or (compartida and docente_persona_id = (select privado.persona_actual())));
create policy evaluaciones_alta on public.evaluaciones_docentes for insert to authenticated with check (
  (select privado.es_direccion()) and evaluador_cuenta_id = (select auth.uid()));
create policy evaluaciones_edicion on public.evaluaciones_docentes for update to authenticated
  using ((select privado.es_direccion())) with check ((select privado.es_direccion()));

-- Mensajería: participantes. Dirección puede ver conversaciones sobre un
-- estudiante (supervisión del canal docente–familia), regla documentada.
create policy hilos_lectura on public.hilos for select to authenticated using (
  privado.es_participante(id) or (estudiante_id is not null and (select privado.es_direccion())));
create policy participantes_lectura on public.hilo_participantes for select to authenticated using (
  privado.es_participante(hilo_id)
  or exists (select 1 from public.hilos h where h.id = hilo_id and h.estudiante_id is not null and privado.es_direccion()));
create policy mensajes_lectura on public.mensajes for select to authenticated using (
  privado.es_participante(hilo_id)
  or exists (select 1 from public.hilos h where h.id = hilo_id and h.estudiante_id is not null and privado.es_direccion()));

create policy sitio_lectura on public.sitio_contenido for select to anon, authenticated using (true);
create policy sitio_alta on public.sitio_contenido for insert to authenticated with check ((select privado.es_gestion()));
create policy sitio_edicion on public.sitio_contenido for update to authenticated
  using ((select privado.es_gestion())) with check ((select privado.es_gestion()));
