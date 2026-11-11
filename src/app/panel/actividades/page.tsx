import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, Enlace, EstadoVacio, Insignia, Tarjeta, Titulo } from "@/componentes/ui";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import {
  ESTADO_ACTIVIDAD, ETIQUETA_EVALUACION, ETIQUETA_HABILIDAD, ICONO_HABILIDAD, TONO_EVALUACION, ahora, porcentaje, vencimiento,
} from "./comun";
import { comisionesDeSesion, textoComision } from "./datos";

export const metadata: Metadata = { title: "Actividades" };

interface Fila {
  id: string; comision_id: string; titulo: string; habilidad: string; evaluacion: string; estado: string;
  cierra_en: string | null; creada_en: string;
  entregas: { estado: string; publicada: boolean }[];
}

export default async function Actividades() {
  const sesion = await exigirPermiso("actividades", "aprobar");
  const supabase = await crearClienteServidor();
  const todas = sesion.perfiles.includes("direccion");
  const { comisiones, error } = await comisionesDeSesion(supabase, sesion, todas);
  const ids = comisiones.map((k) => k.id);

  const [actividadesR, matriculasR] = ids.length
    ? await Promise.all([
        supabase.from("actividades")
          .select("id, comision_id, titulo, habilidad, evaluacion, estado, cierra_en, creada_en, entregas(estado, publicada)")
          .in("comision_id", ids).order("creada_en", { ascending: false }).limit(300),
        supabase.from("matriculas").select("comision_id").in("comision_id", ids).eq("estado", "activa"),
      ])
    : [null, null];
  const actividades = (actividadesR?.data ?? []) as unknown as Fila[];
  const inscriptos = new Map<string, number>();
  for (const m of (matriculasR?.data ?? []) as { comision_id: string }[]) inscriptos.set(m.comision_id, (inscriptos.get(m.comision_id) ?? 0) + 1);
  const fallo = error || actividadesR?.error || matriculasR?.error;
  const referencia = ahora();

  const paraCorregir = actividades.reduce((n, a) => n + a.entregas.filter((e) => e.estado === "entregada").length, 0);
  const sinPublicar = actividades.reduce((n, a) => n + a.entregas.filter((e) => e.estado === "corregida" && !e.publicada).length, 0);
  const abiertas = actividades.filter((a) => a.estado === "publicada" && !vencimiento(a.cierra_en, referencia).vencida).length;

  return (
    <>
      <Titulo descripcion="Armá actividades para tus comisiones, seguí las entregas en vivo y corregí en pocos toques."
        acciones={comisiones.length ? <Enlace href="/panel/actividades/nueva">+ Nueva actividad</Enlace> : null}>
        Actividades
      </Titulo>
      {fallo ? <div className="mb-4"><Aviso tono="peligro">No pudimos cargar las actividades. Actualizá la página.</Aviso></div> : null}

      {actividades.length ? (
        <ul className="mb-6 grid gap-3 sm:grid-cols-3" aria-label="Resumen">
          <Resumen valor={abiertas} etiqueta={abiertas === 1 ? "actividad abierta" : "actividades abiertas"} />
          <Resumen valor={paraCorregir} etiqueta={paraCorregir === 1 ? "entrega para corregir" : "entregas para corregir"} destacado={paraCorregir > 0} />
          <Resumen valor={sinPublicar} etiqueta={sinPublicar === 1 ? "corrección sin publicar" : "correcciones sin publicar"} />
        </ul>
      ) : null}

      {!fallo && comisiones.length === 0 ? (
        <EstadoVacio titulo="No tenés comisiones asignadas">Cuando administración te asigne una comisión, vas a poder crear actividades para tus estudiantes.</EstadoVacio>
      ) : null}

      <div className="space-y-8">
        {comisiones.map((k) => {
          const suyas = actividades.filter((a) => a.comision_id === k.id);
          if (todas && !suyas.length) return null;
          const n = inscriptos.get(k.id) ?? 0;
          return (
            <section key={k.id} aria-labelledby={`com-${k.id}`}>
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h2 id={`com-${k.id}`} className="text-lg font-bold">{textoComision(k)}</h2>
                <p className="text-sm text-suave">
                  {n} {n === 1 ? "estudiante" : "estudiantes"} ·{" "}
                  <Link href={`/panel/actividades/nueva?comision=${k.id}`} className="font-semibold text-marca hover:underline">Crear para esta comisión</Link>
                </p>
              </div>
              {suyas.length === 0 ? (
                <EstadoVacio titulo="Sin actividades todavía">Probá con una plantilla: en un minuto tenés un quiz listo.</EstadoVacio>
              ) : (
                <ul className="grid gap-3 md:grid-cols-2">
                  {suyas.map((a) => {
                    const entregadas = a.entregas.filter((e) => e.estado !== "en_curso").length;
                    const pendientes = a.entregas.filter((e) => e.estado === "entregada").length;
                    const v = vencimiento(a.cierra_en, referencia);
                    const [estado, tono] = ESTADO_ACTIVIDAD[a.estado] ?? [a.estado, "neutro"];
                    const pct = porcentaje(entregadas, n);
                    return (
                      <li key={a.id}>
                        <Link href={`/panel/actividades/${a.id}`} className="block h-full rounded-base focus-visible:outline-offset-4">
                          <Tarjeta className="h-full transition-shadow hover:shadow-md motion-reduce:transition-none">
                            <div className="flex items-start justify-between gap-2">
                              <p className="font-bold" lang="en"><span aria-hidden>{ICONO_HABILIDAD[a.habilidad]} </span>{a.titulo}</p>
                              {pendientes ? <Insignia tono="alerta">{pendientes} para corregir</Insignia> : null}
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              <Insignia tono={tono}>{estado}</Insignia>
                              <Insignia>{ETIQUETA_HABILIDAD[a.habilidad]}</Insignia>
                              <Insignia tono={TONO_EVALUACION[a.evaluacion]}>{ETIQUETA_EVALUACION[a.evaluacion]}</Insignia>
                              {a.estado === "publicada" ? <Insignia tono={v.tono}>{v.texto}</Insignia> : null}
                            </div>
                            {a.estado !== "borrador" ? (
                              <div className="mt-3">
                                <div className="flex justify-between text-xs text-suave">
                                  <span>Entregas</span><span><strong className="text-texto">{entregadas}</strong> de {n}</span>
                                </div>
                                <div className="mt-1 h-2 overflow-hidden rounded-full bg-pizarra" role="img" aria-label={`${pct} % entregado`}>
                                  <div className="h-full rounded-full bg-marca" style={{ width: `${pct}%` }} />
                                </div>
                              </div>
                            ) : <p className="mt-3 text-xs text-suave">Borrador: todavía no la ven tus estudiantes.</p>}
                          </Tarjeta>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}

function Resumen({ valor, etiqueta, destacado = false }: { valor: number; etiqueta: string; destacado?: boolean }) {
  return (
    <li className={`globo globo-izq mb-4 px-5 py-4 ${destacado ? "bg-acento text-white" : "bg-marca-suave text-marca-fuerte"}`}>
      <span className="block text-3xl font-extrabold tracking-tight">{valor}</span>
      <span className="text-sm font-medium">{etiqueta}</span>
    </li>
  );
}
