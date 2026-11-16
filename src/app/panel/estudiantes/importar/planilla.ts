/**
 * Lectura de planillas (CSV) para la carga inicial. Funciones puras: las usa
 * el servidor, que es quien decide qué entra. Acepta lo que exporta Excel en
 * castellano (separador «;») y Google Sheets (separador «,»).
 */

export const MAX_FILAS = 500;

/** Columnas que entiende la importación, con los nombres alternativos que aceptamos. */
export const COLUMNAS = {
  apellidos: ["apellidos", "apellido", "apellidosestudiante", "apellidoalumno", "apellidoestudiante"],
  nombres: ["nombres", "nombre", "nombresestudiante", "nombrealumno", "nombreestudiante"],
  tipo_documento: ["tipodocumento", "tipodoc", "tipo"],
  documento: ["documento", "dni", "nrodocumento", "numerodocumento", "nrodni", "doc"],
  fecha_nacimiento: ["fechanacimiento", "nacimiento", "fechadenacimiento", "fnac"],
  email: ["email", "correo", "mail", "correoelectronico", "emailestudiante"],
  telefono: ["telefono", "celular", "whatsapp", "tel", "telefonoestudiante"],
  resp_apellidos: ["respapellidos", "apellidosresponsable", "responsableapellidos", "apellidoresponsable", "apellidotutor", "apellidostutor"],
  resp_nombres: ["respnombres", "nombresresponsable", "responsablenombres", "nombreresponsable", "nombretutor", "nombrestutor"],
  resp_documento: ["respdocumento", "dniresponsable", "documentoresponsable", "dnitutor"],
  resp_email: ["respemail", "emailresponsable", "correoresponsable", "mailresponsable", "emailtutor"],
  resp_telefono: ["resptelefono", "telefonoresponsable", "celularresponsable", "whatsappresponsable", "telefonotutor"],
  resp_parentesco: ["respparentesco", "parentesco", "vinculo"],
  deuda: ["deuda", "saldo", "saldoanterior", "debe", "deudainicial"],
  deuda_detalle: ["deudadetalle", "detalledeuda", "detalle", "concepto"],
} as const;
export type Columna = keyof typeof COLUMNAS;

export const ENCABEZADO_MODELO: Columna[] = [
  "apellidos", "nombres", "documento", "fecha_nacimiento", "email", "telefono",
  "resp_apellidos", "resp_nombres", "resp_documento", "resp_email", "resp_telefono", "resp_parentesco",
  "deuda", "deuda_detalle",
];

const clave = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/** CSV → filas de celdas. Respeta comillas, saltos de línea dentro de comillas y BOM. */
export function leerCsv(texto: string): string[][] {
  const limpio = texto.replace(/^\uFEFF/, "");
  const primera = limpio.split(/\r?\n/, 1)[0] ?? "";
  const separador = (primera.match(/;/g)?.length ?? 0) >= (primera.match(/,/g)?.length ?? 0) && primera.includes(";") ? ";"
    : (primera.match(/\t/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? "\t" : ",";
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let comillas = false;
  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (comillas) {
      if (c === '"' && limpio[i + 1] === '"') { celda += '"'; i++; }
      else if (c === '"') comillas = false;
      else celda += c;
    } else if (c === '"') comillas = true;
    else if (c === separador) { fila.push(celda); celda = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpio[i + 1] === "\n") i++;
      fila.push(celda); celda = "";
      if (fila.some((x) => x.trim() !== "")) filas.push(fila);
      fila = [];
    } else celda += c;
  }
  fila.push(celda);
  if (fila.some((x) => x.trim() !== "")) filas.push(fila);
  return filas;
}

/** Qué columna de la planilla corresponde a cada dato. */
export function mapearEncabezado(encabezado: string[]): { mapa: Partial<Record<Columna, number>>; ignoradas: string[] } {
  const mapa: Partial<Record<Columna, number>> = {};
  const ignoradas: string[] = [];
  encabezado.forEach((titulo, i) => {
    const k = clave(titulo);
    const col = (Object.keys(COLUMNAS) as Columna[]).find((c) => clave(c) === k || COLUMNAS[c].some((alt) => clave(alt) === k));
    if (col && mapa[col] === undefined) mapa[col] = i;
    else if (titulo.trim()) ignoradas.push(titulo.trim());
  });
  return { mapa, ignoradas };
}

/** "3/5/2012", "03-05-2012" o "2012-05-03" → "2012-05-03". */
export function fechaIso(valor: string): string | null {
  const v = valor.trim();
  if (!v) return "";
  let a: number, m: number, d: number;
  let r = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (r) [a, m, d] = [Number(r[1]), Number(r[2]), Number(r[3])];
  else if ((r = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(v))) {
    [d, m, a] = [Number(r[1]), Number(r[2]), Number(r[3])];
    if (a < 100) a += a > 30 ? 1900 : 2000;
  } else return null;
  const f = new Date(Date.UTC(a, m - 1, d));
  if (f.getUTCFullYear() !== a || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** "45.000,50" | "45000.5" | "$ 45.000" → "45000.50". Vacío → "". Inválido → null. */
export function importe(valor: string): string | null {
  const v = valor.trim().replace(/\s|\$/g, "");
  if (!v) return "";
  let n: string;
  if (/,\d{1,2}$/.test(v)) n = v.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(v)) n = v.replace(/\./g, "");
  else n = v.replace(/,/g, "");
  return /^\d{1,10}(\.\d{1,2})?$/.test(n) ? n : null;
}

export function documento(valor: string): string | null {
  const v = valor.trim();
  if (!v) return "";
  const solo = v.replace(/[.\s-]/g, "");
  if (/^\d{6,9}$/.test(solo)) return solo;
  const otro = v.replace(/\s/g, "").toUpperCase();
  return /^[A-Z0-9-]{4,20}$/.test(otro) ? otro : null;
}

export type Dato = Columna | "resp_tipo_documento";

export interface FilaNormalizada {
  numero: number; // fila en la planilla (1 = encabezado)
  datos: Record<Dato, string>;
  errores: string[];
}

function tipoDocumento(declarado: string, numero: string) {
  if (!numero) return "";
  const t = declarado.trim().toUpperCase();
  if (t.startsWith("PAS")) return "PASAPORTE";
  if (t === "DNI" || t === "OTRO") return t;
  return /^\d+$/.test(numero) ? "DNI" : "OTRO";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Valida y normaliza una fila. Los errores se muestran tal cual a la persona. */
export function normalizarFila(celdas: string[], mapa: Partial<Record<Columna, number>>, numero: number): FilaNormalizada {
  const crudo = (c: Columna) => (mapa[c] !== undefined ? (celdas[mapa[c]!] ?? "").trim() : "");
  const errores: string[] = [];
  const datos = Object.fromEntries((Object.keys(COLUMNAS) as Columna[]).map((c) => [c, crudo(c)])) as Record<Dato, string>;

  if (!datos.apellidos) errores.push("Falta el apellido");
  if (!datos.nombres) errores.push("Falta el nombre");
  for (const [campo, etiqueta] of [["documento", "documento"], ["resp_documento", "documento del responsable"]] as const) {
    const d = documento(datos[campo]);
    if (d === null) errores.push(`Revisá el ${etiqueta}`);
    else datos[campo] = d;
  }
  datos.tipo_documento = tipoDocumento(datos.tipo_documento, datos.documento);
  datos.resp_tipo_documento = tipoDocumento("", datos.resp_documento);
  const f = fechaIso(datos.fecha_nacimiento);
  if (f === null) errores.push("Revisá la fecha de nacimiento (día/mes/año)");
  else datos.fecha_nacimiento = f;
  for (const [campo, etiqueta] of [["email", "email"], ["resp_email", "email del responsable"]] as const) {
    datos[campo] = datos[campo].toLowerCase();
    if (datos[campo] && !EMAIL.test(datos[campo])) errores.push(`Revisá el ${etiqueta}`);
  }
  const hayResp = Boolean(datos.resp_apellidos || datos.resp_nombres || datos.resp_documento || datos.resp_email || datos.resp_telefono);
  if (hayResp && (!datos.resp_apellidos || !datos.resp_nombres)) errores.push("Del responsable faltan nombre o apellido");
  const i = importe(datos.deuda);
  if (i === null) errores.push("Revisá la deuda (por ejemplo 45.000)");
  else datos.deuda = i;
  for (const c of ["apellidos", "nombres", "resp_apellidos", "resp_nombres"] as const) if (datos[c].length > 80) errores.push("Un nombre supera los 80 caracteres");
  if (datos.deuda_detalle.length > 200) datos.deuda_detalle = datos.deuda_detalle.slice(0, 200);
  return { numero, datos, errores };
}

export function csvModelo(): string {
  const ejemplo = ["Pérez", "Lucía", "45123456", "03/05/2014", "", "", "Gómez", "Laura", "28999888", "laura@ejemplo.com", "3815551234", "Madre", "45.000", "Cuota de noviembre"];
  return `\uFEFF${ENCABEZADO_MODELO.join(";")}\r\n${ejemplo.join(";")}\r\n`;
}
