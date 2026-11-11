import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { institucion } from "@/config/institucion";
import "./globals.css";

// Grotesca variable con eje óptico y de ancho: expresiva en títulos grandes,
// sobria en texto chico. Una sola familia para todo el sitio.
const fuente = Bricolage_Grotesque({ variable: "--font-marca", subsets: ["latin"], axes: ["opsz", "wdth"] });

export const metadata: Metadata = {
  title: { default: institucion.nombre, template: `%s · ${institucion.nombre}` },
  description: `${institucion.lema} ${institucion.localidad}.`,
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${fuente.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a href="#contenido" className="saltar-al-contenido">Saltar al contenido</a>
        {children}
      </body>
    </html>
  );
}
