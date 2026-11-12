-- =====================================================================
-- 16 · Biblioteca docente
-- 1. Material de estudio: un archivo (PDF, foto o Word) y su versión
--    digital (texto que se lee, se busca y se escucha). El texto sale del
--    PDF, de un .docx o del OCR que corre en el navegador del docente; el
--    docente lo revisa antes de guardarlo.
-- 2. La biblioteca es del equipo: todo el personal docente ve todo el
--    material y lo puede compartir con sus comisiones. Editar y borrar es
--    del autor o de gestión.
-- 3. Estudiantes y familias (con permiso académico) ven solo el material
--    compartido con una comisión en la que cursan. Al abrirlo queda
--    registrado, para que el docente sepa quién lo leyó.
-- 4. Bucket privado `biblioteca`: {material}/{archivo}. La ruta la genera
--    la base y el servidor firma la subida; la lectura pasa por la política.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('biblioteca', 'biblioteca', false, 26214400,
        array['application/pdf', 'image/jpeg', 'image/png', 'image/webp',
              'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do nothing;

create table public.materiales (
  id uuid primary key default gen_random_uuid(),
  autor_cuenta_id uuid not null default auth.uid() references public.cuentas (id),
  titulo text not null check (length(btrim(titulo)) between 3 and 160),
  descripcion text check (descripcion is null or length(descripcion) <= 500),
  -- Grupo o nivel al que apunta ("Kids 2", "Teens", "Adultos"). Texto libre.
  nivel text check (nivel is null or length(nivel) <= 60),
  etiquetas text[] not null default '{}' check (cardinality(etiquetas) <= 10),
  archivo_ruta text unique,
  archivo_nombre text check (archivo_nombre is null or length(archivo_nombre) <= 200),
  archivo_mime text,
  archivo_bytes int check (archivo_bytes is null or archivo_bytes between 1 and 26214400),
  paginas int check (paginas is null or paginas between 1 and 300),
  texto text check (texto is null or length(texto) <= 200000),
  texto_origen text check (texto_origen in ('pdf', 'ocr', 'docx', 'manual')),
  busqueda tsvector generated always as (
    setweight(to_tsvector('simple'::regconfig, titulo), 'A')
    || setweight(to_tsvector('simple'::regconfig, coalesce(descripcion, '') || ' ' || coalesce(nivel, '')), 'B')
    || setweight(to_tsvector('simple'::regconfig, coalesce(left(texto, 100000), '')), 'C')) stored,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  check ((texto is null) = (texto_origen is null)),
  check ((archivo_ruta is null) = (archivo_nombre is null) and (archivo_ruta is null) = (archivo_mime is null)
         and (archivo_ruta is null) = (archivo_bytes is null))
);
create index materiales_busqueda_idx on public.materiales using gin (busqueda);
create index materiales_autor_idx on public.materiales (autor_cuenta_id, creado_en desc);

create table public.material_comisiones (
  material_id uuid not null references public.materiales (id) on delete cascade,
  comision_id uuid not null references public.comisiones (id) on delete cascade,
  compartido_por uuid not null default auth.uid() references public.cuentas (id),
  compartido_en timestamptz not null default now(),
  primary key (material_id, comision_id)
);
create index material_comisiones_comision_idx on public.material_comisiones (comision_id, compartido_en desc);

create table public.material_lecturas (
  material_id uuid not null references public.materiales (id) on delete cascade,
  estudiante_id uuid not null references public.estudiantes (id),
  primera_vez timestamptz not null default now(),
  ultima_vez timestamptz not null default now(),
  veces int not null default 1 check (veces > 0),
  primary key (material_id, estudiante_id)
);

-- ---------------------------------------------------------------------
-- Quién ve y quién edita
-- ---------------------------------------------------------------------
create or replace function privado.es_equipo_docente()
returns boolean language sql stable security definer set search_path = '' as $$
  select privado.tiene_rol('docente') or privado.es_gestion();
$$;

create or replace function privado.puede_editar_material(p_material uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.materiales m
     where m.id = p_material
       and ((m.autor_cuenta_id = (select auth.uid()) and privado.es_equipo_docente()) or privado.es_gestion()));
$$;

create or replace function privado.puede_ver_material(p_material uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select privado.es_equipo_docente() or exists (
    select 1 from public.material_comisiones mc
     where mc.material_id = p_material and privado.participa_en_comision(mc.comision_id));
$$;

create or replace function privado.puede_ver_archivo_material(p_ruta text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.materiales m where m.archivo_ruta = p_ruta and privado.puede_ver_material(m.id));
$$;

-- El autor no cambia y el archivo se carga una sola vez, con la ruta que
-- generó la base y después de subirlo.
create or replace function privado.validar_material()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.archivo_ruta is not null then raise exception 'ARCHIVO_INVALIDO' using errcode = 'P0001'; end if;
    return new;
  end if;
  if new.autor_cuenta_id is distinct from old.autor_cuenta_id or new.creado_en is distinct from old.creado_en then
    raise exception 'NO_AUTORIZADO' using errcode = '42501';
  end if;
  if new.archivo_ruta is distinct from old.archivo_ruta then
    if old.archivo_ruta is not null then raise exception 'ARCHIVO_YA_CARGADO' using errcode = 'P0001'; end if;
    if new.archivo_ruta not like old.id::text || '/%'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'biblioteca' and o.name = new.archivo_ruta) then
      raise exception 'ARCHIVO_INVALIDO' using errcode = 'P0001';
    end if;
  elsif new.archivo_nombre is distinct from old.archivo_nombre or new.archivo_mime is distinct from old.archivo_mime
        or new.archivo_bytes is distinct from old.archivo_bytes then
    raise exception 'ARCHIVO_YA_CARGADO' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger materiales_validar before insert or update on public.materiales
  for each row execute function privado.validar_material();
create trigger materiales_actualizado before update on public.materiales
  for each row execute function privado.tocar_actualizado_en();

create or replace function privado.ruta_material(p_material uuid, p_extension text)
returns text language plpgsql stable security definer set search_path = '' as $$
declare
  v_ext text := case when lower(p_extension) in ('pdf', 'jpg', 'jpeg', 'png', 'webp', 'docx') then lower(p_extension) end;
begin
  if v_ext is null then raise exception 'ARCHIVO_INVALIDO' using errcode = 'P0001'; end if;
  perform privado.exigir(privado.puede_editar_material(p_material));
  if exists (select 1 from public.materiales m where m.id = p_material and m.archivo_ruta is not null) then
    raise exception 'ARCHIVO_YA_CARGADO' using errcode = 'P0001';
  end if;
  return format('%s/%s.%s', p_material, gen_random_uuid(), v_ext);
end;
$$;

-- El estudiante abre un material: queda registrado (una fila por estudiante).
create or replace function privado.registrar_lectura_material(p_material uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_estudiante uuid := privado.estudiante_actual();
begin
  if v_estudiante is null then return; end if;
  perform privado.exigir(exists (
    select 1 from public.material_comisiones mc join public.matriculas m on m.comision_id = mc.comision_id
     where mc.material_id = p_material and m.estudiante_id = v_estudiante and m.estado = 'activa'));
  insert into public.material_lecturas (material_id, estudiante_id) values (p_material, v_estudiante)
  on conflict (material_id, estudiante_id) do update
    set ultima_vez = now(),
        veces = public.material_lecturas.veces + case when public.material_lecturas.ultima_vez < now() - interval '30 minutes' then 1 else 0 end;
end;
$$;

create or replace function public.ruta_material(p_material uuid, p_extension text)
returns text language sql stable security invoker set search_path = '' as $$ select privado.ruta_material(p_material, p_extension); $$;
create or replace function public.registrar_lectura_material(p_material uuid)
returns void language sql security invoker set search_path = '' as $$ select privado.registrar_lectura_material(p_material); $$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.materiales enable row level security;
alter table public.material_comisiones enable row level security;
alter table public.material_lecturas enable row level security;

create policy materiales_lectura on public.materiales for select to authenticated using (privado.puede_ver_material(id));
create policy materiales_alta on public.materiales for insert to authenticated with check (
  autor_cuenta_id = (select auth.uid()) and (select privado.es_equipo_docente()));
create policy materiales_edicion on public.materiales for update to authenticated
  using (privado.puede_editar_material(id)) with check (privado.puede_editar_material(id));
create policy materiales_baja on public.materiales for delete to authenticated using (privado.puede_editar_material(id));

create policy compartidos_lectura on public.material_comisiones for select to authenticated using (
  (select privado.es_equipo_docente()) or privado.participa_en_comision(comision_id));
-- Cualquier docente comparte material del equipo con sus propias comisiones.
create policy compartidos_alta on public.material_comisiones for insert to authenticated with check (
  compartido_por = (select auth.uid())
  and ((select privado.es_gestion()) or privado.es_docente_de_comision(comision_id)));
create policy compartidos_baja on public.material_comisiones for delete to authenticated using (
  (select privado.es_gestion()) or privado.es_docente_de_comision(comision_id));

create policy lecturas_lectura on public.material_lecturas for select to authenticated using (
  (select privado.es_equipo_docente()) or privado.es_el_estudiante(estudiante_id));

create policy biblioteca_leer on storage.objects for select to authenticated using (
  bucket_id = 'biblioteca' and privado.puede_ver_archivo_material(name));

-- ---------------------------------------------------------------------
-- Permisos (los privilegios por defecto están revocados)
-- ---------------------------------------------------------------------
grant select, insert, update, delete on public.materiales to authenticated;
grant select, insert, delete on public.material_comisiones to authenticated;
grant select on public.material_lecturas to authenticated;
grant all on public.materiales, public.material_comisiones, public.material_lecturas to service_role;

revoke execute on function
  privado.es_equipo_docente(), privado.puede_editar_material(uuid), privado.puede_ver_material(uuid),
  privado.puede_ver_archivo_material(text), privado.validar_material(), privado.ruta_material(uuid, text),
  privado.registrar_lectura_material(uuid),
  public.ruta_material(uuid, text), public.registrar_lectura_material(uuid)
from public, anon;
grant execute on function
  privado.es_equipo_docente(), privado.puede_editar_material(uuid), privado.puede_ver_material(uuid),
  privado.puede_ver_archivo_material(text), privado.ruta_material(uuid, text),
  privado.registrar_lectura_material(uuid),
  public.ruta_material(uuid, text), public.registrar_lectura_material(uuid)
to authenticated, service_role;
