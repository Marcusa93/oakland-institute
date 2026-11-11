"use client";

import { useState, useTransition } from "react";
import type { Resultado } from "@/app/panel/acciones";
import { AreaTexto, Aviso, Boton, Campo, Selector } from "@/componentes/ui";
import { enviarAviso, reintentarEnvio } from "./acciones";

const SIN_CONEXION = "No pudimos conectar con el servidor. Lo que escribiste sigue en pantalla: revisá tu conexión y volvé a intentar.";

const CATEGORIAS = [["general", "General"], ["academica", "Académico"], ["economica", "Económico"]] as const;

export function NuevoAviso({ comisiones, gestion }: { comisiones: { id: string; etiqueta: string }[]; gestion: boolean }) {
  const [tipo, setTipo] = useState<"comision" | "institucional">("comision");
  const [comision, setComision] = useState(comisiones.length === 1 ? comisiones[0].id : "");
  const [categoria, setCategoria] = useState<(typeof CATEGORIAS)[number][0]>("general");
  const [asunto, setAsunto] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, iniciar] = useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    setResultado(null);
    iniciar(async () => {
      try {
        const r = await enviarAviso({ tipo, categoria, comision: tipo === "comision" ? comision : "", asunto, cuerpo });
        setResultado(r);
        if (r.ok) { setAsunto(""); setCuerpo(""); } // si falla, no se borra nada
      } catch {
        setResultado({ ok: false, mensaje: SIN_CONEXION });
      }
    });
  }

  return (
    <form onSubmit={enviar} className="grid gap-4 sm:grid-cols-2">
      {gestion ? (
        <Selector id="aviso-tipo" etiqueta="¿A quién va?" value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)}>
          <option value="comision">Para una comisión</option>
          <option value="institucional">Institucional (todas las comisiones)</option>
        </Selector>
      ) : null}
      {tipo === "comision" ? (
        <Selector id="aviso-comision" etiqueta="Comisión" required value={comision} onChange={(e) => setComision(e.target.value)}>
          <option value="">Elegí una comisión…</option>
          {comisiones.map((k) => <option key={k.id} value={k.id}>{k.etiqueta}</option>)}
        </Selector>
      ) : null}
      <Selector id="aviso-categoria" etiqueta="Categoría" value={categoria} onChange={(e) => setCategoria(e.target.value as typeof categoria)}>
        {CATEGORIAS.filter(([v]) => gestion || v !== "economica").map(([v, e]) => <option key={v} value={v}>{e}</option>)}
      </Selector>
      <p className="text-sm text-suave sm:col-span-2">
        {categoria === "economica"
          ? "Los avisos económicos llegan solo a los responsables de pago (y a responsables con acceso económico), no a los estudiantes ni al resto de la familia."
          : tipo === "institucional"
            ? "Llega a todos los estudiantes con inscripción activa y a sus responsables con acceso académico."
            : "Llega a los estudiantes inscriptos en la comisión y a sus responsables con acceso académico."}
      </p>
      <Campo id="aviso-asunto" etiqueta="Asunto" required maxLength={150} className="sm:col-span-2" value={asunto} onChange={(e) => setAsunto(e.target.value)} />
      <AreaTexto id="aviso-cuerpo" etiqueta="Mensaje" required maxLength={4000} rows={6} className="sm:col-span-2" value={cuerpo} onChange={(e) => setCuerpo(e.target.value)} />
      <div className="space-y-3 sm:col-span-2">
        {resultado ? <Aviso tono={resultado.ok ? "exito" : "peligro"}>{resultado.mensaje}</Aviso> : null}
        <Boton type="submit" disabled={enviando} className="w-full sm:w-auto">{enviando ? "Enviando…" : "Enviar aviso"}</Boton>
      </div>
    </form>
  );
}

/** Para un borrador que se guardó pero no llegó a enviarse. */
export function ReintentarEnvio({ id }: { id: string }) {
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [enviando, iniciar] = useTransition();
  return (
    <div className="mt-3 space-y-2">
      <Boton type="button" disabled={enviando} onClick={() => {
        setResultado(null);
        iniciar(async () => {
          try { setResultado(await reintentarEnvio({ id })); }
          catch { setResultado({ ok: false, mensaje: "No pudimos conectar. Revisá tu conexión y volvé a intentar." }); }
        });
      }}>
        {enviando ? "Enviando…" : "Reintentar envío"}
      </Boton>
      {resultado ? <Aviso tono={resultado.ok ? "exito" : "peligro"}>{resultado.mensaje}</Aviso> : null}
    </div>
  );
}
