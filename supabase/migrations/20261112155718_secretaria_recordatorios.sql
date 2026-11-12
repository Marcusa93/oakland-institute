-- =====================================================================
-- Secretaría · recordatorios de cuotas
-- Quién recibió un recordatorio, de qué obligación y por qué canal. Sirve
-- para no insistir dos veces el mismo día y para saber a quién falta avisar.
-- Por WhatsApp el mensaje lo manda la persona de secretaría desde su
-- teléfono (wa.me): acá solo queda registrado. En la app se envía un aviso
-- económico individual al responsable de pago.
-- =====================================================================

create type public.motivo_recordatorio as enum ('por_vencer', 'vencida');

create table public.recordatorios_cobro (
  id uuid primary key default gen_random_uuid(),
  responsable_persona_id uuid not null references public.personas (id),
  obligacion_id uuid not null references public.obligaciones (id) on delete cascade,
  canal public.canal not null check (canal in ('interno', 'whatsapp')),
  motivo public.motivo_recordatorio not null,
  saldo numeric(14, 2) not null check (saldo > 0),
  comunicacion_id uuid references public.comunicaciones (id) on delete set null,
  enviado_por uuid references public.cuentas (id) default auth.uid(),
  enviado_en timestamptz not null default now()
);
create index recordatorios_cobro_responsable_idx on public.recordatorios_cobro (responsable_persona_id, enviado_en desc);
create index recordatorios_cobro_obligacion_idx on public.recordatorios_cobro (obligacion_id);

alter table public.recordatorios_cobro enable row level security;
create policy recordatorios_lectura on public.recordatorios_cobro for select to authenticated
  using ((select privado.es_gestion()));
-- Sin políticas de escritura: solo se registran con recordar_deuda().

-- "$ 45.000" o "$ 45.000,50"
create or replace function privado.pesos_texto(p numeric)
returns text language sql immutable set search_path = '' as $$
  select '$ ' || replace(to_char(trunc(p), 'FM999,999,999,990'), ',', '.')
    || case when p <> trunc(p) then ',' || lpad(((p - trunc(p)) * 100)::int::text, 2, '0') else '' end;
$$;

/**
 * Registra (y en la app, envía) un recordatorio al responsable de pago con
 * todo lo que tiene vencido o por vencer en los próximos p_dias días.
 * Devuelve cuántas obligaciones incluyó.
 */
create or replace function privado.recordar_deuda(p_persona uuid, p_canal public.canal, p_dias int default 5)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_hoy date := privado.hoy();
  v_nombre text;
  v_lineas text;
  v_total numeric;
  v_vencida boolean;
  v_comunicacion uuid;
  v_n int;
begin
  perform privado.exigir(privado.es_gestion());
  if p_canal not in ('interno', 'whatsapp') then
    raise exception 'CANAL_INVALIDO' using errcode = 'P0001';
  end if;
  if p_dias is null or p_dias not between 0 and 31 then
    raise exception 'DIAS_INVALIDOS' using errcode = 'P0001';
  end if;

  create temp table if not exists _deuda (obligacion_id uuid, descripcion text, estudiante text, saldo numeric, vencimiento date) on commit drop;
  truncate _deuda;
  insert into _deuda
  select s.obligacion_id, o.descripcion, coalesce(pe.nombre_preferido, split_part(pe.nombres, ' ', 1)), s.saldo, s.vencimiento
  from public.obligaciones_saldo s
  join public.obligaciones o on o.id = s.obligacion_id
  join public.estudiantes e on e.id = o.estudiante_id
  join public.personas pe on pe.id = e.persona_id
  where s.responsable_pago_persona_id = p_persona
    and s.estado in ('pendiente', 'parcial') and s.saldo > 0
    and s.vencimiento <= v_hoy + p_dias;

  select count(*), sum(saldo), bool_or(vencimiento < v_hoy) into v_n, v_total, v_vencida from _deuda;
  if v_n = 0 then
    raise exception 'SIN_DEUDA' using errcode = 'P0001';
  end if;

  if p_canal = 'interno' then
    select coalesce(nombre_preferido, split_part(nombres, ' ', 1)) into v_nombre from public.personas where id = p_persona;
    select string_agg(
             '• ' || descripcion || ' (' || estudiante || '): ' || privado.pesos_texto(saldo)
             || case when vencimiento < v_hoy then ', venció el ' else ', vence el ' end
             || to_char(vencimiento, 'DD/MM'),
             E'\n' order by vencimiento)
      into v_lineas from _deuda;
    insert into public.comunicaciones (tipo, categoria, asunto, cuerpo, autor_cuenta_id)
    values ('individual', 'economica',
            case when v_vencida then 'Tenés un pago pendiente' else 'Se acerca el vencimiento de la cuota' end,
            'Hola, ' || coalesce(v_nombre, '') || E'.\n\n'
            || case when v_vencida then E'Te recordamos que hay pagos pendientes:\n' else E'Te recordamos lo que vence en los próximos días:\n' end
            || v_lineas || E'\n\nTotal: ' || privado.pesos_texto(v_total)
            || E'.\n\nPodés pagar en el instituto o por transferencia, e informar el comprobante en «Cuenta y pagos». Si ya pagaste, no hace falta que hagas nada: lo vamos a registrar.\n\nGracias, Oakland Institute.',
            (select auth.uid()))
    returning id into v_comunicacion;
    perform privado.enviar_comunicacion(v_comunicacion, array[p_persona]);
  end if;

  insert into public.recordatorios_cobro (responsable_persona_id, obligacion_id, canal, motivo, saldo, comunicacion_id)
  select p_persona, d.obligacion_id, p_canal,
         case when d.vencimiento < v_hoy then 'vencida' else 'por_vencer' end::public.motivo_recordatorio,
         d.saldo, v_comunicacion
  from _deuda d;
  return v_n;
end;
$$;

/**
 * Aviso en la app a cada responsable con cuotas VENCIDAS que no recibió un
 * recordatorio (por ningún canal) en los últimos p_dias_pausa días.
 * Devuelve a cuántas personas se avisó.
 */
create or replace function privado.recordar_vencidas(p_dias_pausa int default 7)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_persona uuid;
  v_n int := 0;
begin
  perform privado.exigir(privado.es_gestion());
  for v_persona in
    select distinct s.responsable_pago_persona_id
    from public.obligaciones_saldo s
    where s.estado in ('pendiente', 'parcial') and s.saldo > 0 and s.vencimiento < privado.hoy()
      and not exists (
        select 1 from public.recordatorios_cobro r
        where r.responsable_persona_id = s.responsable_pago_persona_id
          and r.enviado_en > now() - make_interval(days => greatest(p_dias_pausa, 1)))
  loop
    perform privado.recordar_deuda(v_persona, 'interno', 0);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

create or replace function public.recordar_deuda(p_persona uuid, p_canal public.canal, p_dias int default 5)
returns int language sql security invoker set search_path = '' as $$ select privado.recordar_deuda(p_persona, p_canal, p_dias); $$;
create or replace function public.recordar_vencidas(p_dias_pausa int default 7)
returns int language sql security invoker set search_path = '' as $$ select privado.recordar_vencidas(p_dias_pausa); $$;

grant select on public.recordatorios_cobro to authenticated;
grant all on public.recordatorios_cobro to service_role;

revoke execute on function
  privado.pesos_texto(numeric), privado.recordar_deuda(uuid, public.canal, int), privado.recordar_vencidas(int),
  public.recordar_deuda(uuid, public.canal, int), public.recordar_vencidas(int)
from public, anon;
grant execute on function
  privado.pesos_texto(numeric), privado.recordar_deuda(uuid, public.canal, int), privado.recordar_vencidas(int),
  public.recordar_deuda(uuid, public.canal, int), public.recordar_vencidas(int)
to authenticated, service_role;
