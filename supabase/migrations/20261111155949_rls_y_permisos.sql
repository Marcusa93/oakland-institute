-- =====================================================================
-- 07 · Permisos de tabla, RLS y Storage
--
-- Regla: se revoca todo y se concede lo mínimo. RLS decide las filas.
-- Las tablas con invariantes (matrículas, pagos, imputaciones, obligaciones,
-- vínculos, roles, reservas, ajustes) son de SOLO LECTURA para los usuarios:
-- se escriben únicamente con las funciones de 06.
-- Cada migración futura debe conceder permisos de forma explícita.
-- =====================================================================

-- Obligaciones manuales (derecho de examen, materiales, cursos especiales).
create or replace function privado.crear_obligacion(
  p_estudiante uuid, p_responsable_pago uuid, p_concepto uuid, p_descripcion text,
  p_importe numeric, p_vencimiento date, p_matricula uuid default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform privado.exigir(privado.es_gestion());
  if p_importe is null or p_importe <= 0 then
    raise exception 'IMPORTE_INVALIDO' using errcode = 'P0001';
  end if;
  insert into public.obligaciones (estudiante_id, matricula_id, responsable_pago_persona_id, concepto_id,
    descripcion, importe_original, vencimiento, creada_por)
  values (p_estudiante, p_matricula, p_responsable_pago, p_concepto, p_descripcion, p_importe, p_vencimiento,
    (select auth.uid()))
  returning id into v_id;
  return v_id;
end;
$$;
create or replace function public.crear_obligacion(
  p_estudiante uuid, p_responsable_pago uuid, p_concepto uuid, p_descripcion text,
  p_importe numeric, p_vencimiento date, p_matricula uuid default null)
returns uuid language sql security invoker set search_path = '' as $$
  select privado.crear_obligacion(p_estudiante, p_responsable_pago, p_concepto, p_descripcion, p_importe, p_vencimiento, p_matricula);
$$;

-- Docente visible: dicta una comisión donde curso yo o un estudiante a mi cargo.
create or replace function privado.es_docente_visible(p_persona uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.comision_docentes d
    join public.matriculas m on m.comision_id = d.comision_id and m.estado = 'activa'
    join public.estudiantes e on e.id = m.estudiante_id
    where d.docente_persona_id = p_persona and d.hasta is null
      and (e.persona_id = privado.persona_actual() or privado.es_responsable_de(e.id, 'academico'))
  );
$$;

create or replace function privado.estudiante_de_persona(p_persona uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select e.id from public.estudiantes e where e.persona_id = p_persona;
$$;

create or replace function privado.puede_ver_documento(p_documento uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.documentos d
    where d.id = p_documento and d.eliminado_en is null and (
      privado.es_gestion()
      or (d.tipo <> 'comprobante_gasto' and d.persona_id = privado.persona_actual())
      or (d.estudiante_id is not null and d.tipo <> 'comprobante_gasto' and (
            privado.es_el_estudiante(d.estudiante_id)
            or privado.es_responsable_de(d.estudiante_id, 'documental')))
    )
  );
$$;

-- Auxiliares para evitar recursión entre políticas de comunicaciones y envíos.
create or replace function privado.es_destinatario(p_comunicacion uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.comunicacion_envios e
    where e.comunicacion_id = p_comunicacion and e.destinatario_persona_id = privado.persona_actual());
$$;
create or replace function privado.es_autor_comunicacion(p_comunicacion uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.comunicaciones c
    where c.id = p_comunicacion and c.autor_cuenta_id = (select auth.uid()));
$$;

-- ---------------------------------------------------------------------
-- Permisos base
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema privado from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
alter default privileges in schema privado revoke execute on functions from anon, authenticated;

grant usage on schema privado to anon, authenticated, service_role;
grant execute on all functions in schema privado to authenticated, service_role;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Funciones internas que NO deben poder invocarse con sesión de usuario.
revoke execute on function privado.generar_cuotas_interno(date, int, uuid) from authenticated;
revoke execute on function privado.imputar_interno(uuid, uuid, numeric, uuid) from authenticated;
revoke execute on function privado.recalcular_obligacion(uuid) from authenticated;
revoke execute on function privado.bloquear_comision(uuid) from authenticated;

-- Constructor del tipo de rango horario (lo usa la restricción de aulas).
grant execute on function public.timerange(time, time), public.timerange(time, time, text) to authenticated;

-- Visitantes: solo lo necesario para la landing.
grant execute on function privado.persona_actual() to anon;
grant execute on function privado.tiene_rol(public.rol_personal) to anon;
grant execute on function privado.es_gestion() to anon;
grant execute on function privado.es_direccion() to anon;
grant execute on function privado.perfiles_actuales() to anon;
grant execute on function privado.oferta_publicada() to anon;
grant execute on function public.oferta_publicada() to anon, authenticated;
grant execute on function public.buscar_ayuda(text, int) to anon, authenticated;

grant execute on function
  public.mi_contexto(),
  public.otorgar_rol(uuid, public.rol_personal),
  public.revocar_rol(uuid, public.rol_personal),
  public.invitar_responsable(uuid, uuid, text),
  public.responder_vinculo(uuid, boolean),
  public.verificar_vinculo(uuid, boolean, boolean, boolean, boolean, boolean),
  public.revocar_vinculo(uuid, text),
  public.reservar_vacante(uuid, uuid, int),
  public.cancelar_reserva(uuid),
  public.confirmar_inscripcion(uuid, uuid, uuid, uuid),
  public.dar_de_baja_matricula(uuid, text),
  public.cambiar_comision(uuid, uuid, text),
  public.generar_cuotas(date, int),
  public.registrar_pago(uuid, public.medio_pago, numeric, date, boolean, jsonb, text, uuid),
  public.informar_transferencia(numeric, date, uuid, text),
  public.validar_pago(uuid, boolean, text),
  public.imputar_pago(uuid, uuid, numeric),
  public.reversar_pago(uuid, text),
  public.registrar_devolucion(uuid, numeric, text),
  public.anular_obligacion(uuid, text),
  public.crear_obligacion(uuid, uuid, uuid, text, numeric, date, uuid),
  public.enviar_comunicacion(uuid, uuid[]),
  public.marcar_leida(uuid),
  public.registrar_uso_asistente(),
  public.tablero_direccion(date, date)
to authenticated;
-- public.procesar_evento_pasarela y public.generar_cuotas_programada: solo service_role.

-- Lectura (RLS filtra filas)
grant select on
  public.sedes, public.personas, public.personas_datos, public.cuentas, public.roles_asignados,
  public.estudiantes, public.vinculos_responsables, public.auditoria,
  public.ciclos_lectivos, public.niveles, public.cursos, public.aulas, public.comisiones,
  public.comision_docentes, public.comision_horarios, public.clases, public.matriculas,
  public.matriculas_pago, public.reservas_vacante, public.lista_espera, public.asistencias, public.observaciones_estudiante,
  public.versiones_consentimiento, public.consentimientos, public.consultas, public.consulta_eventos,
  public.nivelaciones, public.solicitudes_inscripcion,
  public.conceptos, public.aranceles, public.beneficios, public.beneficios_otorgados,
  public.obligaciones, public.pagos, public.imputaciones, public.ajustes, public.eventos_pasarela,
  public.obligaciones_saldo, public.pagos_saldo, public.comisiones_ocupacion,
  public.proveedores, public.categorias_gasto, public.gastos, public.pagos_docentes,
  public.comunicaciones, public.comunicacion_envios, public.preferencias_notificacion,
  public.documentos, public.documentos_ayuda, public.asistente_uso, public.asistente_limites,
  public.tareas_ejecutadas
to authenticated;
grant update on public.asistente_limites to authenticated;

-- Escritura directa (sin invariantes transaccionales; RLS filtra quién)
grant insert, update on
  public.sedes, public.personas, public.personas_datos, public.estudiantes,
  public.ciclos_lectivos, public.niveles, public.cursos, public.aulas, public.comisiones,
  public.comision_docentes, public.comision_horarios, public.clases, public.lista_espera,
  public.asistencias, public.consultas, public.nivelaciones, public.solicitudes_inscripcion,
  public.conceptos, public.aranceles, public.beneficios, public.beneficios_otorgados,
  public.proveedores, public.categorias_gasto, public.gastos, public.pagos_docentes,
  public.comunicaciones, public.preferencias_notificacion, public.documentos, public.documentos_ayuda
to authenticated;
grant insert on public.observaciones_estudiante, public.consulta_eventos,
  public.versiones_consentimiento, public.consentimientos to authenticated;
grant delete on public.comision_horarios, public.comision_docentes, public.clases to authenticated;

-- El legajo se numera con esta secuencia al dar de alta un estudiante.
grant usage on sequence public.estudiantes_legajo_seq to authenticated;

-- Visitantes
grant insert on public.consultas to anon;
grant select on public.versiones_consentimiento, public.documentos_ayuda to anon;

-- ---------------------------------------------------------------------
-- RLS: activada en TODAS las tablas del esquema público
-- ---------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
  end loop;
end $$;

-- Atajo de lectura: (select ...) evalúa la función una vez por consulta.

-- Identidad ------------------------------------------------------------
create policy sedes_lectura on public.sedes for select to authenticated using (true);
create policy sedes_escritura on public.sedes for all to authenticated
  using ((select privado.es_direccion())) with check ((select privado.es_direccion()));

create policy personas_lectura on public.personas for select to authenticated using (
  (select privado.es_gestion())
  or id = (select privado.persona_actual())
  or privado.es_docente_del_estudiante(privado.estudiante_de_persona(id))
  or privado.es_responsable_de(privado.estudiante_de_persona(id), 'cualquiera')
  or privado.es_docente_visible(id)
);
create policy personas_alta on public.personas for insert to authenticated
  with check ((select privado.es_gestion()));
create policy personas_edicion on public.personas for update to authenticated
  using ((select privado.es_gestion())) with check ((select privado.es_gestion()));

-- Datos sensibles: nunca docentes.
create policy personas_datos_lectura on public.personas_datos for select to authenticated using (
  (select privado.es_gestion())
  or persona_id = (select privado.persona_actual())
  or privado.es_responsable_de(privado.estudiante_de_persona(persona_id), 'documental')
);
create policy personas_datos_alta on public.personas_datos for insert to authenticated
  with check ((select privado.es_gestion()));
create policy personas_datos_edicion on public.personas_datos for update to authenticated
  using ((select privado.es_gestion())) with check ((select privado.es_gestion()));

create policy cuentas_lectura on public.cuentas for select to authenticated
  using ((select privado.es_gestion()) or id = (select auth.uid()));
create policy roles_lectura on public.roles_asignados for select to authenticated
  using ((select privado.es_gestion()) or cuenta_id = (select auth.uid()));

create policy estudiantes_lectura on public.estudiantes for select to authenticated using (
  (select privado.es_gestion())
  or persona_id = (select privado.persona_actual())
  or privado.es_responsable_de(id, 'cualquiera')
  or privado.es_docente_del_estudiante(id)
);
create policy estudiantes_alta on public.estudiantes for insert to authenticated
  with check ((select privado.es_gestion()));
create policy estudiantes_edicion on public.estudiantes for update to authenticated
  using ((select privado.es_gestion())) with check ((select privado.es_gestion()));

create policy vinculos_lectura on public.vinculos_responsables for select to authenticated using (
  (select privado.es_gestion())
  or responsable_persona_id = (select privado.persona_actual())
);

create policy auditoria_lectura on public.auditoria for select to authenticated
  using ((select privado.es_direccion()));

-- Académico ------------------------------------------------------------
create policy ciclos_lectura on public.ciclos_lectivos for select to authenticated using (true);
create policy ciclos_escritura on public.ciclos_lectivos for all to authenticated
  using ((select privado.es_gestion())) with check ((select privado.es_gestion()));
create policy niveles_lectura on public.niveles for select to authenticated using (true);
create policy niveles_escritura on public.niveles for all to authenticated
  using ((select privado.es_gestion())) with check ((select privado.es_gestion()));
create policy cursos_lectura on public.cursos for select to authenticated using (true);
create policy cursos_escritura on public.cursos for all to authenticated
  using ((select privado.es_gestion())) with check ((select privado.es_gestion()));
create policy aulas_lectura on public.aulas for select to authenticated using (true);
create policy aulas_escritura on public.aulas for all to authenticated
  using ((select privado.es_gestion())) with check ((select privado.es_gestion()));
create policy comisiones_lectura on public.comisiones for select to authenticated using (true);
create policy comisiones_escritura on public.comisiones for all to authenticated
  using ((select privado.es_gestion())) with check ((select privado.es_gestion()));
create policy comision_docentes_lectura on public.comision_docentes for select to authenticated using (
  (select privado.es_gestion()) or (select privado.tiene_rol('docente')) or privado.participa_en_comision(comision_id)
);
create policy comision_docentes_escritura on public.comision_docentes for all to authenticated
  using ((select privado.es_gestion())) with check ((select privado.es_gestion()));
create policy comision_horarios_lectura on public.comision_horarios for select to authenticated using (true);
create policy comision_horarios_escritura on public.comision_horarios for all to authenticated
  using ((select privado.es_gestion())) with check ((select privado.es_gestion()));

create policy clases_lectura on public.clases for select to authenticated using (
  (select privado.es_gestion()) or privado.participa_en_comision(comision_id)
);
create policy clases_escritura on public.clases for all to authenticated
  using ((select privado.es_gestion()) or privado.es_docente_de_comision(comision_id))
  with check ((select privado.es_gestion()) or privado.es_docente_de_comision(comision_id));

create policy matriculas_lectura on public.matriculas for select to authenticated using (
  (select privado.es_gestion())
  or privado.es_docente_de_comision(comision_id)
  or privado.es_el_estudiante(estudiante_id)
  or privado.es_responsable_de(estudiante_id, 'academico')
);
-- Quién paga y en qué condiciones: nunca docentes.
create policy matriculas_pago_lectura on public.matriculas_pago for select to authenticated using (
  (select privado.es_gestion())
  or responsable_pago_persona_id = (select privado.persona_actual())
  or exists (select 1 from public.matriculas m where m.id = matricula_id
             and privado.es_responsable_de(m.estudiante_id, 'economico'))
);
create policy reservas_lectura on public.reservas_vacante for select to authenticated
  using ((select privado.es_gestion()));
create policy lista_espera_gestion on public.lista_espera for all to authenticated
  using ((select privado.es_gestion())) with check ((select privado.es_gestion()));

create policy asistencias_lectura on public.asistencias for select to authenticated using (
  (select privado.es_gestion())
  or exists (select 1 from public.clases c where c.id = clase_id and privado.es_docente_de_comision(c.comision_id))
  or exists (select 1 from public.matriculas m where m.id = matricula_id
             and (privado.es_el_estudiante(m.estudiante_id) or privado.es_responsable_de(m.estudiante_id, 'academico')))
);
create policy asistencias_alta on public.asistencias for insert to authenticated with check (
  (select privado.es_gestion())
  or exists (select 1 from public.clases c where c.id = clase_id and privado.es_docente_de_comision(c.comision_id))
);
create policy asistencias_edicion on public.asistencias for update to authenticated
  using ((select privado.es_gestion())
    or exists (select 1 from public.clases c where c.id = clase_id and privado.es_docente_de_comision(c.comision_id)))
  with check ((select privado.es_gestion())
    or exists (select 1 from public.clases c where c.id = clase_id and privado.es_docente_de_comision(c.comision_id)));

-- Observaciones: visibilidad diferenciada.
create policy observaciones_lectura on public.observaciones_estudiante for select to authenticated using (
  (select privado.es_gestion())
  or (visibilidad in ('docentes', 'familia') and privado.es_docente_del_estudiante(estudiante_id))
  or (visibilidad = 'familia' and (privado.es_el_estudiante(estudiante_id)
                                   or privado.es_responsable_de(estudiante_id, 'academico')))
);
create policy observaciones_alta on public.observaciones_estudiante for insert to authenticated with check (
  autor_cuenta_id = (select auth.uid()) and (
    (select privado.es_gestion())
    or (visibilidad in ('docentes', 'familia') and privado.es_docente_del_estudiante(estudiante_id))
  )
);

-- Captación --------------------------------------------------------------
create policy consultas_publicas on public.consultas for insert to anon with check (true);
create policy consultas_gestion_alta on public.consultas for insert to authenticated
  with check ((select privado.es_gestion()));
create policy consultas_lectura on public.consultas for select to authenticated
  using ((select privado.es_gestion()));
create policy consultas_edicion on public.consultas for update to authenticated
  using ((select privado.es_gestion())) with check ((select privado.es_gestion()));
create policy consulta_eventos_lectura on public.consulta_eventos for select to authenticated
  using ((select privado.es_gestion()));
create policy consulta_eventos_alta on public.consulta_eventos for insert to authenticated
  with check ((select privado.es_gestion()) and autor_cuenta_id = (select auth.uid()) and tipo in ('nota', 'contacto'));
create policy nivelaciones_gestion on public.nivelaciones for all to authenticated
  using ((select privado.es_gestion())) with check ((select privado.es_gestion()));
create policy solicitudes_gestion on public.solicitudes_inscripcion for all to authenticated
  using ((select privado.es_gestion())) with check ((select privado.es_gestion()));

create policy versiones_consentimiento_lectura on public.versiones_consentimiento for select
  to anon, authenticated using (true);
create policy versiones_consentimiento_alta on public.versiones_consentimiento for insert to authenticated
  with check ((select privado.es_direccion()));
create policy consentimientos_lectura on public.consentimientos for select to authenticated
  using ((select privado.es_gestion()) or persona_id = (select privado.persona_actual()));
create policy consentimientos_alta on public.consentimientos for insert to authenticated
  with check ((select privado.es_gestion()) or persona_id = (select privado.persona_actual()));

-- Finanzas: los docentes no aparecen en ninguna de estas políticas ------
create policy conceptos_lectura on public.conceptos for select to authenticated
  using ((select privado.es_gestion()));
create policy conceptos_escritura on public.conceptos for all to authenticated
  using ((select privado.es_direccion())) with check ((select privado.es_direccion()));
-- Precios y beneficios: decisión de dirección.
create policy aranceles_lectura on public.aranceles for select to authenticated
  using ((select privado.es_gestion()));
create policy aranceles_escritura on public.aranceles for all to authenticated
  using ((select privado.es_direccion())) with check ((select privado.es_direccion()));
create policy beneficios_lectura on public.beneficios for select to authenticated
  using ((select privado.es_gestion()));
create policy beneficios_escritura on public.beneficios for all to authenticated
  using ((select privado.es_direccion())) with check ((select privado.es_direccion()));
create policy beneficios_otorgados_lectura on public.beneficios_otorgados for select to authenticated
  using ((select privado.es_gestion()));
create policy beneficios_otorgados_escritura on public.beneficios_otorgados for all to authenticated
  using ((select privado.es_direccion()))
  with check ((select privado.es_direccion()) and aprobado_por = (select auth.uid()));

create policy obligaciones_lectura on public.obligaciones for select to authenticated using (
  (select privado.es_gestion())
  or responsable_pago_persona_id = (select privado.persona_actual())
  or privado.es_responsable_de(estudiante_id, 'economico')
);
create policy pagos_lectura on public.pagos for select to authenticated using (
  (select privado.es_gestion())
  or pagador_persona_id = (select privado.persona_actual())
);
create policy imputaciones_lectura on public.imputaciones for select to authenticated using (
  (select privado.es_gestion())
  or exists (select 1 from public.pagos p where p.id = pago_id
             and p.pagador_persona_id = (select privado.persona_actual()))
  or exists (select 1 from public.obligaciones o where o.id = obligacion_id
             and (o.responsable_pago_persona_id = (select privado.persona_actual())
                  or privado.es_responsable_de(o.estudiante_id, 'economico')))
);
create policy ajustes_lectura on public.ajustes for select to authenticated
  using ((select privado.es_gestion()));
create policy eventos_pasarela_lectura on public.eventos_pasarela for select to authenticated
  using ((select privado.es_direccion()));

create policy proveedores_gestion on public.proveedores for all to authenticated
  using ((select privado.es_gestion())) with check ((select privado.es_gestion()));
create policy categorias_gasto_gestion on public.categorias_gasto for all to authenticated
  using ((select privado.es_gestion())) with check ((select privado.es_gestion()));
create policy gastos_gestion on public.gastos for all to authenticated
  using ((select privado.es_gestion())) with check ((select privado.es_gestion()));
create policy pagos_docentes_direccion on public.pagos_docentes for all to authenticated
  using ((select privado.es_direccion())) with check ((select privado.es_direccion()));

-- Comunicación -----------------------------------------------------------
create policy comunicaciones_lectura on public.comunicaciones for select to authenticated using (
  autor_cuenta_id = (select auth.uid())
  or (select privado.es_gestion())
  or (estado = 'enviada' and privado.es_destinatario(id))
);
create policy comunicaciones_alta on public.comunicaciones for insert to authenticated with check (
  autor_cuenta_id = (select auth.uid()) and estado = 'borrador' and (
    (select privado.es_gestion())
    or (privado.tiene_rol('docente') and categoria <> 'economica' and tipo <> 'institucional'
        and (comision_id is null or privado.es_docente_de_comision(comision_id)))
  )
);
create policy comunicaciones_edicion on public.comunicaciones for update to authenticated
  using (autor_cuenta_id = (select auth.uid()) and estado = 'borrador')
  with check (autor_cuenta_id = (select auth.uid()) and estado = 'borrador' and (
    (select privado.es_gestion())
    or (categoria <> 'economica' and tipo <> 'institucional'
        and (comision_id is null or privado.es_docente_de_comision(comision_id)))
  ));
create policy envios_lectura on public.comunicacion_envios for select to authenticated using (
  destinatario_persona_id = (select privado.persona_actual())
  or (select privado.es_gestion())
  or privado.es_autor_comunicacion(comunicacion_id)
);
create policy preferencias_propias on public.preferencias_notificacion for all to authenticated
  using (persona_id = (select privado.persona_actual()))
  with check (persona_id = (select privado.persona_actual()));

-- Documentos ---------------------------------------------------------------
-- Misma regla que privado.puede_ver_documento, escrita sobre las columnas de
-- la fila para que también valga en INSERT ... RETURNING.
create policy documentos_lectura on public.documentos for select to authenticated using (
  eliminado_en is null and (
    (select privado.es_gestion())
    or (tipo <> 'comprobante_gasto' and persona_id = (select privado.persona_actual()))
    or (estudiante_id is not null and tipo <> 'comprobante_gasto' and (
          privado.es_el_estudiante(estudiante_id)
          or privado.es_responsable_de(estudiante_id, 'documental')))
  )
);
create policy documentos_alta on public.documentos for insert to authenticated with check (
  subido_por = (select auth.uid()) and (
    (select privado.es_gestion())
    -- Un responsable solo puede subir el comprobante de un pago propio.
    or (tipo = 'comprobante_pago' and persona_id = (select privado.persona_actual()) and estudiante_id is null)
  )
);
create policy documentos_edicion on public.documentos for update to authenticated
  using ((select privado.es_gestion())) with check ((select privado.es_gestion()));

-- Ayuda ---------------------------------------------------------------------
create policy ayuda_lectura on public.documentos_ayuda for select to anon, authenticated using (
  (estado = 'aprobado' and audiencia && (select privado.perfiles_actuales()))
  or (select privado.es_gestion())
);
create policy ayuda_escritura on public.documentos_ayuda for all to authenticated
  using ((select privado.es_direccion())) with check ((select privado.es_direccion()));
create policy asistente_uso_propio on public.asistente_uso for select to authenticated
  using (cuenta_id = (select auth.uid()) or (select privado.es_direccion()));
create policy asistente_limites_lectura on public.asistente_limites for select to authenticated using (true);
create policy asistente_limites_edicion on public.asistente_limites for update to authenticated
  using ((select privado.es_direccion())) with check ((select privado.es_direccion()));
create policy tareas_lectura on public.tareas_ejecutadas for select to authenticated
  using ((select privado.es_direccion()));

-- ---------------------------------------------------------------------
-- Storage: bucket privado. Solo lectura por política (descarga con URL
-- firmada de corta duración). Las subidas se hacen con URL firmada de
-- subida emitida por el servidor después de crear la fila en `documentos`.
-- ---------------------------------------------------------------------
-- Límite de tamaño y tipos aplicados por el servicio de Storage (5 MB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documentos', 'documentos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy documentos_descarga on storage.objects for select to authenticated using (
  bucket_id = 'documentos'
  and exists (
    select 1 from public.documentos d
    where d.ruta = storage.objects.name and privado.puede_ver_documento(d.id)
  )
);
