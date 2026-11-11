import Link from "next/link";
import { salir } from "@/app/ingresar/acciones";
import { Marca } from "@/componentes/marca";
import { OaklandAI, type PerfilAI } from "@/componentes/oakland-ai";
import { entorno } from "@/config/institucion";
import type { Perfil } from "@/lib/permisos";
import { institucion } from "@/config/institucion";
import { MenuPanel, type SeccionMenu } from "@/componentes/menu-panel";
import { GRUPOS, menuPara } from "@/lib/navegacion";
import { exigirSesion } from "@/lib/sesion";

const ETIQUETA: Record<string, string> = {
  estudiante: "Estudiante", tutor: "Familia", docente: "Docente", administracion: "Administración", direccion: "Dirección",
};

/** El asistente toma el tono del rol principal de la cuenta. */
function perfilAI(perfiles: Perfil[]): PerfilAI {
  if (perfiles.includes("direccion") || perfiles.includes("administracion")) return "gestion";
  if (perfiles.includes("docente")) return "docente";
  if (perfiles.includes("estudiante")) return "estudiante";
  if (perfiles.includes("tutor")) return "familia";
  return "visitante";
}

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const sesion = await exigirSesion();
  const menu = menuPara(sesion.perfiles);
  const secciones: SeccionMenu[] = [
    { titulo: "", enlaces: [{ href: "/panel", etiqueta: "Inicio", icono: "🏠" }] },
    ...GRUPOS.map((g) => ({
      titulo: g,
      enlaces: menu.filter((i) => i.grupo === g).map(({ href, etiqueta, icono }) => ({ href, etiqueta, icono })),
    })).filter((s) => s.enlaces.length > 0),
  ];
  return (
    <>
      <header className="border-b border-borde bg-superficie">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-2">
          <Link href="/panel" aria-label={`${institucion.nombre}, inicio del panel`}><Marca /></Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="hidden text-suave sm:inline">{sesion.perfiles.map((p) => ETIQUETA[p] ?? p).join(" · ") || "Sin perfil asignado"}</span>
            <form action={salir}><button className="min-h-11 font-semibold text-marca hover:underline">Salir</button></form>
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col lg:flex-row lg:gap-8 lg:px-4">
        <MenuPanel secciones={secciones} />
        <main id="contenido" className="min-w-0 flex-1 px-4 py-6 lg:px-0">{children}</main>
      </div>
      <OaklandAI perfil={perfilAI(sesion.perfiles)} ejemplo={entorno() !== "produccion"} enlaceContacto="/panel/avisos" />
    </>
  );
}
