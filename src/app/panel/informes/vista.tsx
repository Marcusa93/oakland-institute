// Informe visual (sin "use client"): se usa en el armado y en la versión imprimible.
import { ETIQUETA_EVALUACION, ETIQUETA_HABILIDAD, ICONO_HABILIDAD, numero } from "@/app/panel/actividades/comun";
import { Insignia, Tabla } from "@/componentes/ui";
import { fecha } from "@/lib/formato";
import { resumir, type DatosInforme } from "./comun";

const ALERTA: Record<string, string> = { ausentismo: "Ausentismo", participacion: "Participación", rendimiento: "Rendimiento" };
const ESTADO: Record<string, string> = { "sin entregar": "Sin entregar", en_curso: "Sin entregar", entregada: "Entregada", corregida: "Corregida" };

function Anillo({ pct, etiqueta }: { pct: number | null; etiqueta: string }) {
  const valor = pct ?? 0;
  const color = pct === null ? "var(--borde)" : valor >= 85 ? "var(--exito)" : valor >= 70 ? "var(--alerta)" : "var(--acento)";
  return (
    <div role="img" aria-label={etiqueta} className="grid size-24 shrink-0 place-items-center rounded-full [print-color-adjust:exact]"
      style={{ background: `conic-gradient(${color} ${valor * 3.6}deg, var(--pizarra) 0)` }}>
      <div className="grid size-[4.5rem] place-items-center rounded-full bg-superficie">
        <span className="text-xl font-extrabold">{pct === null ? "—" : `${pct} %`}</span>
      </div>
    </div>
  );
}

function Barra({ pct }: { pct: number }) {
  return (
    <div className="h-2 w-full min-w-16 overflow-hidden rounded-full bg-pizarra [print-color-adjust:exact]" aria-hidden>
      <div className={`h-full rounded-full ${pct >= 70 ? "bg-exito" : pct >= 40 ? "bg-alerta" : "bg-acento"}`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

export function VistaInforme({ datos: d }: { datos: DatosInforme }) {
  const r = resumir(d);
  const a = d.asistencia;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-2xl font-extrabold tracking-tight">{d.estudiante?.nombre ?? "Estudiante"}</p>
          <p className="text-sm text-suave">Legajo {d.estudiante?.legajo ?? "—"} · Período {fecha(d.periodo.desde)} al {fecha(d.periodo.hasta)}</p>
        </div>
        <ul className="flex flex-wrap gap-1.5">
          {d.comisiones.map((c, i) => <li key={i}><Insignia tono="marca">{c.comision} · {c.nivel}</Insignia></li>)}
        </ul>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4">
        <section className="flex items-center gap-3 rounded-base border border-borde bg-superficie p-4 break-inside-avoid">
          <Anillo pct={a.clases ? a.porcentaje : null} etiqueta={a.clases ? `Asistencia ${a.porcentaje} %` : "Sin asistencia registrada"} />
          <div>
            <h3 className="font-bold">Asistencia</h3>
            <p className="text-xs text-suave">{a.clases ? `${a.presente} presentes · ${a.tarde} tarde · ${a.ausente} ausentes · ${a.justificada} justif.` : "Sin clases registradas"}</p>
          </div>
        </section>
        <section className="flex items-center gap-3 rounded-base border border-borde bg-superficie p-4 break-inside-avoid">
          <Anillo pct={r.promedio} etiqueta={r.promedio === null ? "Sin notas" : `Promedio ${r.promedio} %`} />
          <div>
            <h3 className="font-bold">Actividades</h3>
            <p className="text-xs text-suave">{r.entregadas} de {d.actividades.length} entregadas{r.promedio !== null ? " · promedio del puntaje" : ""}</p>
          </div>
        </section>
        <section className="rounded-base border border-borde bg-superficie p-4 break-inside-avoid">
          <h3 className="font-bold">Práctica</h3>
          <p className="mt-1 text-3xl font-extrabold tracking-tight text-marca-fuerte">{d.practica.xp}<span className="text-sm font-semibold text-suave"> XP</span></p>
          <p className="text-xs text-suave">{d.practica.ejercicios} ejercicios · {d.practica.dias} días{r.aciertosPractica !== null ? ` · ${r.aciertosPractica} % aciertos` : ""}</p>
        </section>
        <section className={`rounded-base border p-4 break-inside-avoid ${d.alertas_abiertas.length ? "border-alerta bg-alerta-suave" : "border-borde bg-superficie"}`}>
          <h3 className="font-bold">Alertas abiertas</h3>
          <p className="mt-1 text-3xl font-extrabold tracking-tight">{d.alertas_abiertas.length}</p>
          <p className="text-xs text-suave">{d.alertas_abiertas.length ? "Ver detalle abajo" : "Sin señales de alerta"}</p>
        </section>
      </div>

      {r.porHabilidad.length ? (
        <section className="rounded-base border border-borde bg-superficie p-4 break-inside-avoid">
          <h3 className="font-bold">Por habilidad</h3>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {r.porHabilidad.map((h) => (
              <li key={h.habilidad} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0"><span aria-hidden>{ICONO_HABILIDAD[h.habilidad]} </span>{ETIQUETA_HABILIDAD[h.habilidad] ?? h.habilidad}</span>
                <Barra pct={h.pct} /><span className="w-12 shrink-0 text-right font-semibold">{h.pct} %</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {d.actividades.length ? (
        <section className="break-inside-avoid">
          <h3 className="mb-2 font-bold">Actividades y notas</h3>
          <Tabla leyenda="Actividades del período" encabezados={["Actividad", "Habilidad", "Tipo", "Estado", "Nota"]}>
            {d.actividades.map((x, i) => {
              const pct = x.nota !== null && x.nota !== undefined ? Math.round((100 * Number(x.nota)) / Number(x.puntaje_max)) : null;
              return (
                <tr key={i}>
                  <td lang="en">{x.titulo}</td>
                  <td>{ETIQUETA_HABILIDAD[x.habilidad] ?? x.habilidad}</td>
                  <td>{ETIQUETA_EVALUACION[x.evaluacion] ?? x.evaluacion}</td>
                  <td>{ESTADO[x.estado] ?? x.estado}</td>
                  <td>{pct === null ? "—" : <div className="flex items-center gap-2"><span className="font-semibold">{numero(x.nota)}/{numero(x.puntaje_max)}</span><Barra pct={pct} /></div>}</td>
                </tr>
              );
            })}
          </Tabla>
        </section>
      ) : null}

      {d.medallas.length || d.alertas_abiertas.length ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {d.medallas.length ? (
            <section className="rounded-base border border-borde bg-superficie p-4 break-inside-avoid">
              <h3 className="font-bold">Medallas</h3>
              <ul className="mt-2 flex flex-wrap gap-1.5">{d.medallas.map((m) => <li key={m}><Insignia tono="exito">🏅 {m}</Insignia></li>)}</ul>
            </section>
          ) : null}
          {d.alertas_abiertas.length ? (
            <section className="rounded-base border border-borde bg-superficie p-4 break-inside-avoid">
              <h3 className="font-bold">Señales a acompañar</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {d.alertas_abiertas.map((x, i) => <li key={i}><strong>{ALERTA[x.tipo] ?? x.tipo}:</strong> {x.detalle}</li>)}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
