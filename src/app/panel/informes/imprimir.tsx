"use client";

import { Boton } from "@/componentes/ui";

export function BotonImprimir() {
  return <Boton type="button" onClick={() => window.print()} className="print:hidden">🖨️ Imprimir / guardar PDF</Boton>;
}
