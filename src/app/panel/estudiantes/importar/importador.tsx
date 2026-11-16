"use client";

import { useMemo, useState, useTransition } from "react";
import { Aviso, Boton, Insignia, type Tono } from "@/componentes/ui";
import { pesos } from "@/lib/formato";
import { analizarPlanilla, importarPlanilla, type Analisis, type ResultadoImportacion } from "./acciones";
import { csvModelo } from "./planilla";

const ESTADO: Record<string, [string, Tono]> = { nueva: ["Lista", "exito"], revisar: ["Revisar", "alerta"], error: ["No se puede", "peligro"] };
const SIN_CONEXION = "No pudimos conectar con el servidor. Revisá tu conexión y volvé a intentar.";
const TANDA = 25;

/** Excel en Windows guarda los CSV en ANSI (windows-1252): si no es UTF-8 válido, se relee así. */
async function leerArchivo(archivo: File): Promise<string> {
  const bytes = await archivo.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function descargarModelo() {
  const url = URL.createObjectURL(new Blob([csvModelo()], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "planilla-modelo-estudiantes.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export function Importador() {
  const [texto, setTexto] = useState<string | null>(null);
  const [nombreArchivo, setNombreArchivo] = useState("");
  const [analisis, setAnalisis] = useState<Analisis | null>(null);
  const [elegidas, setElegidas] = useState<Set<number>>(new Set());
  const [verificar, setVerificar] = useState(true);
  const [activos, setActivos] = useState(true);
  const [resultado, setResultado] = useState<ResultadoImportacion | null>(null);
  const [progreso, setProgreso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, iniciar] = useTransition();

  const conteo = useMemo(() => {
    const filas = analisis?.filas ?? [];
    return { nuevas: filas.filter((f) => f.estado === "nueva").length, revisar: filas.filter((f) => f.estado === "revisar").length, error: filas.filter((f) => f.estado === "error").length };
  }, [analisis]);

  function elegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0];
    setAnalisis(null); setResultado(null); setError(null);
    if (!archivo) return;
    if (/\.xlsx?$/i.test(archivo.name)) {
      setError("Ese archivo es de Excel. Abrilo y elegí Archivo → Guardar como → «CSV (delimitado por comas)», y subí ese archivo.");
      return;
    }
    setNombreArchivo(archivo.name);
    iniciar(async () => {
      try {
        const t = await leerArchivo(archivo);
        setTexto(t);
        const a = await analizarPlanilla(t);
        setAnalisis(a);
        setElegidas(new Set(a.filas.filter((f) => f.estado === "nueva").map((f) => f.numero)));
      } catch {
        setError(SIN_CONEXION);
      }
    });
  }

  function alternar(numero: number) {
    setElegidas((prev) => {
      const s = new Set(prev);
      if (s.has(numero)) s.delete(numero); else s.add(numero);
      return s;
    });
  }

  function importar() {
    if (!texto || elegidas.size === 0) return;
    if (!window.confirm(`¿Importar ${elegidas.size} ${elegidas.size === 1 ? "estudiante" : "estudiantes"}? No se puede deshacer de una vez.`)) return;
    setError(null);
    iniciar(async () => {
      const numeros = [...elegidas].sort((a, b) => a - b);
      const acumulado: ResultadoImportacion["resultados"] = [];
      try {
        for (let i = 0; i < numeros.length; i += TANDA) {
          setProgreso(`Importando ${Math.min(i + TANDA, numeros.length)} de ${numeros.length}…`);
          const r = await importarPlanilla(texto, { numeros: numeros.slice(i, i + TANDA), verificar, activos });
          if (!r.resultados.length && !r.ok) { setError(r.mensaje); break; }
          acumulado.push(...r.resultados);
        }
      } catch {
        setError(`${SIN_CONEXION} Lo importado hasta ahora quedó cargado; volvé a revisar la planilla para ver qué falta.`);
      }
      const bien = acumulado.filter((r) => r.ok).length;
      setResultado({
        ok: bien > 0, resultados: acumulado,
        mensaje: bien === acumulado.length ? `Listo: se importaron ${bien} estudiantes.` : `Se importaron ${bien} de ${acumulado.length}. Las que fallaron no se cargaron.`,
      });
      setProgreso(null);
      setAnalisis(null);
    });
  }

  return (
    <div className="space-y-5">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-suave">
        <li>Descargá la <button type="button" onClick={descargarModelo} className="font-semibold text-marca underline">planilla modelo</button> y completala, o usá la tuya con columnas de nombre parecido.</li>
        <li>En Excel: Archivo → Guardar como → «CSV». En Google Sheets: Archivo → Descargar → «Valores separados por comas».</li>
        <li>Subí el archivo: primero lo revisamos y te mostramos qué se va a cargar. Nada se guarda hasta que confirmes.</li>
      </ol>

      <div>
        <label htmlFor="planilla" className="text-sm font-medium">Archivo de la planilla (.csv)</label>
        <input id="planilla" type="file" accept=".csv,text/csv,.txt,.xlsx,.xls" onChange={elegirArchivo} disabled={trabajando}
          className="mt-1 block w-full rounded-base border border-borde bg-superficie p-2 text-sm file:mr-3 file:min-h-11 file:rounded-base file:border-0 file:bg-marca-suave file:px-4 file:font-semibold file:text-marca-fuerte" />
      </div>

      {trabajando && !progreso ? <Aviso>Revisando {nombreArchivo}…</Aviso> : null}
      {progreso ? <Aviso>{progreso}</Aviso> : null}
      {error ? <Aviso tono="peligro">{error}</Aviso> : null}
      {analisis && !analisis.ok ? <Aviso tono="peligro">{analisis.mensaje}</Aviso> : null}

      {analisis?.ok ? (
        <>
          <Aviso tono={conteo.error ? "alerta" : "exito"}>{analisis.mensaje}</Aviso>
          {analisis.ignoradas.length ? <p className="text-sm text-suave">Columnas que no usamos: {analisis.ignoradas.join(", ")}.</p> : null}
          <div className="overflow-x-auto rounded-base border border-borde bg-superficie">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <caption className="sr-only">Filas de la planilla</caption>
              <thead className="border-b border-borde bg-fondo text-xs uppercase tracking-wide text-suave">
                <tr><th className="px-3 py-2">Importar</th><th className="px-3 py-2">Fila</th><th className="px-3 py-2">Estudiante</th><th className="px-3 py-2">Responsable</th><th className="px-3 py-2">Deuda</th><th className="px-3 py-2">Estado</th></tr>
              </thead>
              <tbody className="divide-y divide-borde [&_td]:px-3 [&_td]:py-2 [&_td]:align-top">
                {analisis.filas.map((f) => {
                  const [e, t] = ESTADO[f.estado];
                  return (
                    <tr key={f.numero}>
                      <td>
                        <input type="checkbox" className="h-5 w-5" aria-label={`Importar fila ${f.numero}`} disabled={f.estado === "error"}
                          checked={elegidas.has(f.numero)} onChange={() => alternar(f.numero)} />
                      </td>
                      <td>{f.numero}</td>
                      <td><strong>{f.estudiante}</strong>{f.documento ? <p className="text-suave">Doc. {f.documento}</p> : null}</td>
                      <td>{f.responsable ?? <span className="text-suave">—</span>}</td>
                      <td>{f.deuda && Number(f.deuda) > 0 ? pesos(f.deuda) : <span className="text-suave">—</span>}</td>
                      <td><Insignia tono={t}>{e}</Insignia>{f.motivo ? <p className="mt-1 text-suave">{f.motivo}</p> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <fieldset className="space-y-2 text-sm">
            <legend className="font-semibold">Opciones</legend>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={activos} onChange={(e) => setActivos(e.target.checked)} /> Son estudiantes que ya cursan (quedan como «Activos»)
            </label>
            <label className="flex min-h-11 items-center gap-2">
              <input type="checkbox" checked={verificar} onChange={(e) => setVerificar(e.target.checked)} />
              El instituto ya conoce a estos responsables: dejarlos verificados, con acceso a notas, documentos y pagos
            </label>
            <p className="text-suave">La deuda se carga como «Saldo anterior al sistema», con vencimiento hoy, a nombre del responsable (o del estudiante si no hay responsable). Las inscripciones a comisiones se hacen después, desde Comisiones.</p>
          </fieldset>

          <div className="flex flex-wrap items-center gap-3">
            <Boton type="button" onClick={importar} disabled={trabajando || elegidas.size === 0}>
              {trabajando ? "Importando…" : `Importar ${elegidas.size} ${elegidas.size === 1 ? "estudiante" : "estudiantes"}`}
            </Boton>
            {conteo.revisar ? <span className="text-sm text-suave">Las filas «Revisar» quedan sin marcar: marcalas si son personas distintas.</span> : null}
          </div>
        </>
      ) : null}

      {resultado ? (
        <div className="space-y-3">
          <Aviso tono={resultado.resultados.every((r) => r.ok) ? "exito" : "alerta"}>{resultado.mensaje}</Aviso>
          <ul className="max-h-80 space-y-1 overflow-y-auto rounded-base border border-borde bg-superficie p-3 text-sm">
            {resultado.resultados.map((r) => (
              <li key={r.numero} className={r.ok ? "" : "font-semibold text-peligro"}>Fila {r.numero}: {r.detalle}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
