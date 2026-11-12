/**
 * Biblioteca docente: material compartido del equipo, compartido con
 * comisiones, archivos privados y registro de lectura.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { asignarDocente, crearBase, crearComision, crearCuenta, crearFamilia, crearPersona, rpc, sql, ver, type Base } from "./ayudas";

let base: Base;
let comision: string;
let otraComision: string;
let docente: string;
let otroDocente: string;
let ana: Awaited<ReturnType<typeof crearFamilia>>;
let beto: Awaited<ReturnType<typeof crearFamilia>>;
let anaCuenta: string;
let betoCuenta: string;
let material: string;

const subir = (ruta: string) => sql("insert into storage.objects (bucket_id, name) values ('biblioteca', $1)", [ruta]);

beforeAll(async () => {
  base = await crearBase();
  comision = await crearComision(base, 10);
  otraComision = await crearComision(base, 10);
  const docentePersona = await crearPersona("Doc", "Biblioteca");
  const otroPersona = await crearPersona("Otra", "Biblioteca");
  docente = await crearCuenta(docentePersona, ["docente"]);
  otroDocente = await crearCuenta(otroPersona, ["docente"]);
  await asignarDocente(comision, docentePersona);
  await asignarDocente(otraComision, otroPersona);
  ana = await crearFamilia(base, "AnaB");
  beto = await crearFamilia(base, "BetoB");
  anaCuenta = await crearCuenta(ana.estudiantePersona);
  betoCuenta = await crearCuenta(beto.estudiantePersona);
  await rpc(base.admin, "confirmar_inscripcion", [ana.estudiante, comision, ana.tutorPersona]);
  await rpc(base.admin, "confirmar_inscripcion", [beto.estudiante, otraComision, beto.tutorPersona]);
});

describe("material de la biblioteca", () => {
  it("lo carga el equipo docente, no los estudiantes", async () => {
    const [m] = await ver(docente, "insert into public.materiales (titulo, nivel) values ('Irregular verbs', 'Teens') returning id, autor_cuenta_id", []);
    expect(m.autor_cuenta_id).toBe(docente);
    material = m.id;
    await expect(ver(anaCuenta, "insert into public.materiales (titulo) values ('Mío')")).rejects.toThrow(/row-level security/);
    // No se puede cargar a nombre de otro.
    await expect(ver(docente, "insert into public.materiales (titulo, autor_cuenta_id) values ('Ajeno', $1)", [otroDocente])).rejects.toThrow(/row-level security/);
  });

  it("el archivo usa la ruta de la base y tiene que estar subido", async () => {
    await expect(rpc(docente, "ruta_material", [material, "exe"])).rejects.toThrow(/ARCHIVO_INVALIDO/);
    await expect(rpc(otroDocente, "ruta_material", [material, "pdf"])).rejects.toThrow(/NO_AUTORIZADO/);
    const ruta = await rpc<string>(docente, "ruta_material", [material, "pdf"]);
    expect(ruta).toMatch(new RegExp(`^${material}/[0-9a-f-]{36}\\.pdf$`));
    const adjuntar = (r: string) => ver(docente,
      "update public.materiales set archivo_ruta = $2, archivo_nombre = 'verbs.pdf', archivo_mime = 'application/pdf', archivo_bytes = 1200 where id = $1", [material, r]);
    await expect(adjuntar(ruta)).rejects.toThrow(/ARCHIVO_INVALIDO/);
    await subir(`${material}x/otro.pdf`);
    await expect(adjuntar(`${material}x/otro.pdf`)).rejects.toThrow(/ARCHIVO_INVALIDO/);
    await subir(ruta);
    await adjuntar(ruta);
    await expect(rpc(docente, "ruta_material", [material, "pdf"])).rejects.toThrow(/ARCHIVO_YA_CARGADO/);
    await ver(docente, "update public.materiales set texto = 'go went gone', texto_origen = 'ocr' where id = $1", [material]);
  });

  it("solo edita el autor (o gestión), pero todo el equipo lo ve", async () => {
    expect(await ver(otroDocente, "select id from public.materiales where id = $1", [material])).toHaveLength(1);
    expect(await ver(otroDocente, "update public.materiales set titulo = 'Cambiado' where id = $1 returning id", [material])).toHaveLength(0);
    expect(await ver(base.admin, "update public.materiales set descripcion = 'Lista básica' where id = $1 returning id", [material])).toHaveLength(1);
    await expect(ver(docente, "update public.materiales set autor_cuenta_id = $2 where id = $1", [material, otroDocente])).rejects.toThrow(/NO_AUTORIZADO/);
  });

  it("los estudiantes ven solo lo compartido con su comisión", async () => {
    const consulta = "select id from public.materiales where id = $1";
    expect(await ver(anaCuenta, consulta, [material])).toHaveLength(0);
    // Cada docente comparte con sus propias comisiones.
    await expect(ver(otroDocente, "insert into public.material_comisiones (material_id, comision_id) values ($1, $2)", [material, comision])).rejects.toThrow(/row-level security/);
    await ver(docente, "insert into public.material_comisiones (material_id, comision_id) values ($1, $2)", [material, comision]);
    expect(await ver(anaCuenta, consulta, [material])).toHaveLength(1);
    expect(await ver(ana.tutor, consulta, [material])).toHaveLength(1);
    expect(await ver(betoCuenta, consulta, [material])).toHaveLength(0);
    // El archivo sigue la misma regla.
    const [{ archivo_ruta: ruta }] = await ver(docente, "select archivo_ruta from public.materiales where id = $1", [material]);
    const archivo = "select name from storage.objects where bucket_id = 'biblioteca' and name = $1";
    expect(await ver(anaCuenta, archivo, [ruta])).toHaveLength(1);
    expect(await ver(betoCuenta, archivo, [ruta])).toHaveLength(0);
    // Un objeto suelto en la carpeta del material no queda expuesto.
    expect(await ver(anaCuenta, archivo, [`${material}x/otro.pdf`])).toHaveLength(0);
  });

  it("registra quién lo abrió", async () => {
    await rpc(anaCuenta, "registrar_lectura_material", [material]);
    await rpc(anaCuenta, "registrar_lectura_material", [material]);
    await expect(rpc(betoCuenta, "registrar_lectura_material", [material])).rejects.toThrow(/NO_AUTORIZADO/);
    const filas = await ver(docente, "select estudiante_id, veces from public.material_lecturas where material_id = $1", [material]);
    expect(filas).toEqual([{ estudiante_id: ana.estudiante, veces: 1 }]);
    expect(await ver(betoCuenta, "select 1 from public.material_lecturas where material_id = $1", [material])).toHaveLength(0);
  });

  it("dejar de compartir le quita el acceso", async () => {
    await ver(docente, "delete from public.material_comisiones where material_id = $1 and comision_id = $2", [material, comision]);
    expect(await ver(anaCuenta, "select id from public.materiales where id = $1", [material])).toHaveLength(0);
  });
});
