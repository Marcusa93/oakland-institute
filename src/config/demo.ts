/**
 * Cuentas de DEMOSTRACIÓN (scripts/usuarios-demo.mjs). El ingreso de un clic
 * solo existe fuera de producción y cuando DEMO_CLAVE está definida en el
 * servidor: la contraseña nunca viaja al navegador.
 */
export const CUENTAS_DEMO = [
  { email: "direccion@demo.invalid", rol: "Dirección", quien: "Ana", detalle: "Tablero, aranceles y toda la gestión" },
  { email: "administracion@demo.invalid", rol: "Administración", quien: "Bruno", detalle: "Consultas, inscripciones y cobros" },
  { email: "docente@demo.invalid", rol: "Docente", quien: "Carla", detalle: "Sus comisiones y la asistencia" },
  { email: "tutor@demo.invalid", rol: "Familia", quien: "Diego", detalle: "Cursada y cuenta de su hija Emilia" },
  { email: "estudiante@demo.invalid", rol: "Estudiante adulto", quien: "Fabián", detalle: "Su cursada y Oakland AI" },
  { email: "otrafamilia@demo.invalid", rol: "Otra familia", quien: "Gabriela", detalle: "Para comprobar que no ve datos ajenos" },
] as const;

export function demoHabilitada() {
  return process.env.NEXT_PUBLIC_ENTORNO !== "produccion" && Boolean(process.env.DEMO_CLAVE);
}
