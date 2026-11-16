/* eslint-disable @typescript-eslint/no-explicit-any -- no hay tipos generados de la base: filas tipadas a mano */
import type { Metadata } from "next";
import { Aviso, Campo, EstadoVacio, Insignia, Selector, Tarjeta, Titulo, type Tono } from "@/componentes/ui";
import { fecha, nombreCompleto } from "@/lib/formato";
import { exigirPermiso } from "@/lib/sesion";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { uno } from "../estudiantes/comun";
import { Formulario } from "../estudiantes/formulario";
import { agregarRol, enviarEnlace, quitarRol, sumarAlEquipo } from "./acciones";

export const metadata: Metadata = { title: "Equipo" };

const ROLES: Array<[string, string, Tono, string]> = [
  ["direccion", "Dirección", "marca", "Todo el sistema: tablero, precios, equipo y sitio web."],
  ["administracion", "Secretaría y administración", "exito", "Consultas, estudiantes, inscripciones, cobros y gastos."],
  ["docente", "Docente", "alerta", "Sus comisiones: asistencia, actividades, alertas e informes."],
];
const etiqueta = (rol: string) => ROLES.find(([v]) => v === rol)?.[1] ?? rol;
const tono = (rol: string) => ROLES.find(([v]) => v === rol)?.[2] ?? ("neutro" as Tono);

interface Miembro {
  cuentaId: string; personaId: string; nombre: string; email: string | null; telefono: string | null;
  estado: string; roles: Array<{ rol: string; desde: string }>;
}

export default async function Equipo() {
  const sesion = await exigirPermiso("roles_y_configuracion", "ver");
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from("roles_asignados")
    .select("rol, otorgado_en, cuentas!roles_asignados_cuenta_id_fkey(id, estado, persona_id, personas(nombres, apellidos, personas_datos(email, telefono)))")
    .is("revocado_en", null).order("otorgado_en");

  const equipo = new Map<string, Miembro>();
  for (const r of (data ?? []) as any[]) {
    const c = uno<any>(r.cuentas);
    if (!c) continue;
    const p = uno<any>(c.personas);
    const d = uno<any>(p?.personas_datos);
    const m: Miembro = equipo.get(c.id) ?? {
      cuentaId: c.id, personaId: c.persona_id, nombre: nombreCompleto(p), email: d?.email ?? null, telefono: d?.telefono ?? null,
      estado: c.estado, roles: [],
    };
    m.roles.push({ rol: r.rol, desde: r.otorgado_en });
    equipo.set(c.id, m);
  }
  const miembros = [...equipo.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return (
    <>
      <Titulo descripcion="Quiénes trabajan en el instituto y qué puede hacer cada uno en el sistema. Las familias y los estudiantes no se cargan acá: se invitan desde su ficha.">
        Equipo
      </Titulo>
      {error ? <div className="mb-4"><Aviso tono="peligro">No pudimos cargar el equipo. Actualizá la página.</Aviso></div> : null}

      <dl className="mb-6 grid gap-3 text-sm sm:grid-cols-3">
        {ROLES.map(([v, e, t, d]) => (
          <div key={v} className="rounded-base border border-borde bg-superficie p-3">
            <dt><Insignia tono={t}>{e}</Insignia></dt>
            <dd className="mt-1 text-suave">{d}</dd>
          </div>
        ))}
      </dl>

      {miembros.length === 0 && !error ? <EstadoVacio titulo="Todavía no hay nadie en el equipo" /> : null}
      <ul className="grid gap-4 lg:grid-cols-2">
        {miembros.map((m) => {
          const faltan = ROLES.filter(([v]) => !m.roles.some((r) => r.rol === v));
          const soyYo = m.cuentaId === sesion.cuentaId;
          return (
            <li key={m.cuentaId}>
              <Tarjeta className="h-full">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2 className="text-lg font-bold">{m.nombre}{soyYo ? <span className="text-sm font-normal text-suave"> (vos)</span> : null}</h2>
                    <p className="text-sm text-suave">{[m.email, m.telefono].filter(Boolean).join(" · ") || "Sin datos de contacto"}</p>
                  </div>
                  {m.estado !== "activa" ? <Insignia tono="peligro">Cuenta suspendida</Insignia> : null}
                </div>
                <ul className="mt-3 space-y-2">
                  {m.roles.map((r) => (
                    <li key={r.rol} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                      <span><Insignia tono={tono(r.rol)}>{etiqueta(r.rol)}</Insignia> <span className="text-suave">desde el {fecha(r.desde)}</span></span>
                      {!(soyYo && r.rol === "direccion") ? (
                        <Formulario accion={quitarRol} boton="Quitar" enviando="Quitando…" variante="secundario" className="flex"
                          confirmar={`¿Quitarle a ${m.nombre} el rol ${etiqueta(r.rol)}?`}>
                          <input type="hidden" name="cuenta" value={m.cuentaId} />
                          <input type="hidden" name="rol" value={r.rol} />
                        </Formulario>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap gap-4 border-t border-borde pt-3">
                  {faltan.length ? (
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold text-marca">Agregar otro rol</summary>
                      <Formulario accion={agregarRol} boton="Agregar" className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                        <input type="hidden" name="cuenta" value={m.cuentaId} />
                        <Selector id={`rol-${m.cuentaId}`} name="rol" etiqueta="Rol">
                          {faltan.map(([v, e]) => <option key={v} value={v}>{e}</option>)}
                        </Selector>
                      </Formulario>
                    </details>
                  ) : null}
                  {m.email && !soyYo ? (
                    <details>
                      <summary className="cursor-pointer text-sm font-semibold text-marca">No puede entrar</summary>
                      <p className="mt-2 max-w-sm text-sm text-suave">Le mandamos un correo con un enlace para que elija una contraseña nueva. Sirve si la invitación venció o si se la olvidó.</p>
                      <Formulario accion={enviarEnlace} boton="Enviar enlace" enviando="Enviando…" variante="secundario" className="mt-2 flex">
                        <input type="hidden" name="persona" value={m.personaId} />
                      </Formulario>
                    </details>
                  ) : null}
                </div>
              </Tarjeta>
            </li>
          );
        })}
      </ul>

      <Tarjeta className="mt-6">
        <h2 className="text-lg font-bold">Sumar a alguien al equipo</h2>
        <p className="mb-3 mt-1 max-w-3xl text-sm text-suave">
          Le llega un correo para elegir su contraseña y entra con el rol que elijas. Si esa persona ya tiene cuenta en el sistema (por ejemplo, es madre de un estudiante), solo se le agrega el rol.
        </p>
        <Formulario accion={sumarAlEquipo} boton="Enviar invitación" enviando="Enviando…" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Campo id="eq-apellidos" name="apellidos" etiqueta="Apellidos" required maxLength={80} autoComplete="off" />
          <Campo id="eq-nombres" name="nombres" etiqueta="Nombres" required maxLength={80} autoComplete="off" />
          <Campo id="eq-email" name="email" type="email" etiqueta="Email" required maxLength={120} autoComplete="off" />
          <Campo id="eq-telefono" name="telefono" type="tel" etiqueta="Teléfono (opcional)" maxLength={40} autoComplete="off" />
          <Selector id="eq-rol" name="rol" etiqueta="Rol" defaultValue="docente">
            {ROLES.map(([v, e]) => <option key={v} value={v}>{e}</option>)}
          </Selector>
        </Formulario>
      </Tarjeta>
    </>
  );
}
