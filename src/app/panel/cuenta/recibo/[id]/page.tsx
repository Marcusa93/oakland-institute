/* eslint-disable @typescript-eslint/no-explicit-any -- no hay tipos generados de la base: filas tipadas a mano */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BotonImprimir } from "@/app/panel/informes/imprimir";
import { Aviso, Enlace, EstadoVacio } from "@/componentes/ui";
import { Marca } from "@/componentes/marca";
import { institucion } from "@/config/institucion";
import { fecha, fechaHora, nombreCompleto, pesos } from "@/lib/formato";
import { esGestion } from "@/lib/permisos";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { enlaceWa } from "@/lib/whatsapp";
import { uno } from "../../../estudiantes/comun";

export const metadata: Metadata = { title: "Comprobante de pago" };

const UUID = /^[0-9a-f-]{36}$/i;
const MEDIO: Record<string, string> = { efectivo: "Efectivo", transferencia: "Transferencia", pasarela: "Pago en línea" };

const ESTILO_IMPRESION = `@media print {
  @page { margin: 14mm; }
  body * { visibility: hidden; }
  #recibo, #recibo * { visibility: visible; }
  #recibo { position: absolute; inset: 0 auto auto 0; width: 100%; }
}`;

const numeroRecibo = (n: number | string | null | undefined) => String(n ?? "").padStart(6, "0");

export default async function Recibo({ params }: { params: Promise<{ id: string }> }) {
  const sesion = await exigirPermiso("cuenta_corriente", "ver");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await crearClienteServidor();
  // La RLS deja ver el pago a gestión y a quien pagó.
  const [pagoR, saldoR] = await Promise.all([
    supabase.from("pagos")
      .select("id, numero, importe, fecha_pago, medio, estado, nota, validado_en, pagador_persona_id, pagador:personas!pagador_persona_id(nombres, apellidos, personas_datos(telefono)), imputaciones(importe, anulada_en, obligaciones(descripcion, estudiantes(legajo, personas(nombres, apellidos))))")
      .eq("id", id).maybeSingle(),
    supabase.from("pagos_saldo").select("saldo_a_favor").eq("pago_id", id).maybeSingle(),
  ]);
  if (pagoR.error) return <Aviso tono="peligro">No pudimos cargar el pago. Actualizá la página.</Aviso>;
  const p = pagoR.data as any;
  if (!p) notFound();
  const gestion = esGestion(sesion.perfiles);
  const volver = gestion ? `/panel/cobros?persona=${p.pagador_persona_id}` : "/panel/cuenta";

  if (p.estado !== "confirmado") {
    return (
      <EstadoVacio titulo="Todavía no hay comprobante">
        {p.estado === "informado" ? "El pago está informado y el instituto todavía no confirmó la acreditación." : `El pago figura como ${p.estado}: no corresponde comprobante.`}
        <p className="mt-3"><Enlace href={volver} variante="secundario">Volver</Enlace></p>
      </EstadoVacio>
    );
  }

  const pagador = uno<any>(p.pagador);
  const aplicado = ((p.imputaciones ?? []) as any[]).filter((i) => !i.anulada_en).map((i) => {
    const o = uno<any>(i.obligaciones);
    const e = uno<any>(o?.estudiantes);
    return { descripcion: o?.descripcion ?? "—", estudiante: nombreCompleto(uno(e?.personas)), importe: i.importe as string };
  });
  const saldoAFavor = Number(saldoR.data?.saldo_a_favor ?? 0);
  const numero = numeroRecibo(p.numero);
  const texto = [
    `${institucion.nombre} · Comprobante de pago N.º ${numero}`,
    `Recibimos ${pesos(p.importe)} de ${nombreCompleto(pagador)} el ${fecha(p.fecha_pago)} (${(MEDIO[p.medio] ?? p.medio).toLowerCase()}).`,
    ...(aplicado.length ? ["Aplicado a:", ...aplicado.map((a) => `• ${a.descripcion} (${a.estudiante}): ${pesos(a.importe)}`)] : []),
    ...(saldoAFavor > 0 ? [`Saldo a favor: ${pesos(saldoAFavor)}`] : []),
    "¡Gracias!",
  ].join("\n");
  const telefono = uno<any>(pagador?.personas_datos)?.telefono as string | undefined;
  const wa = gestion ? enlaceWa(telefono, texto) : null;

  return (
    <>
      <style>{ESTILO_IMPRESION}</style>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Enlace href={volver} variante="secundario">← Volver</Enlace>
        <div className="flex flex-wrap gap-2">
          {wa ? <a href={wa} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-base border border-borde bg-superficie px-4 text-sm font-semibold hover:bg-marca-suave">Enviar por WhatsApp</a> : null}
          <BotonImprimir />
        </div>
      </div>

      <article id="recibo" className="mx-auto max-w-2xl rounded-base border border-borde bg-superficie p-6 sm:p-8 print:border-0 print:p-0">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b-4 border-marca pb-4 [print-color-adjust:exact]">
          <div>
            <Marca />
            <p className="mt-1 text-sm text-suave">{[institucion.contacto.direccion, institucion.localidad].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-suave">Comprobante de pago</p>
            <p className="text-2xl font-bold">N.º {numero}</p>
          </div>
        </header>

        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-suave">Recibimos de</dt><dd className="font-semibold">{nombreCompleto(pagador)}</dd></div>
          <div><dt className="text-suave">Fecha del pago</dt><dd className="font-semibold">{fecha(p.fecha_pago)}</dd></div>
          <div><dt className="text-suave">Medio</dt><dd className="font-semibold">{MEDIO[p.medio] ?? p.medio}</dd></div>
          <div><dt className="text-suave">Confirmado</dt><dd className="font-semibold">{fechaHora(p.validado_en)}</dd></div>
        </dl>

        <p className="mt-6 text-sm text-suave">Importe recibido</p>
        <p className="text-3xl font-bold">{pesos(p.importe)}</p>

        <h2 className="mt-6 text-sm font-bold uppercase tracking-wide text-suave">Aplicado a</h2>
        {aplicado.length === 0 ? <p className="mt-1 text-sm">Todavía no se aplicó a ninguna cuota: queda como saldo a favor.</p> : (
          <table className="mt-2 w-full text-sm">
            <tbody className="divide-y divide-borde">
              {aplicado.map((a, i) => (
                <tr key={i}><td className="py-2">{a.descripcion}<span className="block text-suave">{a.estudiante}</span></td><td className="py-2 text-right font-semibold">{pesos(a.importe)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        {saldoAFavor > 0 ? <p className="mt-3 text-sm">Saldo a favor: <strong>{pesos(saldoAFavor)}</strong></p> : null}
        {p.nota ? <p className="mt-3 text-sm text-suave">Nota: {p.nota}</p> : null}

        <p className="mt-8 border-t border-borde pt-3 text-xs text-suave">
          Comprobante interno de {institucion.nombre}. No válido como factura.
        </p>
      </article>
    </>
  );
}
