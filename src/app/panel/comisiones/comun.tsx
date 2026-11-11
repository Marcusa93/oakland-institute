import { Campo, Selector, type Tono } from "@/componentes/ui";
import { diaSemana } from "@/lib/formato";

export const ESTADOS_COMISION: Array<[string, string, Tono]> = [
  ["borrador", "Borrador", "neutro"], ["abierta", "Abierta a inscripciones", "exito"], ["en_curso", "En curso", "marca"],
  ["finalizada", "Finalizada", "neutro"], ["cancelada", "Cancelada", "peligro"],
];
export const estadoComision = (estado: string): [string, Tono] => {
  const e = ESTADOS_COMISION.find(([v]) => v === estado);
  return e ? [e[1], e[2]] : [estado, "neutro"];
};

export const hora = (h: string | null | undefined) => (h ?? "").slice(0, 5);

export interface Horario { id: string; dia_semana: number; hora_inicio: string; hora_fin: string; aulas?: { nombre: string } | { nombre: string }[] | null }

export function textoHorario(h: Horario) {
  const aula = Array.isArray(h.aulas) ? h.aulas[0] : h.aulas;
  return `${diaSemana(h.dia_semana)} ${hora(h.hora_inicio)} a ${hora(h.hora_fin)}${aula?.nombre ? ` · ${aula.nombre}` : ""}`;
}
export const ordenarHorarios = <T extends Horario>(hs: T[]) =>
  [...hs].sort((a, b) => a.dia_semana - b.dia_semana || a.hora_inicio.localeCompare(b.hora_inicio));

/** Campos del alta de horario (día, horas y aula). `prefijo` mantiene únicos los id. */
export function CamposHorario({ prefijo, aulas }: { prefijo: string; aulas: Array<{ id: string; nombre: string; sede?: string | null }> }) {
  return (
    <>
      <Selector id={`${prefijo}-dia`} name="dia" etiqueta="Día" defaultValue="1">
        {[1, 2, 3, 4, 5, 6, 7].map((d) => <option key={d} value={d}>{diaSemana(d)}</option>)}
      </Selector>
      <Campo id={`${prefijo}-inicio`} name="inicio" type="time" etiqueta="Hora de inicio" required />
      <Campo id={`${prefijo}-fin`} name="fin" type="time" etiqueta="Hora de fin" required />
      <Selector id={`${prefijo}-aula`} name="aula" etiqueta="Aula (opcional)" defaultValue="">
        <option value="">Sin aula asignada</option>
        {aulas.map((a) => <option key={a.id} value={a.id}>{a.nombre}{a.sede ? ` — ${a.sede}` : ""}</option>)}
      </Selector>
    </>
  );
}
