import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import { RegistrarServiceWorker, SCRIPT_INSTALACION } from "@/componentes/instalar-app";
import { institucion } from "@/config/institucion";
import "./globals.css";

// Grotesca variable con eje óptico y de ancho: expresiva en títulos grandes,
// sobria en texto chico. Una sola familia para todo el sitio.
const fuente = Bricolage_Grotesque({ variable: "--font-marca", subsets: ["latin"], axes: ["opsz", "wdth"] });

export const metadata: Metadata = {
  title: { default: institucion.nombre, template: `%s · ${institucion.nombre}` },
  description: `${institucion.lema} ${institucion.localidad}.`,
  applicationName: institucion.nombre,
  // iPhone: al «Agregar a inicio» abre sin barra de Safari, con nombre e ícono propios.
  appleWebApp: { capable: true, title: "Oakland", statusBarStyle: "default" },
  icons: { apple: "/iconos/apple-touch-icon.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#1c2a6b" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${fuente.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        {/* Captura el aviso «se puede instalar» antes de que cargue React. */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_INSTALACION }} />
        <a href="#contenido" className="saltar-al-contenido">Saltar al contenido</a>
        {children}
        <RegistrarServiceWorker />
      </body>
    </html>
  );
}
