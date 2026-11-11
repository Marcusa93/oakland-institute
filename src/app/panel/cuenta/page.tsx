/* eslint-disable @typescript-eslint/no-explicit-any -- no hay tipos generados de la base: filas tipadas a mano */
import type { Metadata } from "next";
import { Aviso, EstadoVacio, Insignia, Tabla, Tarjeta, Titulo, type Tono } from "@/componentes/ui";
import { fecha, hoyISO, pesos } from "@/lib/formato";
import { esGestion, puede } from "@/lib/permisos";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { cargarObligaciones, MEDIO, type ObligacionConSaldo } from "../cobros/datos";
import { sumar } from "../cobros/dinero";
import { InformarTransferencia } from "./formulario";

export const metadata: Metadata = { title: "Cuenta y pagos" };

const h2 = "mb-3 text-lg font-bold";

/** Estado de una obligación en palabras: nunca depende solo del color. */
function estadoObligacion(o: ObligacionConSaldo, hoy: string): { texto: string; tono: Tono } {
  if (o.estado === "pagada") return { texto: "Pagada", tono: "exito" };
  if (o.vencimiento < hoy) return { texto: o.estado === "parcial" ? "Vencida, con pago parcial" : "Vencida", tono: "peligro" };
  return o.estado === "parcial" ? { texto: "Pago parcial", tono: "alerta" } : { texto: "Pendiente", tono: "neutro" };
}

const ESTADO_PAGO: Record<string, { texto: string; tono: Tono; detalle: string }> = {
  informado: { texto: "Informado", tono: "alerta", detalle: "En verificación: administración todavía no confirmó la acreditación." },
  confirmado: { texto: "Confirmado", tono: "exito", detalle: "" },
  rechazado: { texto: "Rechazado", tono: "peligro", detalle: "" },
  reversado: { texto: "Reversado", tono: "neutro", detalle: "Administración dejó sin efecto este pago. Si tenés dudas, consultá." },
};

export default async function Cuenta() {
  const sesion = await exigirPermiso("cuenta_corriente", "ver");
  const hoy = hoyISO();
  const supabase = await crearClienteServidor();
  const gestion = esGestion(sesion.perfiles);

  const [obligaciones, pagos, saldos] = await Promise.all([
    // Familias: la RLS deja ver solo lo propio y lo de estudiantes a cargo con permiso económico.
    // Gestión ve todo en Cobros; acá se limita a lo que paga la propia persona.
    cargarObligaciones(supabase, { responsable: gestion ? sesion.personaId : undefined, limite: 300 }),
    supabase.from("pagos")
      .select("id, medio, importe, fecha_pago, estado, nota, motivo_rechazo, comprobante:documentos(id, nombre)")
      .eq("pagador_persona_id", sesion.personaId).order("fecha_pago", { ascending: false }).order("registrado_en", { ascending: false }).limit(100),
    supabase.from("pagos_saldo").select("pago_id, imputado, devuelto, saldo_a_favor").eq("pagador_persona_id", sesion.personaId),
  ]);

  const porEstudiante = new Map<string, { nombre: string; filas: ObligacionConSaldo[] }>();
  for (const o of obligaciones.filas) {
    const grupo = porEstudiante.get(o.estudianteId) ?? { nombre: o.estudiante, filas: [] };
    grupo.filas.push(o);
    porEstudiante.set(o.estudianteId, grupo);
  }
  const conSaldo = obligaciones.filas.filter((o) => o.estado !== "pagada");
  const vencidas = conSaldo.filter((o) => o.vencimiento < hoy);
  const saldoDePago = new Map<string, any>((saldos.data ?? []).map((s: any) => [s.pago_id, s]));
  const aFavor = sumar((saldos.data ?? []).map((s: any) => s.saldo_a_favor));
  const puedeInformar = puede(sesion.perfiles, "cuenta_corriente", "crear");

  return (
    <>
      <Titulo descripcion="Lo que hay para pagar, lo que ya se pagó y los pagos que informaste.">Cuenta y pagos</Titulo>
      {gestion ? <div className="mb-4"><Aviso>Acá ves solo lo que pagás vos como responsable. Para operar las cuentas de las familias usá «Cobros».</Aviso></div> : null}

      <section aria-labelledby="t-obligaciones" className="mb-8">
        <h2 id="t-obligaciones" className={h2}>Obligaciones</h2>
        {obligaciones.error ? <Aviso tono="peligro">No pudimos cargar las obligaciones. Actualizá la página.</Aviso> : null}
        {!obligaciones.error && obligaciones.filas.length === 0 ? (
          <EstadoVacio titulo="No hay obligaciones a tu nombre">Cuando administración genere una matrícula, una cuota u otro cargo, lo vas a ver acá.</EstadoVacio>
        ) : null}
        {obligaciones.filas.length > 0 ? (
          <p className="mb-3 text-sm">
            Saldo total a pagar: <strong>{pesos(sumar(conSaldo.map((o) => o.saldo)))}</strong>
            {vencidas.length > 0 ? <> · de eso, <strong>{pesos(sumar(vencidas.map((o) => o.saldo)))} ya venció</strong> ({vencidas.length} {vencidas.length === 1 ? "obligación vencida" : "obligaciones vencidas"})</> : " · no hay nada vencido"}
            {Number(aFavor) > 0 ? <> · tenés {pesos(aFavor)} de saldo a favor que administración todavía no aplicó</> : null}
          </p>
        ) : null}
        <div className="space-y-5">
          {[...porEstudiante].map(([id, grupo]) => (
            <div key={id}>
              <h3 className="mb-2 text-base font-bold">{grupo.nombre}</h3>
              <Tabla leyenda={`Obligaciones de ${grupo.nombre}`} encabezados={["Concepto", "Vencimiento", "Importe", "Pagado", "Saldo", "Estado"]}>
                {grupo.filas.map((o) => {
                  const e = estadoObligacion(o, hoy);
                  return (
                    <tr key={o.id}>
                      <td>{o.descripcion}</td>
                      <td className="whitespace-nowrap">{fecha(o.vencimiento)}</td>
                      <td className="whitespace-nowrap">{pesos(o.importe)}</td>
                      <td className="whitespace-nowrap">{pesos(o.pagado)}</td>
                      <td className="whitespace-nowrap font-semibold">{pesos(o.saldo)}</td>
                      <td><Insignia tono={e.tono}>{e.texto}</Insignia></td>
                    </tr>
                  );
                })}
              </Tabla>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="t-informar" className="mb-8">
        <h2 id="t-informar" className={h2}>Informar transferencia</h2>
        <Tarjeta>
          {puedeInformar ? (
            <>
              <p className="mb-3 max-w-2xl text-sm text-suave">
                Si ya transferiste, avisanos acá. El aviso y el comprobante no confirman el pago: queda «Informado» hasta que administración vea la acreditación en la cuenta del instituto. Después lo aplica a lo que corresponda.
              </p>
              <InformarTransferencia hoy={hoy} adjuntos={Boolean(process.env.SUPABASE_SECRET_KEY)} />
            </>
          ) : (
            <p className="text-sm text-suave">Para informar una transferencia, comunicate con administración.</p>
          )}
        </Tarjeta>
      </section>

      <section aria-labelledby="t-pagos">
        <h2 id="t-pagos" className={h2}>Tus pagos</h2>
        {pagos.error || saldos.error ? <Aviso tono="peligro">No pudimos cargar tus pagos. Actualizá la página.</Aviso> : (pagos.data ?? []).length === 0 ? (
          <EstadoVacio titulo="Todavía no hay pagos a tu nombre">Los pagos que hagas en administración o que informes acá aparecen en esta lista.</EstadoVacio>
        ) : (
          <Tabla leyenda="Pagos hechos o informados por vos, con su estado" encabezados={["Fecha", "Medio", "Importe", "Estado", "Aplicado", "Comprobante"]}>
            {(pagos.data ?? []).map((p: any) => {
              const e = ESTADO_PAGO[p.estado] ?? { texto: p.estado, tono: "neutro" as Tono, detalle: "" };
              const s = saldoDePago.get(p.id);
              return (
                <tr key={p.id}>
                  <td className="whitespace-nowrap">{fecha(p.fecha_pago)}</td>
                  <td>{MEDIO[p.medio] ?? p.medio}{p.nota ? <p className="text-xs text-suave">{p.nota}</p> : null}</td>
                  <td className="whitespace-nowrap font-semibold">{pesos(p.importe)}</td>
                  <td>
                    <Insignia tono={e.tono}>{e.texto}</Insignia>
                    {e.detalle ? <p className="mt-1 max-w-xs text-xs text-suave">{e.detalle}</p> : null}
                    {p.estado === "rechazado" ? <p className="mt-1 max-w-xs text-xs">Motivo: {p.motivo_rechazo ?? "sin detalle"}</p> : null}
                  </td>
                  <td className="whitespace-nowrap">
                    {p.estado === "confirmado" ? (
                      <>
                        {pesos(s?.imputado ?? 0)}
                        {s && s.saldo_a_favor > 0 ? <p className="text-xs text-suave">A favor: {pesos(s.saldo_a_favor)}</p> : null}
                        {s && s.devuelto > 0 ? <p className="text-xs text-suave">Devuelto: {pesos(s.devuelto)}</p> : null}
                      </>
                    ) : <span className="text-suave">—</span>}
                  </td>
                  <td>
                    {p.comprobante ? (
                      <a href={`/panel/cuenta/comprobante/${p.comprobante.id}`} target="_blank" rel="noreferrer" className="font-semibold text-marca underline-offset-4 hover:underline">
                        Ver<span className="sr-only"> comprobante {p.comprobante.nombre} (se abre en otra pestaña)</span>
                      </a>
                    ) : <span className="text-suave">Sin adjunto</span>}
                  </td>
                </tr>
              );
            })}
          </Tabla>
        )}
      </section>
    </>
  );
}
