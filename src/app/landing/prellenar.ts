/** Puente entre las piezas interactivas de la landing y el formulario de consulta. */
export interface Prellenado {
  cursoId?: string;
  tipo?: "consulta" | "preinscripcion";
  mensaje?: string;
}

export const EVENTO_PRELLENAR = "oakland:prellenar";

export function prellenarConsulta(datos: Prellenado) {
  window.dispatchEvent(new CustomEvent<Prellenado>(EVENTO_PRELLENAR, { detail: datos }));
  const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.getElementById("consulta")?.scrollIntoView({ behavior: reducido ? "auto" : "smooth", block: "start" });
  window.setTimeout(() => document.getElementById("nombre_contacto")?.focus({ preventScroll: true }), reducido ? 0 : 600);
}
