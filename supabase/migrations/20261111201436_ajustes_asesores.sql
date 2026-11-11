-- =====================================================================
-- 08 · Ajustes pedidos por los asesores de Supabase
-- 1. btree_gist fuera del esquema público.
-- 2. Sin tipo de rango propio: los horarios se comparan con tsrange sobre
--    una fecha fija (evita funciones públicas sin search_path fijo).
-- 3. Una política por acción: las de escritura "for all" también aplicaban
--    a SELECT y duplicaban el trabajo de la política de lectura.
-- 4. La política pública de consultas verifica lo que deja el disparador.
-- =====================================================================

-- 1 -------------------------------------------------------------------
create schema if not exists extensions;
alter extension btree_gist set schema extensions;

-- 2 -------------------------------------------------------------------
create or replace function privado.franja(p_inicio time, p_fin time)
returns tsrange language sql immutable set search_path = '' as $$
  select tsrange(date '2000-01-03' + p_inicio, date '2000-01-03' + p_fin);
$$;
grant execute on function privado.franja(time, time) to authenticated, service_role;

alter table public.comision_horarios drop constraint aula_sin_superposicion;
alter table public.comision_horarios add constraint aula_sin_superposicion exclude using gist (
  aula_id with =,
  dia_semana with =,
  privado.franja(hora_inicio, hora_fin) with &&,
  vigencia with &&
) where (aula_id is not null);

create or replace function privado.conflictos_docente(p_docente uuid, p_comision uuid)
returns table (comision_en_conflicto uuid, dia_semana int, hora_inicio time, hora_fin time)
language sql stable set search_path = '' as $$
  select h2.comision_id, h2.dia_semana, h2.hora_inicio, h2.hora_fin
  from public.comision_horarios h1
  join public.comision_horarios h2
    on h2.comision_id <> h1.comision_id
   and h2.dia_semana = h1.dia_semana
   and privado.franja(h2.hora_inicio, h2.hora_fin) && privado.franja(h1.hora_inicio, h1.hora_fin)
   and h2.vigencia && h1.vigencia
  join public.comision_docentes d2
    on d2.comision_id = h2.comision_id
   and d2.docente_persona_id = p_docente
   and d2.hasta is null
  where h1.comision_id = p_comision;
$$;

drop type public.timerange;

-- 3 -------------------------------------------------------------------
-- Donde una tabla tiene política de lectura propia, la "for all" se parte
-- en insert / update / delete con las mismas condiciones.
do $$
declare
  p record;
  v_using text;
  v_check text;
begin
  for p in
    select pol.tablename, pol.policyname, pol.roles, pol.qual, pol.with_check
    from pg_policies pol
    where pol.schemaname = 'public' and pol.cmd = 'ALL'
      and exists (
        select 1 from pg_policies s
        where s.schemaname = 'public' and s.tablename = pol.tablename and s.cmd = 'SELECT')
  loop
    v_using := coalesce(p.qual, 'true');
    v_check := coalesce(p.with_check, v_using);
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)',
                   p.policyname || '_alta', p.tablename, v_check);
    execute format('create policy %I on public.%I for update to authenticated using (%s) with check (%s)',
                   p.policyname || '_edicion', p.tablename, v_using, v_check);
    execute format('create policy %I on public.%I for delete to authenticated using (%s)',
                   p.policyname || '_baja', p.tablename, v_using);
  end loop;
end $$;

-- 4 -------------------------------------------------------------------
-- El disparador consultas_limite ya limpió los campos de seguimiento antes
-- de este control; la política confirma que una consulta pública nace limpia.
drop policy consultas_publicas on public.consultas;
create policy consultas_publicas on public.consultas for insert to anon with check (
  estado = 'nueva'
  and origen = 'web'
  and responsable_cuenta_id is null
  and persona_contacto_id is null
  and estudiante_id is null
);
