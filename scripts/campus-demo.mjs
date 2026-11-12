/**
 * Datos de DEMOSTRACIÓN del campus (actividades, entregas, asistencia con
 * ausencias, práctica, medallas, ranking, mensajes y evaluación docente).
 * Requiere haber corrido antes scripts/usuarios-demo.mjs y cargado
 * supabase/ejercicios-demo.sql. Solo desarrollo o pruebas.
 *
 *   node --env-file=.env.local scripts/campus-demo.mjs
 *
 * Idempotente: si ya hay actividades demo, no duplica.
 */
import { createClient } from "@supabase/supabase-js";

const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: clave, NEXT_PUBLIC_ENTORNO } = process.env;
if (NEXT_PUBLIC_ENTORNO === "produccion") throw new Error("Este script no se ejecuta en producción.");
if (!url || !clave) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SECRET_KEY.");

const db = createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });
const P = (n) => `00000000-0000-4000-8000-00000000${n}`;
const NINOS = "00000000-0000-4000-8000-000000000401";
const ADULTOS = "00000000-0000-4000-8000-000000000403";

async function q(promesa) {
  const { data, error } = await promesa;
  if (error) throw new Error(error.message);
  return data;
}
const dias = (n) => new Date(Date.now() + n * 86_400_000).toISOString();
const fecha = (n) => dias(n).slice(0, 10);

const [{ id: docenteCuenta }] = await q(db.from("cuentas").select("id").eq("persona_id", P(1003)));
const [{ id: direccionCuenta }] = await q(db.from("cuentas").select("id").eq("persona_id", P(1001)));

// --- Compañeros ficticios para que el ranking y las alertas tengan vida ---------
await q(db.from("comisiones").update({ cupo: 10 }).eq("id", ADULTOS));
const COMPANEROS = [
  ["Lucía", "Paz Demo", ADULTOS], ["Martín", "Rey Demo", ADULTOS], ["Sofía", "Luna Demo", ADULTOS],
  ["Tomi", "Sol Demo", NINOS], ["Valen", "Mar Demo", NINOS], ["Juli", "Río Demo", NINOS],
];
const estudiantesPorComision = { [ADULTOS]: [], [NINOS]: [] };
for (const [nombres, apellidos, comision] of COMPANEROS) {
  let persona = (await q(db.from("personas").select("id").eq("nombres", nombres).eq("apellidos", apellidos)))[0]?.id;
  if (!persona) persona = (await q(db.from("personas").insert({ nombres, apellidos }).select("id").single())).id;
  let est = (await q(db.from("estudiantes").select("id").eq("persona_id", persona)))[0]?.id;
  if (!est) est = (await q(db.from("estudiantes").insert({ persona_id: persona, estado: "activo" }).select("id").single())).id;
  const activa = await q(db.from("matriculas").select("id").eq("estudiante_id", est).eq("estado", "activa"));
  if (!activa.length) {
    const m = await q(db.from("matriculas").insert({ estudiante_id: est, comision_id: comision }).select("id").single());
    await q(db.from("matriculas_pago").insert({ matricula_id: m.id, responsable_pago_persona_id: persona }));
  }
}
const matriculas = await q(db.from("matriculas").select("id, estudiante_id, comision_id").eq("estado", "activa").in("comision_id", [ADULTOS, NINOS]));
for (const m of matriculas) estudiantesPorComision[m.comision_id].push(m);

const ya = await q(db.from("actividades").select("id").eq("titulo", "Daily routines: present simple"));
if (ya.length) {
  console.log("Las actividades demo ya existen: no se duplican.");
} else {
  // --- Actividades con preguntas y claves --------------------------------------
  const ACTIVIDADES = [
    { comision: ADULTOS, titulo: "Daily routines: present simple", habilidad: "gramatica", evaluacion: "formativa", abre: -10, cierra: -2,
      consigna: "Completá cada frase con la forma correcta del verbo y después contá tu rutina en 3 oraciones.",
      preguntas: [["She ___ to work by bus.", ["go", "goes", "going"], 1], ["They ___ dinner at 9.", ["have", "has", "having"], 0], ["___ you like coffee?", ["Do", "Does", "Are"], 0]], abierta: "Contá tu rutina diaria en 3 oraciones." },
    { comision: ADULTOS, titulo: "Reading: a weekend in Tafí del Valle", habilidad: "lectura", evaluacion: "formativa", abre: -3, cierra: 4,
      consigna: "Leé el texto sobre un fin de semana en Tafí del Valle y respondé.",
      preguntas: [["Where did they stay?", ["In a hotel", "In a cabin", "At a friend's house"], 1], ["What did they eat?", ["Empanadas", "Pizza", "Sushi"], 0]], abierta: null },
    { comision: ADULTOS, titulo: "Writing: an email to a friend", habilidad: "escritura", evaluacion: "acreditante", abre: -1, cierra: 7,
      consigna: "Escribí un email de 80 palabras invitando a un amigo a tu cumpleaños.", preguntas: [], abierta: "Tu email (80 palabras)." },
    { comision: NINOS, titulo: "Animals quiz", habilidad: "vocabulario", evaluacion: "practica", abre: -5, cierra: 3,
      consigna: "Elegí la palabra correcta para cada animal.",
      preguntas: [["🐶 is a…", ["cat", "dog", "bird"], 1], ["🐟 is a…", ["fish", "horse", "cow"], 0], ["🐦 is a…", ["bird", "dog", "pig"], 0]], abierta: null },
  ];
  for (const a of ACTIVIDADES) {
    const act = await q(db.from("actividades").insert({
      comision_id: a.comision, autor_cuenta_id: docenteCuenta, titulo: a.titulo, consigna: a.consigna, habilidad: a.habilidad,
      evaluacion: a.evaluacion, estado: "publicada", abre_en: dias(a.abre), cierra_en: dias(a.cierra),
    }).select("id").single());
    const ids = [];
    let orden = 1;
    for (const [enunciado, opciones, correcta] of a.preguntas) {
      const p = await q(db.from("actividad_preguntas").insert({ actividad_id: act.id, orden: orden++, enunciado, tipo: "opcion", opciones }).select("id").single());
      await q(db.from("actividad_claves").insert({ pregunta_id: p.id, correcta }));
      ids.push([p.id, correcta]);
    }
    if (a.abierta) await q(db.from("actividad_preguntas").insert({ actividad_id: act.id, orden: orden++, enunciado: a.abierta, tipo: "texto" }));

    // Entregas: la mayoría entrega; uno o dos no, para que haya pendientes y alertas.
    const alumnos = estudiantesPorComision[a.comision];
    for (const [i, m] of alumnos.entries()) {
      if (a.cierra > 0 && i % 2 === 1) continue; // en curso: algunos todavía no entregaron
      if (a.cierra < 0 && i === alumnos.length - 1) continue; // vencida sin entregar
      const respuestas = Object.fromEntries(ids.map(([id, c], k) => [id, (i + k) % 3 === 0 ? (c + 1) % 3 : c]));
      const aciertos = ids.filter(([id, c]) => respuestas[id] === c).length;
      const corregida = a.cierra < 0;
      const nota = corregida ? Math.max(2, Math.min(10, Math.round((aciertos / Math.max(ids.length, 1)) * 10) - (i === 1 ? 5 : 0))) : null;
      await q(db.from("entregas").insert({
        actividad_id: act.id, matricula_id: m.id, estado: corregida ? "corregida" : "entregada",
        respuestas, texto: a.abierta ? "I wake up at seven. I have breakfast with my family. Then I go to work." : null,
        entregada_en: dias(Math.min(a.cierra, 0) - 1), puntaje_auto: aciertos,
        nota, devolucion: corregida ? (nota >= 7 ? "¡Muy bien! Cuidá la tercera persona: she goes." : "Repasemos el present simple en la práctica de gramática.") : null,
        reaccion: corregida ? (nota >= 8 ? "excelente" : nota >= 6 ? "bien" : "a_mejorar") : null,
        corregida_por: corregida ? docenteCuenta : null, corregida_en: corregida ? dias(-1) : null, publicada: corregida,
      }));
    }
  }

  // --- Clases y asistencia (con ausencias repetidas para disparar alertas) -------
  for (const [comision, offsets] of [[ADULTOS, [-14, -12, -7, -5]], [NINOS, [-15, -13, -8, -6]]]) {
    const alumnos = estudiantesPorComision[comision];
    for (const [n, off] of offsets.entries()) {
      const c = await q(db.from("clases").insert({
        comision_id: comision, fecha: fecha(off), hora_inicio: comision === ADULTOS ? "20:00" : "17:30",
        hora_fin: comision === ADULTOS ? "21:30" : "18:30", estado: "dictada", docente_persona_id: P(1003),
        tema: ["Present simple", "Daily routines", "Food & drinks", "Weekend plans"][n],
      }).select("id").single());
      for (const [i, m] of alumnos.entries()) {
        const estado = i === alumnos.length - 1 && n >= 1 ? "ausente" : (i + n) % 5 === 0 ? "tarde" : "presente";
        await q(db.from("asistencias").insert({ clase_id: c.id, matricula_id: m.id, estado }));
      }
    }
  }
}

// --- Práctica: XP, rachas y medallas variadas -----------------------------------
const ejercicios = await q(db.from("ejercicios").select("id, habilidad, dificultad").eq("estado", "revisado").limit(200));
if (!ejercicios.length) {
  console.log("No hay ejercicios revisados: cargá supabase/ejercicios-demo.sql y volvé a correr este script.");
} else {
  const yaPractica = await q(db.from("practica_intentos").select("id").limit(1));
  if (!yaPractica.length) {
    const todos = [...estudiantesPorComision[ADULTOS], ...estudiantesPorComision[NINOS]];
    for (const [i, m] of todos.entries()) {
      const diasActivos = [6, 4, 3, 5, 2, 7, 1, 3, 4][i % 9];
      const intentos = [];
      for (let d = diasActivos - 1; d >= 0; d--) {
        for (let k = 0; k < 3 + (i % 4); k++) {
          const e = ejercicios[(i * 7 + d * 3 + k) % ejercicios.length];
          const correcta = (i + d + k) % 4 !== 0;
          intentos.push({ estudiante_id: m.estudiante_id, ejercicio_id: e.id, correcta, xp: correcta ? 10 + (e.dificultad - 1) * 5 : 0, respondido_en: dias(-d) });
        }
      }
      await q(db.from("practica_intentos").insert(intentos));
      await q(db.from("progreso_estudiantes").upsert({
        estudiante_id: m.estudiante_id, racha: diasActivos, mejor_racha: diasActivos + (i % 3),
        ultima_practica: fecha(0), comodines: diasActivos >= 7 ? 1 : 0,
        alias: m.comision_id === NINOS ? ["Tiger", "Rocket", "Star", "Panda", "Comet"][i % 5] : null,
      }));
      const medallas = ["primer_paso"];
      if (diasActivos >= 3) medallas.push("racha_3");
      if (diasActivos >= 7) medallas.push("racha_7");
      if (intentos.reduce((t, x) => t + x.xp, 0) >= 100) medallas.push("xp_100");
      await q(db.from("medallas_obtenidas").upsert(medallas.map((medalla) => ({ estudiante_id: m.estudiante_id, medalla })), { onConflict: "estudiante_id,medalla" }));
    }
    console.log("✓ práctica demo");
  }
}

// --- Alertas, mensajes y evaluación docente -----------------------------------
const alertas = await q(db.rpc("revisar_alertas_programada"));
console.log(`✓ revisión de alertas (${alertas})`);

const yaHilo = await q(db.from("hilos").select("id").eq("asunto", "Asistencia de Emilia"));
if (!yaHilo.length) {
  const h = await q(db.from("hilos").insert({ asunto: "Asistencia de Emilia", estudiante_id: P(1101), creado_por: docenteCuenta }).select("id").single());
  await q(db.from("hilo_participantes").insert([{ hilo_id: h.id, persona_id: P(1003), leido_en: dias(0) }, { hilo_id: h.id, persona_id: P(1004) }]));
  await q(db.from("mensajes").insert([
    { hilo_id: h.id, autor_persona_id: P(1003), cuerpo: "Hola Diego, Emilia viene muy bien en clase. Te escribo para recordarte la clase abierta con familias del viernes.", creado_en: dias(-1) },
  ]));
  const h2 = await q(db.from("hilos").insert({ asunto: "Planificación del trimestre", creado_por: direccionCuenta }).select("id").single());
  await q(db.from("hilo_participantes").insert([{ hilo_id: h2.id, persona_id: P(1001), leido_en: dias(0) }, { hilo_id: h2.id, persona_id: P(1003) }]));
  await q(db.from("mensajes").insert({ hilo_id: h2.id, autor_persona_id: P(1001), cuerpo: "Carla, ¿me compartís la planificación del trimestre para Adultos Intermedio? Gracias.", creado_en: dias(-2) }));

  await q(db.from("evaluaciones_docentes").insert({
    docente_persona_id: P(1003), evaluador_cuenta_id: direccionCuenta, periodo: "2º cuatrimestre 2026",
    puntajes: { planificacion: 5, clima: 5, seguimiento: 4, familias: 4, administrativo: 3 },
    fortalezas: "Clases dinámicas y muy buen vínculo con el grupo.", a_mejorar: "Cargar la asistencia el mismo día de la clase.", compartida: true,
  }));
  console.log("✓ mensajes y evaluación demo");
}
// --- Speaking: actividades con grabación (idempotente aparte) ------------------
const SPEAKING = [
  { comision: ADULTOS, titulo: "Speaking: tell us about your weekend",
    consigna: "Grabá un audio de 1 minuto contando qué hiciste el fin de semana. Usá al menos tres verbos en pasado (went, ate, visited…)." },
  { comision: NINOS, titulo: "Speaking: my favourite animal",
    consigna: "Grabá un audio corto: What is your favourite animal? Why do you like it? Contalo en 3 frases." },
];
for (const a of SPEAKING) {
  const existe = await q(db.from("actividades").select("id").eq("titulo", a.titulo));
  if (existe.length) continue;
  await q(db.from("actividades").insert({
    comision_id: a.comision, autor_cuenta_id: docenteCuenta, titulo: a.titulo, consigna: a.consigna, habilidad: "habla",
    evaluacion: "formativa", estado: "publicada", abre_en: dias(-1), cierra_en: dias(6),
  }));
  console.log(`✓ ${a.titulo}`);
}
console.log("\nListo.");
