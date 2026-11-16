import "server-only";
import { fecha } from "@/lib/formato";

/**
 * Planillas para abrir con Excel en castellano: separador «;», coma decimal,
 * fechas día/mes/año y BOM para que respete los acentos. Funcionan igual en
 * Google Sheets y LibreOffice.
 */
export type Celda = string | number | null | undefined;

const SEPARADOR = ";";

function celda(v: Celda): string {
  if (v === null || v === undefined) return "";
  let t = typeof v === "number" ? String(v).replace(".", ",") : String(v);
  // Evita que Excel interprete el texto como fórmula (=, +, -, @).
  if (/^[=+\-@]/.test(t) && !/^-?\d+(,\d+)?$/.test(t)) t = `'${t}`;
  return /[";\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function armarCsv(encabezado: string[], filas: Celda[][]): string {
  return `\uFEFF${[encabezado, ...filas].map((f) => f.map(celda).join(SEPARADOR)).join("\r\n")}\r\n`;
}

/** "45000.50" (numeric de la base) → 45000.5 para que Excel lo tome como número. */
export const numero = (v: string | number | null | undefined) => (v === null || v === undefined || v === "" ? null : Number(v));

/** "2026-11-16" o un instante (en hora de Tucumán) → "16/11/2026". */
export function fechaCsv(v: string | null | undefined): string {
  const f = fecha(v);
  return f === "—" ? "" : f;
}

export function respuestaCsv(nombre: string, contenido: string): Response {
  return new Response(contenido, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
    },
  });
}

/** Valores internos ("en_curso", "pendiente") → "En curso", "Pendiente". */
export const legible = (v: string | null | undefined) => (v ? `${v[0].toUpperCase()}${v.slice(1).replace(/_/g, " ")}` : "");
