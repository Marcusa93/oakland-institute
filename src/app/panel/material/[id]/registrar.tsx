"use client";

import { useEffect } from "react";
import { registrarLectura } from "../../biblioteca/acciones";

/** Avisa que el material se abrió (una vez por visita, no en la precarga del enlace). */
export function RegistrarLectura({ material }: { material: string }) {
  useEffect(() => { void registrarLectura(material); }, [material]);
  return null;
}
