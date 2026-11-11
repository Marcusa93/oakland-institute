-- =====================================================================
-- 10 · Ajustes de Oakland AI y perfiles
-- 1. Los textos de ayuda son cortos: se devuelven enteros, no cortados.
-- 2. Quien paga solo su propia cuota no es "familia": el perfil tutor por
--    responsable de pago exige pagar la matrícula de OTRA persona.
-- =====================================================================

create or replace function public.buscar_ayuda(p_consulta text, p_limite int default 4)
returns table (id uuid, slug text, titulo text, fragmento text, relevancia real)
language sql stable security invoker set search_path = '' as $$
  with entrada as (
    select nullif(btrim(regexp_replace(lower(left(coalesce(p_consulta, ''), 300)), '[^[:alnum:]áéíóúüñ]+', ' ', 'g')), '') as texto
  ), consulta as (
    select websearch_to_tsquery('spanish'::regconfig, replace(e.texto, ' ', ' or ')) as q
    from entrada e where e.texto is not null
  )
  select d.id, d.slug, d.titulo,
         ts_headline('spanish'::regconfig, d.contenido, c.q, 'MaxWords=160, MinWords=90, StartSel=«, StopSel=»'),
         ts_rank_cd(d.busqueda, c.q, 1)
  from public.documentos_ayuda d, consulta c
  where d.busqueda @@ c.q
  order by ts_rank_cd(d.busqueda, c.q, 1) desc
  limit least(greatest(coalesce(p_limite, 4), 1), 8);
$$;

grant execute on function public.buscar_ayuda(text, int) to anon, authenticated, service_role;

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
        union
        select 'tutor' where exists (
          select 1 from public.matriculas_pago mp
          join public.matriculas m on m.id = mp.matricula_id
          join public.estudiantes e on e.id = m.estudiante_id
          where mp.responsable_pago_persona_id = privado.persona_actual()
            and e.persona_id <> privado.persona_actual())
      ) t
    ), array[]::text[])
  end;
$$;
