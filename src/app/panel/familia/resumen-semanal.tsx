import Link from "next/link";
import { REACCION } from "@/app/panel/actividades/comun";
import { Aviso } from "@/componentes/ui";
import { institucion } from "@/config/institucion";
import { fechaHora, hoyISO } from "@/lib/formato";
import { fraseResumen, normalizarResumen, type ResumenSemanal } from "@/lib/resumen";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { CompartirResumen } from "./compartir-resumen";

const dia = (iso: string, opciones: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", ...opciones }).format(new Date(`${iso}T12:00:00Z`));

function rango(desde: string, hasta: string) {
  const mismoMes = desde.slice(0, 7) === hasta.slice(0, 7);
  return mismoMes
    ? `del ${dia(desde, { day: "numeric" })} al ${dia(hasta, { day: "numeric", month: "long" })}`
    : `del ${dia(desde, { day: "numeric", month: "long" })} al ${dia(hasta, { day: "numeric", month: "long" })}`;
}

/** La semana de un estudiante de un vistazo, con texto listo para compartir. */
export async function ResumenDeLaSemana({ estudianteId, nombre, esPropio, anterior }: {
  estudianteId: string; nombre: string; esPropio: boolean; anterior: boolean;
}) {
  const supabase = await crearClienteServidor();
  const referencia = new Date(`${hoyISO()}T12:00:00Z`);
  if (anterior) referencia.setUTCDate(referencia.getUTCDate() - 7);
  const { data, error } = await supabase.rpc("resumen_semanal", { p_estudiante: estudianteId, p_desde: referencia.toISOString().slice(0, 10) });
  if (error || !data) {
    return <div className="mb-4"><Aviso tono="peligro">No pudimos armar el resumen de la semana. Actualizá la página.</Aviso></div>;
  }
  const r = normalizarResumen(data as ResumenSemanal);
  const frase = fraseResumen(r, nombre, esPropio, !anterior);
  const a = r.asistencia;
  const vino = a.presente + a.tarde;
  const meta = r.meta_semanal ?? 0;
  const pctMeta = meta ? Math.min(100, Math.round((100 * r.practica.xp) / meta)) : 0;
  const diferencia = r.practica.xp - r.xp_semana_anterior;
  const marcas = [
    ...Array(a.presente).fill(["bg-exito", "Presente"]),
    ...Array(a.tarde).fill(["bg-alerta", "Tarde"]),
    ...Array(a.justificada).fill(["bg-cielo", "Justificada"]),
    ...Array(a.ausente).fill(["bg-acento", "Ausente"]),
  ] as [string, string][];

  return (
    <section aria-labelledby={`sem-${estudianteId}`} className="mb-6 overflow-hidden rounded-base border border-borde bg-superficie">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-borde bg-marca px-4 py-3 text-sobre-marca sm:px-5">
        <h3 id={`sem-${estudianteId}`} className="text-base font-bold">
          {anterior ? "La semana pasada" : "Esta semana"} <span className="font-normal opacity-80">· {rango(r.desde, r.hasta)}</span>
        </h3>
        <nav aria-label="Elegir semana" className="flex rounded-full bg-white/10 p-1 text-sm font-semibold">
          <Link href="/panel/familia" scroll={false} aria-current={!anterior ? "page" : undefined}
            className="rounded-full px-3 py-1.5 aria-[current]:bg-white aria-[current]:text-marca">Esta</Link>
          <Link href="/panel/familia?semana=anterior" scroll={false} aria-current={anterior ? "page" : undefined}
            className="rounded-full px-3 py-1.5 aria-[current]:bg-white aria-[current]:text-marca">Anterior</Link>
        </nav>
      </div>

      <div className="grid gap-px bg-borde sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-superficie p-4">
          <p className="text-sm font-semibold text-suave">Clases</p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight text-marca-fuerte">
            {a.clases ? <>{vino}<span className="text-lg font-semibold text-suave"> de {a.clases}</span></> : <span className="text-lg font-semibold text-suave">{anterior ? "Sin clases registradas" : "Sin asistencia tomada todavía"}</span>}
          </p>
          {marcas.length ? (
            <p className="mt-2 flex flex-wrap gap-1" role="img" aria-label={`${a.presente} presente, ${a.tarde} tarde, ${a.justificada} justificada, ${a.ausente} ausente`}>
              {marcas.map(([color], i) => <span key={i} className={`size-3.5 rounded-full ${color}`} />)}
            </p>
          ) : null}
        </div>

        <div className="bg-superficie p-4">
          <p className="text-sm font-semibold text-suave">Actividades</p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight text-marca-fuerte">
            {r.entregadas}<span className="text-lg font-semibold text-suave"> {r.entregadas === 1 ? "entregada" : "entregadas"}</span>
          </p>
          {r.notas.length ? (
            <ul className="mt-2 space-y-1 text-sm">
              {r.notas.slice(0, 3).map((x, i) => (
                <li key={i} className="flex items-baseline justify-between gap-2">
                  <span className="truncate" lang="en">{x.titulo}</span>
                  <strong className="shrink-0">
                    {x.nota !== null ? `${Number(x.nota).toLocaleString("es-AR")}/${Number(x.puntaje_max).toLocaleString("es-AR")}` : ""}
                    {x.reaccion && REACCION[x.reaccion] ? ` ${REACCION[x.reaccion].icono}` : ""}
                  </strong>
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-suave">Sin correcciones nuevas.</p>}
        </div>

        <div className="bg-superficie p-4">
          <p className="text-sm font-semibold text-suave">Práctica</p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight text-marca-fuerte">
            {r.practica.dias}<span className="text-lg font-semibold text-suave"> {r.practica.dias === 1 ? "día" : "días"} · {r.practica.xp} XP</span>
          </p>
          {meta ? (
            <>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-pizarra" aria-hidden>
                <div className="h-full rounded-full bg-acento" style={{ width: `${pctMeta}%` }} />
              </div>
              <p className="mt-1 text-xs text-suave">
                {pctMeta >= 100 ? "Meta semanal cumplida 🎯" : `${pctMeta} % de la meta de ${meta} XP`}
                {r.xp_semana_anterior || r.practica.xp ? ` · ${diferencia >= 0 ? "+" : ""}${diferencia} XP que la semana anterior` : ""}
              </p>
            </>
          ) : null}
          {r.racha && !anterior ? <p className="mt-1 text-xs font-semibold text-marca">🔥 Racha de {r.racha} {r.racha === 1 ? "día" : "días"}</p> : null}
        </div>

        <div className="bg-superficie p-4">
          <p className="text-sm font-semibold text-suave">Medallas</p>
          {r.medallas.length ? (
            <ul className="mt-2 flex flex-wrap gap-2">
              {r.medallas.map((m, i) => (
                <li key={i} className="inline-flex items-center gap-1.5 rounded-full bg-cielo-suave px-3 py-1 text-sm font-semibold">
                  <span aria-hidden>{m.icono}</span>{m.nombre}
                </li>
              ))}
            </ul>
          ) : <p className="mt-2 text-sm text-suave">{anterior ? "No hubo medallas nuevas." : "Todavía ninguna nueva esta semana."}</p>}
        </div>
      </div>

      {(!anterior && r.proximas.length) || r.sin_entregar.length ? (
        <div className="border-t border-borde px-4 py-3 text-sm sm:px-5">
          {!anterior && r.proximas.length ? (
            <p><strong>Vence pronto:</strong> {r.proximas.map((p) => `${p.titulo} (${fechaHora(p.cierra_en)})`).join(" · ")}</p>
          ) : null}
          {r.sin_entregar.length ? (
            <p className="mt-1 text-acento"><strong>Quedó sin entregar:</strong> {r.sin_entregar.map((p) => p.titulo).join(" · ")}</p>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-borde bg-cielo-suave/50 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="max-w-prose text-sm">{frase}</p>
        {esPropio ? null : <CompartirResumen texto={`${frase}\n— Resumen del campus de ${institucion.nombre}`} />}
      </div>
    </section>
  );
}
