/**
 * Speaking con audio (entregas y devoluciones habladas) y resumen semanal.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { asignarDocente, crearBase, crearComision, crearCuenta, crearFamilia, crearPersona, rpc, sql, ver, type Base } from "./ayudas";

let base: Base;
let comision: string;
let docente: string;
let otroDocente: string;
let ana: Awaited<ReturnType<typeof crearFamilia>>;
let beto: Awaited<ReturnType<typeof crearFamilia>>;
let anaCuenta: string;
let betoCuenta: string;
let habla: string;

const subir = (ruta: string) => sql("insert into storage.objects (bucket_id, name) values ('audios', $1)", [ruta]);

beforeAll(async () => {
  base = await crearBase();
  comision = await crearComision(base, 10);
  const docentePersona = await crearPersona("Doc", "Speaking");
  docente = await crearCuenta(docentePersona, ["docente"]);
  otroDocente = await crearCuenta(await crearPersona("Otro", "Speaking"), ["docente"]);
  await asignarDocente(comision, docentePersona);
  ana = await crearFamilia(base, "AnaS");
  beto = await crearFamilia(base, "BetoS");
  anaCuenta = await crearCuenta(ana.estudiantePersona);
  betoCuenta = await crearCuenta(beto.estudiantePersona);
  await rpc(base.admin, "confirmar_inscripcion", [ana.estudiante, comision, ana.tutorPersona]);
  await rpc(base.admin, "confirmar_inscripcion", [beto.estudiante, comision, beto.tutorPersona]);
  const [a] = await ver(docente,
    `insert into public.actividades (comision_id, autor_cuenta_id, titulo, consigna, habilidad, estado, cierra_en)
     values ($1, $2, 'My weekend', 'Contá tu fin de semana en 1 minuto.', 'habla', 'publicada', now() + interval '3 days') returning id`, [comision, docente]);
  habla = a.id;
});

describe("entrega hablada", () => {
  it("la ruta la genera la base y solo para quien cursa", async () => {
    const ruta = await rpc<string>(anaCuenta, "ruta_audio_entrega", [habla, "webm"]);
    expect(ruta).toMatch(new RegExp(`^entregas/${habla}/[0-9a-f-]{36}/[0-9a-f-]{36}\\.webm$`));
    await expect(rpc(anaCuenta, "ruta_audio_entrega", [habla, "exe"])).rejects.toThrow(/AUDIO_INVALIDO/);
    await expect(rpc(docente, "ruta_audio_entrega", [habla, "webm"])).rejects.toThrow(/NO_AUTORIZADO/);
  });

  it("una actividad de habla exige una grabación propia y ya subida", async () => {
    await expect(rpc(anaCuenta, "entregar_actividad", [habla, "{}", null])).rejects.toThrow(/FALTA_AUDIO/);
    const rutaAna = await rpc<string>(anaCuenta, "ruta_audio_entrega", [habla, "webm"]);
    // Sin subir todavía: se rechaza.
    await expect(rpc(anaCuenta, "entregar_actividad", [habla, "{}", null, rutaAna, 40])).rejects.toThrow(/AUDIO_INVALIDO/);
    // La grabación de otro estudiante no sirve.
    const rutaBeto = await rpc<string>(betoCuenta, "ruta_audio_entrega", [habla, "webm"]);
    await subir(rutaBeto);
    await expect(rpc(anaCuenta, "entregar_actividad", [habla, "{}", null, rutaBeto, 40])).rejects.toThrow(/AUDIO_INVALIDO/);
    await subir(rutaAna);
    await rpc(anaCuenta, "entregar_actividad", [habla, "{}", "Fui al río.", rutaAna, 40]);
    const [e] = await ver(docente, "select audio_ruta, audio_segundos from public.entregas where actividad_id = $1 and audio_ruta = $2", [habla, rutaAna]);
    expect(e.audio_segundos).toBe(40);
    // Reentregar sin audio nuevo conserva el anterior.
    await rpc(anaCuenta, "entregar_actividad", [habla, "{}", "Fui al río con mi hermana.", null, null]);
    const mia = await ver(anaCuenta, "select audio_ruta from public.entregas_de_estudiante($1) where actividad_id = $2", [ana.estudiante, habla]);
    expect(mia[0].audio_ruta).toBe(rutaAna);
  });

  it("escuchan el estudiante, su familia y su docente; nadie más", async () => {
    const [{ audio_ruta: ruta }] = await ver(docente, "select audio_ruta from public.entregas e join public.matriculas m on m.id = e.matricula_id where m.estudiante_id = $1", [ana.estudiante]);
    const consulta = "select name from storage.objects where bucket_id = 'audios' and name = $1";
    for (const quien of [anaCuenta, ana.tutor, docente, base.admin]) expect(await ver(quien, consulta, [ruta])).toHaveLength(1);
    for (const quien of [betoCuenta, beto.tutor, otroDocente]) expect(await ver(quien, consulta, [ruta])).toHaveLength(0);
  });

  it("la devolución hablada del docente se oye recién publicada", async () => {
    const [e] = await ver(docente, "select e.id from public.entregas e join public.matriculas m on m.id = e.matricula_id where m.estudiante_id = $1 and e.actividad_id = $2", [ana.estudiante, habla]);
    await expect(rpc(otroDocente, "ruta_audio_devolucion", [e.id, "webm"])).rejects.toThrow(/NO_AUTORIZADO/);
    const ruta = await rpc<string>(docente, "ruta_audio_devolucion", [e.id, "m4a"]);
    expect(ruta.startsWith(`devoluciones/${e.id}/`)).toBe(true);
    await expect(rpc(docente, "corregir_entrega", [e.id, 8, "Good!", "muy_bien", false, ruta, false])).rejects.toThrow(/AUDIO_INVALIDO/);
    await subir(ruta);
    await rpc(docente, "corregir_entrega", [e.id, 8, "Good!", "muy_bien", false, ruta, false]);
    const consulta = "select name from storage.objects where bucket_id = 'audios' and name = $1";
    expect(await ver(ana.tutor, consulta, [ruta])).toHaveLength(0);
    const oculta = await ver(anaCuenta, "select devolucion_audio from public.entregas_de_estudiante($1) where actividad_id = $2", [ana.estudiante, habla]);
    expect(oculta[0].devolucion_audio).toBeNull();
    // Publicar sin pasar el audio de nuevo lo conserva.
    await rpc(docente, "corregir_entrega", [e.id, 8, "Good!", "muy_bien", true]);
    expect(await ver(ana.tutor, consulta, [ruta])).toHaveLength(1);
    const visible = await ver(anaCuenta, "select devolucion_audio from public.entregas_de_estudiante($1) where actividad_id = $2", [ana.estudiante, habla]);
    expect(visible[0].devolucion_audio).toBe(ruta);
    expect(await ver(beto.tutor, consulta, [ruta])).toHaveLength(0);
  });
});

describe("resumen semanal", () => {
  it("resume la semana para la familia y no para otras familias", async () => {
    const r = await rpc<{ entregadas: number; notas: { titulo: string }[]; practica: { dias: number } }>(ana.tutor, "resumen_semanal", [ana.estudiante, null]);
    expect(Number(r.entregadas)).toBeGreaterThanOrEqual(1);
    expect(r.notas.map((n) => n.titulo)).toContain("My weekend");
    expect(Number(r.practica.dias)).toBe(0);
    await expect(rpc(beto.tutor, "resumen_semanal", [ana.estudiante, null])).rejects.toThrow(/NO_AUTORIZADO/);
    await expect(rpc(otroDocente, "resumen_semanal", [ana.estudiante, null])).rejects.toThrow(/NO_AUTORIZADO/);
    expect((await rpc<{ entregadas: number }>(docente, "resumen_semanal", [ana.estudiante, null])).entregadas).toBeDefined();
  });

  it("lista lo que vence en los próximos días y todavía no se entregó", async () => {
    const r = await rpc<{ proximas: { titulo: string }[] }>(beto.tutor, "resumen_semanal", [beto.estudiante, null]);
    expect(r.proximas.map((p) => p.titulo)).toContain("My weekend");
    const a = await rpc<{ proximas: { titulo: string }[] }>(anaCuenta, "resumen_semanal", [ana.estudiante, null]);
    expect(a.proximas.map((p) => p.titulo)).not.toContain("My weekend");
  });
});
