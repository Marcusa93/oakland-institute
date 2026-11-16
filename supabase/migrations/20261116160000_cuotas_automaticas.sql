-- =====================================================================
-- Cuotas automáticas
--
-- La tarea diaria genera las cuotas del mes una sola vez por mes. Para que
-- no repita un mes que administración ya generó a mano (y vuelva a crear
-- una cuota que alguien anuló a propósito), la generación manual también
-- queda registrada en tareas_ejecutadas.
-- =====================================================================

create or replace function privado.generar_cuotas(p_periodo date, p_dia_vencimiento int)
returns int language plpgsql security definer set search_path = '' as $$
declare v_n int;
begin
  perform privado.exigir(privado.es_gestion());
  v_n := privado.generar_cuotas_interno(p_periodo, p_dia_vencimiento, (select auth.uid()));
  insert into public.tareas_ejecutadas (tarea, clave, resultado)
  values ('generar_cuotas', to_char(p_periodo, 'YYYY-MM'), jsonb_build_object('generadas', v_n, 'manual', true))
  on conflict (tarea, clave) do update set ejecutada_en = now(), resultado = excluded.resultado;
  return v_n;
end;
$$;

-- La tarea programada no vuelve a correr un mes ya generado (a mano o sola).
create or replace function public.generar_cuotas_programada(p_periodo date, p_dia_vencimiento int default 10)
returns int language plpgsql security invoker set search_path = '' as $$
declare v_n int;
begin
  if exists (select 1 from public.tareas_ejecutadas
             where tarea = 'generar_cuotas' and clave = to_char(p_periodo, 'YYYY-MM')) then
    return 0;
  end if;
  v_n := privado.generar_cuotas_interno(p_periodo, p_dia_vencimiento, null);
  insert into public.tareas_ejecutadas (tarea, clave, resultado)
  values ('generar_cuotas', to_char(p_periodo, 'YYYY-MM'), jsonb_build_object('generadas', v_n))
  on conflict (tarea, clave) do update set ejecutada_en = now(), resultado = excluded.resultado;
  return v_n;
end;
$$;
