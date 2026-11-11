import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Aviso, Enlace, EstadoVacio, Tabla, Tarjeta, Titulo } from "@/componentes/ui";
import { hoyISO } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { porcentaje, resumenDocentes } from "../datos";
import { TarjetaEvaluacion } from "../evaluacion";
import { FormularioEvaluacion } from "../formulario";

export const metadata: Metadata = { title: "Docente" };

export default async function Docente({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirPermiso("evaluacion_docente", "ver");
  if (!sesion.perfiles.includes("direccion")) redirect("/panel/docentes");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();

  const { docentes, evaluaciones, error } = await resumenDocentes(id);
  const d = docentes[0];
  if (!d) notFound();
  const anio = hoyISO().slice(0, 4);
  const mes = Number(hoyISO().slice(5, 7));
  const periodoSugerido = `${anio} · ${mes <= 7 ? "1.er" : "2.º"} cuatrimestre`;

  return (
    <>
      <Link href="/panel/docentes" className="inline-flex min-h-11 items-center text-sm font-semibold text-marca hover:underline">← Docentes</Link>
      <Titulo descripcion="Indicadores de sus comisiones, evaluación e historial." acciones={<Enlace href={`/panel/mensajes/nueva?a=${d.personaId}`} variante="secundario">Enviar mensaje</Enlace>}>
        {d.nombre}
      </Titulo>
      {error ? <div className="mb-4"><Aviso tono="peligro">No pudimos cargar toda la información. Actualizá la página.</Aviso></div> : null}

      <section aria-labelledby="titulo-comisiones" className="mb-6">
        <h2 id="titulo-comisiones" className="mb-2 text-lg font-bold">Comisiones</h2>
        {d.comisiones.length === 0 ? <EstadoVacio titulo="Sin comisiones asignadas" /> : (
          <Tabla leyenda="Indicadores por comisión" encabezados={["Comisión", "Asistencia tomada", "Actividades", "Corregidas", "Por corregir", "Alertas abiertas"]}>
            {d.comisiones.map((k) => (
              <tr key={k.id}>
                <td className="font-semibold"><Link href={`/panel/comisiones/${k.id}`} className="hover:underline">{k.nombre}</Link></td>
                <td>{porcentaje(k.clasesConAsistencia, k.clases)} <span className="text-suave">({k.clasesConAsistencia}/{k.clases})</span></td>
                <td>{k.actividadesPublicadas}</td>
                <td>{k.entregasCorregidas}</td>
                <td>{k.entregasPorCorregir}</td>
                <td>{k.alertasAbiertas}</td>
              </tr>
            ))}
          </Tabla>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <section aria-labelledby="titulo-evaluar">
          <Tarjeta>
            <h2 id="titulo-evaluar" className="mb-3 text-lg font-bold">Nueva evaluación</h2>
            <FormularioEvaluacion docente={d.personaId} periodoSugerido={periodoSugerido} />
          </Tarjeta>
        </section>
        <section aria-labelledby="titulo-historial">
          <h2 id="titulo-historial" className="mb-3 text-lg font-bold">Historial</h2>
          {evaluaciones.length === 0 ? <EstadoVacio titulo="Todavía no hay evaluaciones">La primera que guardes aparece acá.</EstadoVacio> : (
            <ul className="space-y-4">{evaluaciones.map((e) => <li key={e.id}><TarjetaEvaluacion e={e} editable /></li>)}</ul>
          )}
        </section>
      </div>
    </>
  );
}
