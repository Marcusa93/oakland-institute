import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, Boton, Campo, EstadoVacio, Insignia, Selector, Tarjeta, Titulo } from "@/componentes/ui";
import { fechaHora, hoyISO } from "@/lib/formato";
import { esGestion } from "@/lib/permisos";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { comisionesDeSesion } from "../actividades/datos";
import { RANGOS } from "./periodos";

export const metadata: Metadata = { title: "Informes" };

interface Informe {
  id: string; periodo: string; estado: string; destinatario: string; creado_en: string; enviado_en: string | null; autor_cuenta_id: string;
  estudiantes: { personas: { nombres: string; apellidos: string } | null } | null;
}
interface Matricula { estudiante_id: string; estudiantes: { legajo: string; personas: { nombres: string; apellidos: string } | null } | null; comisiones: { nombre: string } | null }

export default async function Informes() {
  const sesion = await exigirPermiso("informes", "crear");
  const supabase = await crearClienteServidor();
  const gestion = esGestion(sesion.perfiles);
  const verTodos = sesion.perfiles.includes("direccion");

  let consulta = supabase.from("informes")
    .select("id, periodo, estado, destinatario, creado_en, enviado_en, autor_cuenta_id, estudiantes(personas(nombres, apellidos))")
    .order("creado_en", { ascending: false }).limit(100);
  if (!verTodos) consulta = consulta.eq("autor_cuenta_id", sesion.cuentaId);
  const [informesR, { comisiones, error: errorComisiones }] = await Promise.all([consulta, comisionesDeSesion(supabase, sesion, gestion)]);
  const informes = (informesR.data ?? []) as unknown as Informe[];

  const matriculasR = comisiones.length
    ? await supabase.from("matriculas").select("estudiante_id, estudiantes(legajo, personas(nombres, apellidos)), comisiones(nombre)")
        .in("comision_id", comisiones.map((k) => k.id)).eq("estado", "activa").limit(2000)
    : null;
  const estudiantes = new Map<string, { nombre: string; detalle: string[] }>();
  for (const m of (matriculasR?.data ?? []) as unknown as Matricula[]) {
    const p = m.estudiantes?.personas;
    if (!p) continue;
    const e = estudiantes.get(m.estudiante_id) ?? { nombre: `${p.apellidos}, ${p.nombres}`, detalle: [] };
    if (m.comisiones?.nombre) e.detalle.push(m.comisiones.nombre);
    estudiantes.set(m.estudiante_id, e);
  }
  const opciones = [...estudiantes].sort((a, b) => a[1].nombre.localeCompare(b[1].nombre, "es"));
  const fallo = informesR.error || errorComisiones || matriculasR?.error;
  const hoy = hoyISO();

  return (
    <>
      <Titulo descripcion="Informes por estudiante con asistencia, actividades, práctica y alertas calculadas por el sistema, más tu comentario.">Informes</Titulo>
      {fallo ? <div className="mb-4"><Aviso tono="peligro">No pudimos cargar toda la información. Actualizá la página.</Aviso></div> : null}

      <Tarjeta className="mb-8">
        <h2 className="text-lg font-bold">Nuevo informe</h2>
        {opciones.length === 0 ? (
          <p className="mt-1 text-sm text-suave">{gestion ? "No hay estudiantes con inscripción activa." : "No tenés estudiantes en tus comisiones."}</p>
        ) : (
          <form action="/panel/informes/nuevo" method="get" className="mt-3 grid gap-4 md:grid-cols-2">
            <Selector id="inf-estudiante" name="estudiante" etiqueta="Estudiante" required defaultValue="">
              <option value="" disabled>Elegí un estudiante…</option>
              {opciones.map(([id, e]) => <option key={id} value={id}>{e.nombre}{e.detalle.length ? ` — ${e.detalle.join(", ")}` : ""}</option>)}
            </Selector>
            <fieldset>
              <legend className="text-sm font-medium">Período</legend>
              <div className="mt-1 flex flex-wrap gap-2">
                {RANGOS.map(([v, e], i) => (
                  <label key={v} className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-borde px-4 text-sm font-medium has-[:checked]:border-marca has-[:checked]:bg-marca has-[:checked]:text-sobre-marca has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-cielo">
                    <input type="radio" name="rango" value={v} defaultChecked={i === 1} className="sr-only" />{e}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-2 gap-3 md:col-start-2">
              <Campo id="inf-desde" name="desde" type="date" etiqueta="Desde" max={hoy} ayuda="Solo para «Otras fechas»." />
              <Campo id="inf-hasta" name="hasta" type="date" etiqueta="Hasta" max={hoy} />
            </div>
            <div className="flex items-end md:col-span-2"><Boton type="submit">Armar informe</Boton></div>
          </form>
        )}
      </Tarjeta>

      <h2 className="mb-3 text-lg font-bold">{verTodos ? "Todos los informes" : "Mis informes"}</h2>
      {!fallo && informes.length === 0 ? (
        <EstadoVacio titulo="Todavía no hay informes">Elegí un estudiante y un período: el sistema arma los datos y vos sumás tu mirada.</EstadoVacio>
      ) : (
        <ul className="divide-y divide-borde rounded-base border border-borde bg-superficie">
          {informes.map((i) => {
            const p = i.estudiantes?.personas;
            return (
              <li key={i.id}>
                <Link href={`/panel/informes/${i.id}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-marca-suave">
                  <span>
                    <span className="font-semibold">{p ? `${p.nombres} ${p.apellidos}` : "Estudiante"}</span>
                    <span className="block text-xs text-suave">{i.periodo} · {i.estado === "enviado" ? `enviado ${fechaHora(i.enviado_en)}` : `creado ${fechaHora(i.creado_en)}`}</span>
                  </span>
                  <span className="flex flex-wrap gap-1.5">
                    {verTodos && i.autor_cuenta_id === sesion.cuentaId ? <Insignia>Mío</Insignia> : null}
                    <Insignia tono={i.destinatario === "familia" ? "marca" : "neutro"}>{i.destinatario === "familia" ? "Para la familia" : "Para dirección"}</Insignia>
                    <Insignia tono={i.estado === "enviado" ? "exito" : "alerta"}>{i.estado === "enviado" ? "Enviado" : "Borrador"}</Insignia>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
