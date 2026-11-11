import type { Metadata } from "next";
import { Bienvenida } from "./bienvenida";

export const metadata: Metadata = { title: "Bienvenida" };

export default function Pagina() {
  return (
    <main id="contenido" className="mx-auto w-full max-w-md flex-1 px-4 py-10">
      <Bienvenida />
    </main>
  );
}
