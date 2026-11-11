/**
 * Crea las cuentas de DEMOSTRACIÓN sobre los datos de supabase/seed.sql.
 * Solo para desarrollo o pruebas: se niega a correr en producción.
 *
 *   node --env-file=.env.local scripts/usuarios-demo.mjs
 *
 * Requiere NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY y DEMO_CLAVE.
 * La contraseña de todas las cuentas demo es el valor de DEMO_CLAVE.
 */
import { createClient } from "@supabase/supabase-js";

const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: clave, DEMO_CLAVE, NEXT_PUBLIC_ENTORNO } = process.env;

if (NEXT_PUBLIC_ENTORNO === "produccion") {
  console.error("Este script no se ejecuta en producción.");
  process.exit(1);
}
if (!url || !clave || !DEMO_CLAVE || DEMO_CLAVE.length < 10) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY o DEMO_CLAVE (mínimo 10 caracteres).");
  process.exit(1);
}

const supabase = createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });
const P = (n) => `00000000-0000-4000-8000-00000000${n}`;

// persona del seed → correo demo → rol de personal (si corresponde)
const CUENTAS = [
  { persona: P(1001), email: "direccion@demo.invalid", rol: "direccion" },
  { persona: P(1002), email: "administracion@demo.invalid", rol: "administracion" },
  { persona: P(1003), email: "docente@demo.invalid", rol: "docente" },
  { persona: P(1004), email: "tutor@demo.invalid", rol: null },
  { persona: P(1006), email: "estudiante@demo.invalid", rol: null },
  { persona: P(1007), email: "otrafamilia@demo.invalid", rol: null },
];

async function usuario(email) {
  const { data, error } = await supabase.auth.admin.createUser({ email, password: DEMO_CLAVE, email_confirm: true });
  if (!error) return data.user.id;
  const { data: lista } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const existente = lista?.users.find((u) => u.email === email);
  if (!existente) throw error;
  return existente.id;
}

const ids = {};
for (const c of CUENTAS) {
  const id = await usuario(c.email);
  ids[c.email] = id;
  const { error } = await supabase.from("cuentas").upsert({ id, persona_id: c.persona }, { onConflict: "id" });
  if (error) throw error;
  if (c.rol) {
    const { data: ya } = await supabase.from("roles_asignados").select("id").eq("cuenta_id", id).eq("rol", c.rol).is("revocado_en", null);
    if (!ya?.length) {
      const r = await supabase.from("roles_asignados").insert({ cuenta_id: id, rol: c.rol });
      if (r.error) throw r.error;
    }
  }
  console.log(`✓ ${c.email}${c.rol ? ` (${c.rol})` : ""}`);
}

// Vínculos verificados: Diego → Emilia (todos los permisos); Gabriela → Hugo.
const admin = ids["administracion@demo.invalid"];
const VINCULOS = [
  { estudiante: P(1101), responsable: P(1004) },
  { estudiante: P(1103), responsable: P(1007) },
];
for (const v of VINCULOS) {
  const { data: ya } = await supabase.from("vinculos_responsables").select("id")
    .eq("estudiante_id", v.estudiante).eq("responsable_persona_id", v.responsable).eq("estado", "verificado");
  if (ya?.length) continue;
  const r = await supabase.from("vinculos_responsables").insert({
    estudiante_id: v.estudiante, responsable_persona_id: v.responsable, parentesco: "madre/padre",
    estado: "verificado", permiso_academico: true, permiso_documental: true, permiso_economico: true,
    es_responsable_pago: true, invitado_por: admin, verificado_por: admin, verificado_en: new Date().toISOString(),
  });
  if (r.error) throw r.error;
}
console.log("✓ vínculos demo");

// Inscripciones demo: Fabián (adulto, paga él) y Hugo (paga Gabriela).
const INSCRIPCIONES = [
  { estudiante: P(1102), comision: "00000000-0000-4000-8000-000000000403", paga: P(1006) },
  { estudiante: P(1103), comision: "00000000-0000-4000-8000-000000000401", paga: P(1007) },
];
for (const i of INSCRIPCIONES) {
  const { data: ya } = await supabase.from("matriculas").select("id").eq("estudiante_id", i.estudiante).eq("estado", "activa");
  if (ya?.length) continue;
  const m = await supabase.from("matriculas").insert({ estudiante_id: i.estudiante, comision_id: i.comision, creada_por: admin }).select("id").single();
  if (m.error) throw m.error;
  const p = await supabase.from("matriculas_pago").insert({ matricula_id: m.data.id, responsable_pago_persona_id: i.paga });
  if (p.error) throw p.error;
  await supabase.from("estudiantes").update({ estado: "activo" }).eq("id", i.estudiante);
}
const cuotas = await supabase.rpc("generar_cuotas_programada", { p_periodo: "2027-03-01", p_dia_vencimiento: 10 });
if (cuotas.error) throw cuotas.error;
console.log(`✓ inscripciones demo y ${cuotas.data} cuotas de marzo 2027`);
console.log("\nListo. Ingresá con cualquiera de los correos de arriba y la contraseña definida en DEMO_CLAVE.");
console.log("Las inscripciones y los cobros de ejemplo se cargan desde la aplicación, con la cuenta de administración.");
