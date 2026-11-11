/**
 * Aritmética de importes en centavos enteros. Solo para validar topes y para
 * sumas de presentación: los saldos reales salen siempre de la base.
 */

/** Decimal con punto ("45000.50", ya normalizado) o número de la base → centavos. */
export function aCentavos(valor: string | number | null | undefined): number {
  if (valor === null || valor === undefined || valor === "") return 0;
  if (typeof valor === "number") return Math.round(valor * 100);
  const negativo = valor.startsWith("-");
  const [entero, decimales = ""] = valor.replace("-", "").split(".");
  const centavos = Number.parseInt(entero || "0", 10) * 100 + Number.parseInt((decimales + "00").slice(0, 2), 10);
  return negativo ? -centavos : centavos;
}

/** Centavos → decimal con punto, listo para `pesos()` o para mandar a una función de la base. */
export function deCentavos(centavos: number): string {
  const abs = Math.abs(centavos);
  return `${centavos < 0 ? "-" : ""}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

export function sumar(valores: Array<string | number | null | undefined>): string {
  return deCentavos(valores.reduce<number>((total, v) => total + aCentavos(v), 0));
}
