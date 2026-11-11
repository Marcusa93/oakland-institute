-- =====================================================================
-- 09 · Búsqueda de ayuda tolerante a preguntas en lenguaje natural
-- Antes exigía que aparecieran TODAS las palabras de la pregunta. Ahora
-- alcanza con cualquiera (sin las vacías del español) y ordena por
-- relevancia, con más peso al título. La RLS sigue filtrando por audiencia.
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
         ts_headline('spanish'::regconfig, d.contenido, c.q, 'MaxWords=70, MinWords=30, StartSel=«, StopSel=»'),
         ts_rank_cd(d.busqueda, c.q, 1)
  from public.documentos_ayuda d, consulta c
  where d.busqueda @@ c.q
  order by ts_rank_cd(d.busqueda, c.q, 1) desc
  limit least(greatest(coalesce(p_limite, 4), 1), 8);
$$;

grant execute on function public.buscar_ayuda(text, int) to anon, authenticated, service_role;
