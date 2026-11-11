// Períodos rápidos para los informes (sin "use client", sin acceso a datos).
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

function menosDias(iso: string, dias: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

export const RANGOS = [
  ["mes", "Este mes"], ["trimestre", "Últimos 3 meses"], ["anio", "Este año"], ["otro", "Otras fechas"],
] as const;
export type Rango = (typeof RANGOS)[number][0];

/** Desde, hasta y nombre sugerido del período para un rango, tomando `hoy` (AAAA-MM-DD). */
export function resolverRango(rango: string, hoy: string, desde?: string, hasta?: string) {
  const anio = hoy.slice(0, 4);
  const mes = MESES[Number(hoy.slice(5, 7)) - 1];
  if (rango === "mes") return { desde: `${hoy.slice(0, 7)}-01`, hasta: hoy, nombre: `${mes[0].toUpperCase()}${mes.slice(1)} ${anio}` };
  if (rango === "anio") return { desde: `${anio}-01-01`, hasta: hoy, nombre: `Ciclo ${anio}` };
  if (rango === "otro" && desde && hasta && /^\d{4}-\d{2}-\d{2}$/.test(desde) && /^\d{4}-\d{2}-\d{2}$/.test(hasta)) {
    return { desde, hasta, nombre: `Del ${desde.slice(8, 10)}/${desde.slice(5, 7)} al ${hasta.slice(8, 10)}/${hasta.slice(5, 7)}/${hasta.slice(0, 4)}` };
  }
  return { desde: menosDias(hoy, 90), hasta: hoy, nombre: `Trimestre al ${hoy.slice(8, 10)}/${hoy.slice(5, 7)}/${anio}` };
}
