/* eslint-disable @typescript-eslint/no-explicit-any -- no hay tipos generados de la base: filas tipadas a mano */
import type { Metadata } from "next";
import { Aviso, Boton, Campo, EstadoVacio, Insignia, Tabla, Tarjeta, Titulo } from "@/componentes/ui";
import { fecha, hoyISO, pesos } from "@/lib/formato";
import { puede } from "@/lib/permisos";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { MEDIO } from "../cobros/datos";
import { sumar } from "../cobros/dinero";
import { Anular, NuevaCategoria, NuevoGasto, NuevoPagoDocente, NuevoProveedor } from "./formularios";

export const metadata: Metadata = { title: "Gastos" };

const h2 = "mb-3 text-lg font-bold";
const nombre = (p: { nombres: string; apellidos: string } | null | undefined) => (p ? `${p.apellidos}, ${p.nombres}` : "—");

/** Primer día del mes siguiente a "YYYY-MM". */
function mesSiguiente(mes: string) {
  const [a, m] = mes.split("-").map(Number);
  return m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;
}

export default async function Gastos({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const sesion = await exigirPermiso("gastos", "ver");
  const hoy = hoyISO();
  const pedido = (await searchParams).mes ?? "";
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(pedido) ? pedido : hoy.slice(0, 7);
  const desde = `${mes}-01`;
  const hasta = mesSiguiente(mes);
  const etiquetaMes = `${mes.slice(5)}/${mes.slice(0, 4)}`;
  const veDocentes = puede(sesion.perfiles, "pagos_docentes", "ver");
  const puedeCrear = puede(sesion.perfiles, "gastos", "crear");
  const puedeAnular = puede(sesion.perfiles, "gastos", "editar");
  const supabase = await crearClienteServidor();

  const [gastos, categorias, proveedores, cursos, comisiones] = await Promise.all([
    supabase.from("gastos")
      .select("id, fecha, descripcion, importe, medio, anulado_en, motivo_anulacion, categorias_gasto(nombre), proveedores(nombre), cursos(nombre), comisiones(nombre)")
      .gte("fecha", desde).lt("fecha", hasta).order("fecha", { ascending: false }).order("registrado_en", { ascending: false }).limit(500),
    supabase.from("categorias_gasto").select("id, nombre").eq("activa", true).order("nombre"),
    supabase.from("proveedores").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("cursos").select("id, nombre").eq("activo", true).order("nombre"),
    supabase.from("comisiones").select("id, nombre").in("estado", ["abierta", "en_curso"]).order("nombre"),
  ]);
  const filas = (gastos.data ?? []) as any[];
  const vigentes = filas.filter((g) => !g.anulado_en);
  const opciones = (r: { data: any[] | null }) => (r.data ?? []) as Array<{ id: string; nombre: string }>;

  return (
    <>
      <Titulo descripcion="Lo que el instituto paga: servicios, materiales, mantenimiento. Un gasto cargado no se borra: si hubo un error, se anula con motivo."
        acciones={
          <form method="get" action="/panel/gastos" className="flex items-end gap-2">
            <Campo id="filtro-mes" name="mes" type="month" etiqueta="Mes" defaultValue={mes} required />
            <Boton type="submit" variante="secundario">Ver</Boton>
          </form>
        }>
        Gastos
      </Titulo>

      <section aria-labelledby="t-listado" className="mb-8">
        <h2 id="t-listado" className={h2}>Gastos de {etiquetaMes}</h2>
        {gastos.error ? <Aviso tono="peligro">No pudimos cargar los gastos. Actualizá la página.</Aviso> : null}
        {!gastos.error && filas.length === 0 ? (
          <EstadoVacio titulo={`No hay gastos cargados en ${etiquetaMes}`}>Cargá el primero con el formulario de abajo, o elegí otro mes.</EstadoVacio>
        ) : null}
        {filas.length > 0 ? (
          <>
            <p className="mb-2 text-sm">
              Total del mes: <strong className="text-base">{pesos(sumar(vigentes.map((g) => g.importe)))}</strong> en {vigentes.length} {vigentes.length === 1 ? "gasto" : "gastos"}
              {filas.length > vigentes.length ? <span className="text-suave"> · los anulados no suman</span> : null}
            </p>
            <Tabla leyenda={`Gastos de ${etiquetaMes}`} encabezados={["Fecha", "Categoría", "Descripción", "Proveedor", "Medio", "Importe", "Acciones"]}>
              {filas.map((g) => (
                <tr key={g.id}>
                  <td className="whitespace-nowrap">{fecha(g.fecha)}</td>
                  <td>{g.categorias_gasto?.nombre ?? "—"}</td>
                  <td>
                    {g.descripcion}
                    {g.cursos?.nombre || g.comisiones?.nombre ? (
                      <p className="text-xs text-suave">Atribuido a: {[g.cursos?.nombre, g.comisiones?.nombre].filter(Boolean).join(" · ")}</p>
                    ) : null}
                    {g.anulado_en ? <p className="mt-1 text-xs"><Insignia tono="peligro">Anulado</Insignia> Motivo: {g.motivo_anulacion}</p> : null}
                  </td>
                  <td>{g.proveedores?.nombre ?? "—"}</td>
                  <td>{MEDIO[g.medio] ?? g.medio}</td>
                  <td className={`whitespace-nowrap font-semibold ${g.anulado_en ? "text-suave line-through" : ""}`}>{pesos(g.importe)}</td>
                  <td>{!g.anulado_en && puedeAnular ? <Anular id={g.id} tipo="gasto" /> : <span className="text-suave">—</span>}</td>
                </tr>
              ))}
            </Tabla>
          </>
        ) : null}
      </section>

      {puedeCrear ? (
        <section aria-labelledby="t-alta" className="mb-8">
          <h2 id="t-alta" className={h2}>Registrar gasto</h2>
          <Tarjeta>
            {categorias.error || proveedores.error ? <div className="mb-3"><Aviso tono="peligro">No pudimos cargar categorías o proveedores. Actualizá la página.</Aviso></div> : null}
            <NuevoGasto hoy={hoy} categorias={opciones(categorias)} proveedores={opciones(proveedores)} cursos={opciones(cursos)} comisiones={opciones(comisiones)} />
          </Tarjeta>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_2fr]">
            <Tarjeta><NuevaCategoria /></Tarjeta>
            <Tarjeta><NuevoProveedor /></Tarjeta>
          </div>
        </section>
      ) : null}

      {veDocentes ? <PagosDocentes mes={mes} desde={desde} hasta={hasta} hoy={hoy} comisiones={opciones(comisiones)} puedeEditar={puede(sesion.perfiles, "pagos_docentes", "editar")} /> : null}
    </>
  );
}

/** Solo dirección. La RLS de `pagos_docentes` vuelve a exigirlo. */
async function PagosDocentes({ mes, desde, hasta, hoy, comisiones, puedeEditar }: {
  mes: string; desde: string; hasta: string; hoy: string; comisiones: Array<{ id: string; nombre: string }>; puedeEditar: boolean;
}) {
  const supabase = await crearClienteServidor();
  const [pagos, asignados] = await Promise.all([
    supabase.from("pagos_docentes")
      .select("id, periodo, fecha_pago, importe, nota, anulado_en, motivo_anulacion, personas(nombres, apellidos), comisiones(nombre)")
      .gte("fecha_pago", desde).lt("fecha_pago", hasta).order("fecha_pago", { ascending: false }).limit(300),
    supabase.from("comision_docentes").select("docente_persona_id, personas(nombres, apellidos)").limit(1000),
  ]);
  const filas = (pagos.data ?? []) as any[];
  const vigentes = filas.filter((p) => !p.anulado_en);
  const docentes = new Map<string, string>();
  for (const a of (asignados.data ?? []) as any[]) if (a.personas) docentes.set(a.docente_persona_id, nombre(a.personas));
  const etiquetaMes = `${mes.slice(5)}/${mes.slice(0, 4)}`;

  return (
    <section aria-labelledby="t-docentes">
      <h2 id="t-docentes" className={h2}>Pagos a docentes</h2>
      <div className="mb-3"><Aviso tono="alerta">Registro interno de pagos. No es una liquidación de haberes.</Aviso></div>
      {pagos.error ? <Aviso tono="peligro">No pudimos cargar los pagos a docentes. Actualizá la página.</Aviso> : filas.length === 0 ? (
        <EstadoVacio titulo={`No hay pagos a docentes con fecha de pago en ${etiquetaMes}`} />
      ) : (
        <>
          <p className="mb-2 text-sm">
            Total pagado en {etiquetaMes}: <strong className="text-base">{pesos(sumar(vigentes.map((p) => p.importe)))}</strong>
            {filas.length > vigentes.length ? <span className="text-suave"> · los anulados no suman</span> : null}
          </p>
          <Tabla leyenda={`Pagos a docentes con fecha de pago en ${etiquetaMes}`} encabezados={["Fecha de pago", "Docente", "Corresponde a", "Detalle", "Importe", "Acciones"]}>
            {filas.map((p) => (
              <tr key={p.id}>
                <td className="whitespace-nowrap">{fecha(p.fecha_pago)}</td>
                <td>{nombre(p.personas)}</td>
                <td className="whitespace-nowrap">{String(p.periodo).slice(5, 7)}/{String(p.periodo).slice(0, 4)}</td>
                <td>
                  {[p.comisiones?.nombre, p.nota].filter(Boolean).join(" · ") || "—"}
                  {p.anulado_en ? <p className="mt-1 text-xs"><Insignia tono="peligro">Anulado</Insignia> Motivo: {p.motivo_anulacion}</p> : null}
                </td>
                <td className={`whitespace-nowrap font-semibold ${p.anulado_en ? "text-suave line-through" : ""}`}>{pesos(p.importe)}</td>
                <td>{!p.anulado_en && puedeEditar ? <Anular id={p.id} tipo="pago_docente" /> : <span className="text-suave">—</span>}</td>
              </tr>
            ))}
          </Tabla>
        </>
      )}
      <div className="mt-4">
        <Tarjeta>
          <h3 className="mb-3 text-base font-bold">Registrar pago a docente</h3>
          {asignados.error ? <div className="mb-3"><Aviso tono="peligro">No pudimos cargar la lista de docentes. Actualizá la página.</Aviso></div> : null}
          {!asignados.error && docentes.size === 0 ? (
            <div className="mb-3"><Aviso tono="alerta">Todavía no hay docentes asignados a ninguna comisión. Asignalos en «Comisiones» para poder registrarles un pago.</Aviso></div>
          ) : null}
          <NuevoPagoDocente hoy={hoy} comisiones={comisiones}
            docentes={[...docentes].map(([id, n]) => ({ id, nombre: n })).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"))} />
        </Tarjeta>
      </div>
    </section>
  );
}
