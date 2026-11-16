"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { traducir } from "../comun";
import { leerCsv, mapearEncabezado, MAX_FILAS, normalizarFila, type FilaNormalizada } from "./planilla";

export interface FilaAnalizada {
  numero: number;
  estudiante: string;
  documento: string;
  responsable: string | null;
  deuda: string;
  estado: "nueva" | "revisar" | "error";
  motivo: string | null;
}

export interface Analisis {
  ok: boolean;
  mensaje: string;
  filas: FilaAnalizada[];
  ignoradas: string[];
}

const MAX_TEXTO = 600_000;
const nombreDe = (a: string, n: string) => `${a}, ${n}`;
const claveNombre = (a: string, n: string) => `${a}|${n}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function preparar(texto: string): { filas: FilaNormalizada[]; ignoradas: string[] } | string {
  if (typeof texto !== "string" || !texto.trim()) return "La planilla está vacía.";
  if (texto.length > MAX_TEXTO) return "La planilla es demasiado grande. Dividila en partes de hasta 500 filas.";
  const celdas = leerCsv(texto);
  if (celdas.length < 2) return "La planilla no tiene filas además del encabezado.";
  if (celdas.length - 1 > MAX_FILAS) return `La planilla tiene ${celdas.length - 1} filas. Importá hasta ${MAX_FILAS} por vez.`;
  const { mapa, ignoradas } = mapearEncabezado(celdas[0]);
  if (mapa.apellidos === undefined || mapa.nombres === undefined) {
    return "No encontramos las columnas «apellidos» y «nombres» en la primera fila. Descargá la planilla modelo para ver los nombres de las columnas.";
  }
  return { filas: celdas.slice(1).map((c, i) => normalizarFila(c, mapa, i + 2)), ignoradas };
}

/** Revisa la planilla sin cargar nada: errores, duplicados en la planilla y personas ya cargadas. */
export async function analizarPlanilla(texto: string): Promise<Analisis> {
  await exigirPermiso("estudiantes", "crear");
  const p = preparar(texto);
  if (typeof p === "string") return { ok: false, mensaje: p, filas: [], ignoradas: [] };
  const supabase = await crearClienteServidor();

  // Personas ya cargadas por documento (estudiantes) y por nombre exacto.
  const documentos = [...new Set(p.filas.map((f) => f.datos.documento).filter(Boolean))];
  const porDocumento = new Map<string, { persona: string; estudiante: boolean }>();
  for (let i = 0; i < documentos.length; i += 200) {
    const { data, error } = await supabase.from("personas_datos").select("numero_documento, persona_id, personas!inner(eliminada_en, estudiantes(id))")
      .in("numero_documento", documentos.slice(i, i + 200)).is("personas.eliminada_en", null);
    if (error) return { ok: false, mensaje: traducir(error), filas: [], ignoradas: [] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const d of (data ?? []) as any[]) {
      const p0 = Array.isArray(d.personas) ? d.personas[0] : d.personas;
      const est = Array.isArray(p0?.estudiantes) ? p0.estudiantes.length > 0 : Boolean(p0?.estudiantes);
      porDocumento.set(d.numero_documento, { persona: d.persona_id, estudiante: est });
    }
  }
  const apellidos = [...new Set(p.filas.map((f) => f.datos.apellidos).filter(Boolean))];
  const nombresCargados = new Set<string>();
  for (let i = 0; i < apellidos.length; i += 100) {
    const { data } = await supabase.from("personas").select("nombres, apellidos, estudiantes!inner(id)")
      .in("apellidos", apellidos.slice(i, i + 100)).is("eliminada_en", null);
    for (const x of data ?? []) nombresCargados.add(claveNombre(x.apellidos as string, x.nombres as string));
  }

  const vistosDoc = new Map<string, number>();
  const vistosNombre = new Map<string, number>();
  const filas: FilaAnalizada[] = p.filas.map((f) => {
    const d = f.datos;
    const base = {
      numero: f.numero, estudiante: nombreDe(d.apellidos || "¿?", d.nombres || "¿?"), documento: d.documento,
      responsable: d.resp_apellidos ? `${nombreDe(d.resp_apellidos, d.resp_nombres)}${d.resp_parentesco ? ` (${d.resp_parentesco})` : ""}` : null,
      deuda: d.deuda,
    };
    if (f.errores.length) return { ...base, estado: "error" as const, motivo: f.errores.join(". ") };
    const k = claveNombre(d.apellidos, d.nombres);
    if (d.documento && vistosDoc.has(d.documento)) return { ...base, estado: "error" as const, motivo: `El documento se repite en la fila ${vistosDoc.get(d.documento)}` };
    if (d.documento) vistosDoc.set(d.documento, f.numero);
    const previo = d.documento ? porDocumento.get(d.documento) : undefined;
    if (previo?.estudiante) return { ...base, estado: "error" as const, motivo: "Ya está cargado como estudiante (mismo documento)" };
    if (previo) return { ...base, estado: "error" as const, motivo: "Ese documento ya es de otra persona del sistema (por ejemplo, un responsable). Dalo de alta desde Estudiantes" };
    if (vistosNombre.has(k)) {
      const fila = vistosNombre.get(k);
      vistosNombre.set(k, f.numero);
      return { ...base, estado: "revisar" as const, motivo: `Mismo nombre que la fila ${fila}` };
    }
    vistosNombre.set(k, f.numero);
    if (nombresCargados.has(k)) return { ...base, estado: "revisar" as const, motivo: "Ya hay un estudiante con ese nombre en el sistema" };
    return { ...base, estado: "nueva" as const, motivo: null };
  });

  const nuevas = filas.filter((f) => f.estado === "nueva").length;
  return {
    ok: true, filas, ignoradas: p.ignoradas,
    mensaje: `${filas.length} filas leídas: ${nuevas} listas para importar${filas.length - nuevas ? `, ${filas.length - nuevas} para revisar` : ""}.`,
  };
}

export interface ResultadoImportacion {
  ok: boolean;
  mensaje: string;
  resultados: Array<{ numero: number; ok: boolean; detalle: string }>;
}

const esquemaOpciones = z.object({
  numeros: z.array(z.number().int().min(2).max(MAX_FILAS + 1)).max(MAX_FILAS),
  verificar: z.boolean(),
  activos: z.boolean(),
});

/** Importa las filas elegidas. Cada fila entra completa o no entra (lo garantiza la base). */
export async function importarPlanilla(texto: string, opciones: unknown): Promise<ResultadoImportacion> {
  await exigirPermiso("estudiantes", "crear");
  const o = esquemaOpciones.safeParse(opciones);
  if (!o.success) return { ok: false, mensaje: "No pudimos leer las opciones. Volvé a revisar la planilla.", resultados: [] };
  const p = preparar(texto);
  if (typeof p === "string") return { ok: false, mensaje: p, resultados: [] };
  const elegidas = new Set(o.data.numeros);
  const supabase = await crearClienteServidor();

  const resultados: ResultadoImportacion["resultados"] = [];
  for (const f of p.filas) {
    if (!elegidas.has(f.numero)) continue;
    if (f.errores.length) { resultados.push({ numero: f.numero, ok: false, detalle: f.errores.join(". ") }); continue; }
    const fila = { ...f.datos, estado: o.data.activos ? "activo" : "aspirante" };
    const { data, error } = await supabase.rpc("importar_estudiante", { p_fila: fila, p_verificar: o.data.verificar });
    if (error) resultados.push({ numero: f.numero, ok: false, detalle: `${nombreDe(f.datos.apellidos, f.datos.nombres)}: ${traducir(error)}` });
    else resultados.push({ numero: f.numero, ok: true, detalle: `${nombreDe(f.datos.apellidos, f.datos.nombres)}: legajo ${(data as { legajo: string }).legajo}` });
  }
  revalidatePath("/panel/estudiantes");
  revalidatePath("/panel/cobros");
  const bien = resultados.filter((r) => r.ok).length;
  return {
    ok: bien > 0, resultados,
    mensaje: bien === resultados.length
      ? `Listo: se importaron ${bien} estudiantes.`
      : `Se importaron ${bien} de ${resultados.length}. Las que fallaron no se cargaron: corregilas en la planilla y volvé a importar solo esas.`,
  };
}
