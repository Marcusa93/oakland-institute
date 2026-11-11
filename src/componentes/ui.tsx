import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const base =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-base px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60";
const variantes = {
  primario: "bg-marca text-sobre-marca hover:bg-marca-fuerte",
  secundario: "border border-borde bg-superficie text-texto hover:bg-marca-suave",
  peligro: "bg-acento text-white hover:bg-[#a90d26]",
  texto: "text-marca underline-offset-4 hover:underline",
} as const;
type Variante = keyof typeof variantes;

export function Boton({ variante = "primario", className = "", ...props }: ComponentProps<"button"> & { variante?: Variante }) {
  return <button className={`${base} ${variantes[variante]} ${className}`} {...props} />;
}

export function Enlace({ variante = "primario", className = "", ...props }: ComponentProps<typeof Link> & { variante?: Variante }) {
  return <Link className={`${base} ${variantes[variante]} ${className}`} {...props} />;
}

export function Tarjeta({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-base border border-borde bg-superficie p-4 sm:p-5 ${className}`}>{children}</section>;
}

export function Titulo({ children, descripcion, acciones }: { children: ReactNode; descripcion?: ReactNode; acciones?: ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{children}</h1>
        {descripcion ? <p className="mt-1 max-w-2xl text-sm text-suave">{descripcion}</p> : null}
      </div>
      {acciones}
    </header>
  );
}

const tonos = {
  neutro: "bg-fondo text-suave border-borde",
  marca: "bg-marca-suave text-marca-fuerte border-transparent",
  exito: "bg-exito-suave text-exito border-transparent",
  alerta: "bg-alerta-suave text-alerta border-transparent",
  peligro: "bg-peligro-suave text-peligro border-transparent",
} as const;
export type Tono = keyof typeof tonos;

export function Insignia({ children, tono = "neutro" }: { children: ReactNode; tono?: Tono }) {
  return <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tonos[tono]}`}>{children}</span>;
}

/** Mensajes de resultado. `role` hace que los lectores de pantalla lo anuncien. */
export function Aviso({ children, tono = "marca" }: { children: ReactNode; tono?: Tono }) {
  return (
    <p role={tono === "peligro" ? "alert" : "status"} className={`rounded-base border px-3 py-2 text-sm ${tonos[tono]}`}>
      {children}
    </p>
  );
}

export function EstadoVacio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="rounded-base border border-dashed border-borde bg-superficie px-4 py-10 text-center">
      <p className="font-semibold">{titulo}</p>
      {children ? <div className="mx-auto mt-1 max-w-md text-sm text-suave">{children}</div> : null}
    </div>
  );
}

const claseCampo =
  "mt-1 block min-h-11 w-full rounded-base border border-borde bg-superficie px-3 py-2 text-base text-texto placeholder:text-suave/70";

export function Campo({ etiqueta, ayuda, error, id, className = "", ...props }: ComponentProps<"input"> & { etiqueta: string; ayuda?: string; error?: string; id: string }) {
  const describe = [ayuda ? `${id}-ayuda` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="text-sm font-medium">
        {etiqueta}
        {props.required ? <span className="text-peligro" aria-hidden> *</span> : null}
      </label>
      <input id={id} aria-describedby={describe} aria-invalid={error ? true : undefined} className={claseCampo} {...props} />
      {ayuda ? <p id={`${id}-ayuda`} className="mt-1 text-xs text-suave">{ayuda}</p> : null}
      {error ? <p id={`${id}-error`} className="mt-1 text-xs font-medium text-peligro">{error}</p> : null}
    </div>
  );
}

export function Selector({ etiqueta, id, children, className = "", ...props }: ComponentProps<"select"> & { etiqueta: string; id: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="text-sm font-medium">{etiqueta}</label>
      <select id={id} className={claseCampo} {...props}>{children}</select>
    </div>
  );
}

export function AreaTexto({ etiqueta, id, className = "", ...props }: ComponentProps<"textarea"> & { etiqueta: string; id: string }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="text-sm font-medium">{etiqueta}</label>
      <textarea id={id} rows={3} className={claseCampo} {...props} />
    </div>
  );
}

/** Tabla que en pantallas chicas se desplaza de costado sin romper la página. */
export function Tabla({ encabezados, children, leyenda }: { encabezados: string[]; children: ReactNode; leyenda: string }) {
  return (
    <div className="overflow-x-auto rounded-base border border-borde bg-superficie">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <caption className="sr-only">{leyenda}</caption>
        <thead className="border-b border-borde bg-fondo text-xs uppercase tracking-wide text-suave">
          <tr>{encabezados.map((e) => <th key={e} scope="col" className="px-3 py-2 font-semibold">{e}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-borde [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top">{children}</tbody>
      </table>
    </div>
  );
}
