import type { MetadataRoute } from "next";
import { institucion } from "@/config/institucion";

/**
 * Manifest de la app instalable: con esto Android (Chrome) ofrece «Instalar
 * app» y la abre a pantalla completa, con su ícono en el inicio del teléfono.
 * Los íconos se generan con `node scripts/generar-iconos.mjs`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/panel",
    name: institucion.nombre,
    short_name: "Oakland",
    description: institucion.lema,
    lang: "es-AR",
    dir: "ltr",
    start_url: "/panel?app=1",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#1c2a6b",
    theme_color: "#1c2a6b",
    categories: ["education"],
    icons: [
      { src: "/iconos/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/iconos/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/iconos/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Mantener apretado el ícono: accesos directos que sirven a todos los perfiles.
    shortcuts: [
      { name: "Mensajes", url: "/panel/mensajes", icons: [{ src: "/iconos/icono-96.png", sizes: "96x96", type: "image/png" }] },
      { name: "Avisos", url: "/panel/avisos", icons: [{ src: "/iconos/icono-96.png", sizes: "96x96", type: "image/png" }] },
    ],
  };
}
