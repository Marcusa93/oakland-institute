import type { Metadata } from "next";
import { Enlace, Tarjeta, Titulo } from "@/componentes/ui";
import { exigirPermiso } from "@/lib/sesion";
import { Importador } from "./importador";

export const metadata: Metadata = { title: "Importar estudiantes" };

export default async function ImportarEstudiantes() {
  await exigirPermiso("estudiantes", "crear");
  return (
    <>
      <Titulo
        descripcion="Carga inicial desde las planillas del instituto: estudiantes, su responsable y lo que deben hoy. Cada fila entra completa o no entra, y antes de cargar te mostramos los duplicados."
        acciones={<Enlace href="/panel/estudiantes" variante="secundario">Volver a estudiantes</Enlace>}>
        Importar desde una planilla
      </Titulo>
      <Tarjeta><Importador /></Tarjeta>
    </>
  );
}
