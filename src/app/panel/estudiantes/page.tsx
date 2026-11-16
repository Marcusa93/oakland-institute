import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, Boton, Campo, Descarga, Enlace, EstadoVacio, Insignia, Selector, Tabla, Tarjeta, Titulo, type Tono } from "@/componentes/ui";
import { fecha, nombreCompleto } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { buscarEstudiantes, ESTADOS_ESTUDIANTE } from "./comun";
import { AltaEstudiante } from "./formulario";

export const metadata: Metadata = { title: "Estudiantes" };

const TONO: Record<string, Tono> = { aspirante: "alerta", activo: "exito", inactivo: "neutro", egresado: "marca" };
const POR_PAGINA = 50;

export default async function Estudiantes({ searchParams }: { searchParams: Promise<{ q?: string; estado?: string; pagina?: string }> }) {
  await exigirPermiso("estudiantes", "crear");
  const { q = "", estado = "", pagina: paginaPedida = "1" } = await searchParams;
  const pagina = Math.max(1, Math.min(1000, Number.parseInt(paginaPedida, 10) || 1));
  const etiqueta: Record<string, string> = Object.fromEntries(ESTADOS_ESTUDIANTE);
  const estadoValido = estado in etiqueta ? estado : "";
  const supabase = await crearClienteServidor();
  const { filas, error, hayMas } = await buscarEstudiantes(supabase, q, { estado: estadoValido || undefined, limite: POR_PAGINA, desde: (pagina - 1) * POR_PAGINA });
  const enlacePagina = (n: number) => `/panel/estudiantes?${new URLSearchParams({ ...(q ? { q } : {}), ...(estadoValido ? { estado: estadoValido } : {}), pagina: String(n) })}`;
  const filtrando = Boolean(q.trim() || estadoValido);

  return (
    <>
      <Titulo descripcion="Legajos del instituto. Desde la ficha se ven la trayectoria, los responsables y las observaciones de cada estudiante."
        acciones={
          <div className="flex flex-wrap gap-2">
            <Descarga href="/panel/estudiantes/exportar" />
            <Enlace href="/panel/estudiantes/importar" variante="secundario">Importar desde una planilla</Enlace>
          </div>
        }>
        Estudiantes
      </Titulo>

      <form method="get" role="search" className="mb-4 grid gap-3 sm:grid-cols-[1fr_12rem_auto_auto] sm:items-end">
        <Campo id="q" name="q" type="search" etiqueta="Buscar por apellido, nombre o legajo" defaultValue={q} placeholder="Ej.: Gómez o E-1024" />
        <Selector id="estado" name="estado" etiqueta="Estado" defaultValue={estadoValido}>
          <option value="">Todos</option>
          {ESTADOS_ESTUDIANTE.map(([v, e]) => <option key={v} value={v}>{e}</option>)}
        </Selector>
        <Boton type="submit" variante="secundario">Buscar</Boton>
        {filtrando ? <Enlace href="/panel/estudiantes" variante="texto">Limpiar</Enlace> : null}
      </form>

      {error ? <Aviso tono="peligro">No pudimos cargar los estudiantes. Actualizá la página.</Aviso> : null}
      {!error && filas.length === 0 ? (
        <EstadoVacio titulo={filtrando ? "No encontramos estudiantes con esa búsqueda" : "Todavía no hay estudiantes cargados"}>
          {filtrando ? "Probá con otro apellido o con el número de legajo." : "Usá el formulario de abajo para dar de alta al primero."}
        </EstadoVacio>
      ) : null}
      {filas.length > 0 ? (
        <>
          <Tabla leyenda="Listado de estudiantes" encabezados={["Estudiante", "Legajo", "Estado", "Alta"]}>
            {filas.map((e) => (
              <tr key={e.id}>
                <td><Link href={`/panel/estudiantes/${e.id}`} className="inline-flex min-h-11 items-center font-semibold text-marca underline-offset-4 hover:underline">{nombreCompleto(e.persona)}</Link></td>
                <td>{e.legajo}</td>
                <td><Insignia tono={TONO[e.estado]}>{etiqueta[e.estado] ?? e.estado}</Insignia></td>
                <td>{fecha(e.fecha_alta)}</td>
              </tr>
            ))}
          </Tabla>
          {pagina > 1 || hayMas ? (
            <nav aria-label="Páginas del listado" className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              {pagina > 1 ? <Enlace href={enlacePagina(pagina - 1)} variante="secundario">← Anteriores</Enlace> : null}
              <span className="text-suave">Página {pagina}</span>
              {hayMas ? <Enlace href={enlacePagina(pagina + 1)} variante="secundario">Siguientes →</Enlace> : null}
            </nav>
          ) : null}
        </>
      ) : null}

      <Tarjeta className="mt-6">
        <h2 className="text-lg font-bold">Dar de alta un estudiante</h2>
        <p className="mb-3 mt-1 text-sm text-suave">Solo el nombre y el apellido son obligatorios. Antes de crear, revisamos que la persona no esté ya cargada.</p>
        <AltaEstudiante />
      </Tarjeta>
    </>
  );
}
