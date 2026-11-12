/* eslint-disable @typescript-eslint/no-explicit-any -- filas sin tipar hasta generar los tipos de la base (backlog 1.18) */
import type { Metadata } from "next";
import Link from "next/link";
import { Aviso, EstadoVacio, Insignia, Tarjeta, Titulo } from "@/componentes/ui";
import { fecha, fechaHora, hoyISO, pesos } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { enlaceWa, mensajeDeuda } from "@/lib/whatsapp";
import { cargarObligaciones, type ObligacionConSaldo } from "../datos";
import { sumar } from "../dinero";
import { Recordar, RecordarTodas } from "./controles";

export const metadata: Metadata = { title: "Recordatorios de cuotas" };

const DIAS_AVISO = 5;
const PAUSA_DIAS = 7;
const CANAL: Record<string, string> = { whatsapp: "WhatsApp", interno: "aviso en la app" };

function dias(desde: string, hasta: string) {
  return Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / 86_400_000);
}
function sumarDias(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

interface Familia { id: string; nombre: string; obligaciones: ObligacionConSaldo[]; total: string; vencida: boolean; masVieja: string }

export default async function Recordatorios() {
  await exigirPermiso("cuenta_corriente", "aprobar");
  const hoy = hoyISO();
  const supabase = await crearClienteServidor();
  // "vencidasAntesDe" es estricto: incluye todo lo que vence hasta dentro de 5 días.
  const { filas, error } = await cargarObligaciones(supabase, { vencidasAntesDe: sumarDias(hoy, DIAS_AVISO + 1), limite: 500 });

  const familias = new Map<string, Familia>();
  for (const o of filas) {
    if (Number(o.saldo) <= 0) continue;
    const f = familias.get(o.responsableId) ?? { id: o.responsableId, nombre: o.responsable ?? "Responsable", obligaciones: [], total: "0", vencida: false, masVieja: o.vencimiento };
    f.obligaciones.push(o);
    f.vencida ||= o.vencimiento < hoy;
    if (o.vencimiento < f.masVieja) f.masVieja = o.vencimiento;
    familias.set(o.responsableId, f);
  }
  for (const f of familias.values()) f.total = sumar(f.obligaciones.map((o) => o.saldo));
  const ids = [...familias.keys()];

  const [personas, datos, recordatorios] = ids.length
    ? await Promise.all([
        supabase.from("personas").select("id, nombres, nombre_preferido").in("id", ids),
        supabase.from("personas_datos").select("persona_id, telefono").in("persona_id", ids),
        supabase.from("recordatorios_cobro").select("responsable_persona_id, canal, enviado_en").in("responsable_persona_id", ids).order("enviado_en", { ascending: false }).limit(1000),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];
  const primerNombre = new Map(((personas.data ?? []) as any[]).map((p) => [p.id, p.nombre_preferido ?? p.nombres]));
  const telefono = new Map(((datos.data ?? []) as any[]).map((d) => [d.persona_id, d.telefono as string | null]));
  const ultimo = new Map<string, { canal: string; enviado_en: string }>();
  for (const r of (recordatorios.data ?? []) as any[]) if (!ultimo.has(r.responsable_persona_id)) ultimo.set(r.responsable_persona_id, r);

  const recienRecordada = (id: string) => {
    const u = ultimo.get(id);
    return u ? hoyISO(new Date(u.enviado_en)) > sumarDias(hoy, -PAUSA_DIAS) : false;
  };
  const conVencidas = [...familias.values()].filter((f) => f.vencida).sort((a, b) => a.masVieja.localeCompare(b.masVieja));
  const porVencer = [...familias.values()].filter((f) => !f.vencida).sort((a, b) => a.masVieja.localeCompare(b.masVieja));
  const paraAvisar = conVencidas.filter((f) => !recienRecordada(f.id)).length;

  const tarjeta = (f: Familia) => {
    const tel = telefono.get(f.id) ?? null;
    const deudas = f.obligaciones.map((o) => ({ descripcion: o.descripcion, estudiante: o.estudiante.split(", ")[1] ?? o.estudiante, saldo: Number(o.saldo), vencimiento: o.vencimiento }));
    const wa = enlaceWa(tel, mensajeDeuda(primerNombre.get(f.id) ?? f.nombre, deudas, hoy));
    const u = ultimo.get(f.id);
    return (
      <li key={f.id}>
        <Tarjeta>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-lg font-bold">{f.nombre}</p>
              <p className="text-sm text-suave">{tel ?? "Sin teléfono cargado"}</p>
            </div>
            <div className="text-right">
              <p className="text-lg font-bold tabular-nums">{pesos(f.total)}</p>
              {u ? (
                <Insignia tono={recienRecordada(f.id) ? "exito" : "neutro"}>Recordado por {CANAL[u.canal] ?? u.canal} el {fechaHora(u.enviado_en)}</Insignia>
              ) : <Insignia tono="alerta">Nunca se le recordó</Insignia>}
            </div>
          </div>
          <ul className="mt-3 divide-y divide-borde rounded-base border border-borde text-sm">
            {f.obligaciones.map((o) => {
              const n = dias(o.vencimiento, hoy);
              return (
                <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <span>{o.descripcion} · <span className="text-suave">{o.estudiante}</span>{o.estado === "parcial" ? <> <Insignia tono="alerta">Pago parcial</Insignia></> : null}</span>
                  <span className="flex items-center gap-3">
                    <span className={n > 0 ? "font-semibold text-acento" : "text-suave"}>
                      {n > 0 ? `Venció hace ${n} ${n === 1 ? "día" : "días"}` : n === 0 ? "Vence hoy" : `Vence el ${fecha(o.vencimiento)}`}
                    </span>
                    <span className="font-semibold tabular-nums">{pesos(o.saldo)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
          <Recordar persona={f.id} whatsapp={wa} />
          {!wa ? <p className="mt-1 text-xs text-suave">{tel ? "El teléfono no tiene código de área: no se puede abrir WhatsApp." : "Cargá su teléfono para poder escribirle por WhatsApp."}</p> : null}
          <p className="mt-3 text-sm">
            <Link href={`/panel/cobros?persona=${f.id}`} className="font-semibold text-marca hover:underline">Registrar un cobro<span className="sr-only"> a {f.nombre}</span></Link>
          </p>
        </Tarjeta>
      </li>
    );
  };

  return (
    <>
      <p className="mb-2 text-sm"><Link href="/panel/cobros" className="font-semibold text-marca hover:underline">← Cobros</Link></p>
      <Titulo descripcion={`Familias con cuotas vencidas o que vencen en los próximos ${DIAS_AVISO} días. WhatsApp abre el mensaje ya escrito en tu teléfono; el aviso en la app le llega al responsable de pago.`}>
        Recordatorios de cuotas
      </Titulo>
      {error ? <Aviso tono="peligro">No pudimos cargar las cuotas. Actualizá la página.</Aviso> : null}

      {!error && familias.size === 0 ? <EstadoVacio titulo="No hay nada para recordar">Nadie tiene cuotas vencidas ni por vencer en los próximos {DIAS_AVISO} días.</EstadoVacio> : null}

      {conVencidas.length ? (
        <section aria-labelledby="t-vencidas" className="mb-8">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="t-vencidas" className="text-lg font-bold">Con cuotas vencidas ({conVencidas.length})</h2>
              <p className="text-sm text-suave">Total vencido y por vencer: {pesos(sumar(conVencidas.map((f) => f.total)))}. Las que no recibieron recordatorio en los últimos {PAUSA_DIAS} días: {paraAvisar}.</p>
            </div>
            <RecordarTodas cantidad={paraAvisar} />
          </div>
          <ul className="space-y-4">{conVencidas.map(tarjeta)}</ul>
        </section>
      ) : null}

      {porVencer.length ? (
        <section aria-labelledby="t-por-vencer">
          <h2 id="t-por-vencer" className="mb-3 text-lg font-bold">Vencen en los próximos {DIAS_AVISO} días ({porVencer.length})</h2>
          <ul className="space-y-4">{porVencer.map(tarjeta)}</ul>
        </section>
      ) : null}
    </>
  );
}
