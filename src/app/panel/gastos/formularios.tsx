"use client";

import { useActionState } from "react";
import type { Resultado } from "@/app/panel/acciones";
import { Aviso, Boton, Campo, Selector } from "@/componentes/ui";
import { anularGasto, anularPagoDocente, crearCategoria, crearGasto, crearPagoDocente, crearProveedor } from "./acciones";

type Opcion = { id: string; nombre: string };

function Resultadito({ estado }: { estado: Resultado | null }) {
  return estado ? <Aviso tono={estado.ok ? "exito" : "peligro"}>{estado.mensaje}</Aviso> : null;
}

export function NuevoGasto({ hoy, categorias, proveedores, cursos, comisiones }: {
  hoy: string; categorias: Opcion[]; proveedores: Opcion[]; cursos: Opcion[]; comisiones: Opcion[];
}) {
  const [estado, accion, guardando] = useActionState(crearGasto, null);
  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Campo id="gasto-fecha" name="fecha" type="date" etiqueta="Fecha" defaultValue={hoy} max={hoy} required />
      <Selector id="gasto-categoria" name="categoria" etiqueta="Categoría" required defaultValue="">
        <option value="" disabled>Elegí una categoría</option>
        {categorias.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </Selector>
      <Selector id="gasto-proveedor" name="proveedor" etiqueta="Proveedor (opcional)" defaultValue="">
        <option value="">Sin proveedor</option>
        {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
      </Selector>
      <Selector id="gasto-medio" name="medio" etiqueta="Medio de pago" defaultValue="efectivo">
        <option value="efectivo">Efectivo</option>
        <option value="transferencia">Transferencia</option>
      </Selector>
      <Campo id="gasto-descripcion" name="descripcion" etiqueta="Descripción" required minLength={3} maxLength={200} className="sm:col-span-2" />
      <Campo id="gasto-importe" name="importe" etiqueta="Importe" inputMode="decimal" placeholder="45.000,50" required autoComplete="off" />
      <div className="hidden lg:block" />
      <Selector id="gasto-curso" name="curso" etiqueta="Atribuir a un curso (opcional)" defaultValue="">
        <option value="">Gasto general</option>
        {cursos.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </Selector>
      <Selector id="gasto-comision" name="comision" etiqueta="Atribuir a una comisión (opcional)" defaultValue="">
        <option value="">Ninguna en particular</option>
        {comisiones.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </Selector>
      <div className="flex flex-wrap items-end gap-3 sm:col-span-2">
        <Boton type="submit" disabled={guardando || categorias.length === 0}>{guardando ? "Guardando…" : "Registrar gasto"}</Boton>
      </div>
      <div className="sm:col-span-2 lg:col-span-4">
        {categorias.length === 0 ? <Aviso tono="alerta">Primero agregá al menos una categoría de gasto (más abajo).</Aviso> : null}
        <Resultadito estado={estado} />
      </div>
    </form>
  );
}

export function NuevaCategoria() {
  const [estado, accion, guardando] = useActionState(crearCategoria, null);
  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
      <Campo id="categoria-nombre" name="nombre" etiqueta="Nueva categoría" required minLength={2} maxLength={60} placeholder="Servicios, librería, limpieza…" />
      <Boton type="submit" variante="secundario" disabled={guardando}>{guardando ? "Agregando…" : "Agregar categoría"}</Boton>
      <div className="sm:col-span-2"><Resultadito estado={estado} /></div>
    </form>
  );
}

export function NuevoProveedor() {
  const [estado, accion, guardando] = useActionState(crearProveedor, null);
  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_12rem_1fr_auto] lg:items-end">
      <Campo id="proveedor-nombre" name="nombre" etiqueta="Nuevo proveedor" required minLength={2} maxLength={120} />
      <Campo id="proveedor-cuit" name="cuit" etiqueta="CUIT (opcional)" inputMode="numeric" maxLength={13} autoComplete="off" />
      <Campo id="proveedor-contacto" name="contacto" etiqueta="Contacto (opcional)" maxLength={200} />
      <Boton type="submit" variante="secundario" disabled={guardando}>{guardando ? "Agregando…" : "Agregar proveedor"}</Boton>
      <div className="sm:col-span-2 lg:col-span-4"><Resultadito estado={estado} /></div>
    </form>
  );
}

/** Anulación con motivo de un gasto o de un pago a docente. No se borra nada. */
export function Anular({ id, tipo }: { id: string; tipo: "gasto" | "pago_docente" }) {
  const [estado, accion, guardando] = useActionState(tipo === "gasto" ? anularGasto : anularPagoDocente, null);
  return (
    <details>
      <summary className="cursor-pointer text-sm font-semibold text-marca">Anular</summary>
      <form action={accion} className="mt-2 grid min-w-48 gap-2">
        <input type="hidden" name="id" value={id} />
        <Campo id={`anular-${tipo}-${id}`} name="motivo" etiqueta="Motivo de la anulación" required minLength={5} maxLength={300} />
        <Boton type="submit" variante="peligro" disabled={guardando}>{guardando ? "Anulando…" : "Anular"}</Boton>
      </form>
      <Resultadito estado={estado} />
    </details>
  );
}

export function NuevoPagoDocente({ hoy, docentes, comisiones }: { hoy: string; docentes: Opcion[]; comisiones: Opcion[] }) {
  const [estado, accion, guardando] = useActionState(crearPagoDocente, null);
  return (
    <form action={accion} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Selector id="pd-docente" name="docente" etiqueta="Docente" required defaultValue="">
        <option value="" disabled>Elegí un docente</option>
        {docentes.map((d) => <option key={d.id} value={d.id}>{d.nombre}</option>)}
      </Selector>
      <Campo id="pd-periodo" name="periodo" type="month" etiqueta="Mes al que corresponde" defaultValue={hoy.slice(0, 7)} required />
      <Campo id="pd-fecha" name="fecha" type="date" etiqueta="Fecha de pago" defaultValue={hoy} max={hoy} required />
      <Campo id="pd-importe" name="importe" etiqueta="Importe" inputMode="decimal" placeholder="45.000,50" required autoComplete="off" />
      <Selector id="pd-comision" name="comision" etiqueta="Comisión (opcional)" defaultValue="">
        <option value="">Ninguna en particular</option>
        {comisiones.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
      </Selector>
      <Campo id="pd-nota" name="nota" etiqueta="Nota (opcional)" maxLength={300} />
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3">
        <Boton type="submit" disabled={guardando || docentes.length === 0}>{guardando ? "Guardando…" : "Registrar pago a docente"}</Boton>
        <Resultadito estado={estado} />
      </div>
    </form>
  );
}
