"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Aviso, Boton } from "@/componentes/ui";
import { ACEPTADOS, MAXIMO_BYTES, MIME_DOCX, digitalizar, extension, fotosAPdf, type Origen } from "@/lib/digitalizar";
import { confirmarArchivo, crearMaterial } from "../acciones";

type Paso = "elegir" | "camara" | "digitalizando" | "revisar" | "guardando";
interface Comision { id: string; texto: string }

const titulo = (nombre: string) => nombre.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
const kb = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toLocaleString("es-AR", { maximumFractionDigits: 1 })} MB` : `${Math.ceil(b / 1024)} KB`);

export function Cargador({ comisiones, niveles }: { comisiones: Comision[]; niveles: string[] }) {
  const router = useRouter();
  const [paso, setPaso] = useState<Paso>("elegir");
  const [error, setError] = useState("");
  const [fotos, setFotos] = useState<File[]>([]);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [progreso, setProgreso] = useState({ etapa: "", avance: 0 });
  const [texto, setTexto] = useState("");
  const [origen, setOrigen] = useState<Origen | "manual">("manual");
  const [paginas, setPaginas] = useState<number | null>(null);
  const [aviso, setAviso] = useState("");
  const [datos, setDatos] = useState({ titulo: "", nivel: "", descripcion: "" });
  const [elegidas, setElegidas] = useState<string[]>([]);
  const entradaArchivo = useRef<HTMLInputElement>(null);
  const entradaCamara = useRef<HTMLInputElement>(null);

  // Vista previa del original mientras se revisa el texto.
  const vista = useMemo(() => {
    const fuentes = fotos.length ? fotos : archivo && archivo.type !== MIME_DOCX ? [archivo] : [];
    return fuentes.map((f) => URL.createObjectURL(f));
  }, [fotos, archivo]);
  useEffect(() => () => vista.forEach((u) => URL.revokeObjectURL(u)), [vista]);

  function validar(lista: File[]) {
    for (const f of lista) {
      if (!ACEPTADOS.includes(f.type)) return "Ese formato no es compatible. Subí un PDF, una foto (JPG, PNG o WebP) o un Word (.docx).";
      if (f.size > MAXIMO_BYTES) return `«${f.name}» pesa ${kb(f.size)}: el máximo es 25 MB.`;
    }
    return "";
  }

  async function procesar(lista: File[], deCamara: boolean) {
    setError("");
    setPaso("digitalizando");
    setProgreso({ etapa: "Empezando…", avance: 0 });
    try {
      const r = await digitalizar(lista, setProgreso);
      // Las fotos se guardan juntas como un PDF: un solo original por material.
      let original = lista[0]!;
      if (lista.length > 1 || deCamara) {
        setProgreso({ etapa: "Armando el PDF con las páginas…", avance: 1 });
        original = await fotosAPdf(lista);
      }
      if (original.size > MAXIMO_BYTES) throw new Error("El PDF armado supera los 25 MB. Probá con menos páginas.");
      setArchivo(original);
      setTexto(r.texto);
      setOrigen(r.origen);
      setPaginas(r.paginas || null);
      setDatos((d) => ({ ...d, titulo: d.titulo || titulo(lista[0]!.name) }));
      setAviso(
        !r.texto ? "No encontramos texto. Si es una foto, probá con más luz y la hoja derecha, o escribí el texto a mano."
        : r.paginasOcr ? `${r.paginasOcr === 1 ? "Se digitalizó 1 página" : `Se digitalizaron ${r.paginasOcr} páginas`} con OCR. Revisá el texto: a veces confunde letras o signos.`
        : "",
      );
      setPaso("revisar");
    } catch (e) {
      setError(e instanceof Error && e.message.startsWith("El PDF") ? e.message : "No pudimos leer el archivo. Probá de nuevo o con otro archivo.");
      setPaso(deCamara ? "camara" : "elegir");
    }
  }

  function elegirArchivo(lista: FileList | null) {
    const archivos = [...(lista ?? [])];
    if (!archivos.length) return;
    const fallo = validar(archivos);
    if (fallo) { setError(fallo); return; }
    const imagenes = archivos.every((f) => f.type.startsWith("image/"));
    if (archivos.length > 1 && !imagenes) { setError("Varios archivos a la vez solo si son fotos. Un PDF o un Word se suben de a uno."); return; }
    if (imagenes) setFotos(archivos);
    void procesar(archivos, false);
  }

  function sumarFotos(lista: FileList | null) {
    const nuevas = [...(lista ?? [])];
    const fallo = validar(nuevas);
    if (fallo) { setError(fallo); return; }
    setError("");
    setFotos((f) => [...f, ...nuevas].slice(0, 30));
  }

  function escribir() {
    setArchivo(null); setFotos([]); setTexto(""); setOrigen("manual"); setPaginas(null); setAviso("");
    setPaso("revisar");
  }

  async function guardar() {
    setError("");
    if (datos.titulo.trim().length < 3) { setError("Poné un título de al menos 3 letras."); return; }
    if (!archivo && !texto.trim()) { setError("Escribí el texto del material."); return; }
    setPaso("guardando");
    const ext = archivo ? extension(archivo) : null;
    const r = await crearMaterial({
      ...datos, texto, origen, paginas, comisiones: elegidas,
      archivo: archivo && ext ? { nombre: archivo.name.slice(0, 200), mime: archivo.type, bytes: archivo.size, extension: ext } : null,
    });
    if (!r.ok) { setError(r.mensaje); setPaso("revisar"); return; }
    if (r.subida && archivo) {
      try {
        const subida = await fetch(r.subida.url, {
          method: "PUT", body: archivo,
          headers: { "content-type": archivo.type, "x-upsert": "false", "cache-control": "max-age=3600" },
        });
        if (!subida.ok) throw new Error(String(subida.status));
      } catch {
        router.push(`/panel/biblioteca/${r.id}?aviso=sin-archivo`);
        return;
      }
      const c = await confirmarArchivo({ id: r.id, ruta: r.subida.ruta, nombre: archivo.name.slice(0, 200), mime: archivo.type, bytes: archivo.size });
      if (!c.ok) { router.push(`/panel/biblioteca/${r.id}?aviso=sin-archivo`); return; }
    }
    router.push(`/panel/biblioteca/${r.id}?aviso=creado`);
  }

  if (paso === "elegir" || paso === "camara") {
    return (
      <div className="space-y-4">
        {error ? <Aviso tono="peligro">{error}</Aviso> : null}
        {paso === "elegir" ? (
          <div className="grid gap-4 md:grid-cols-3">
            <button type="button" onClick={() => entradaArchivo.current?.click()}
              onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); elegirArchivo(e.dataTransfer.files); }}
              className="flex min-h-48 flex-col items-start justify-end rounded-[1.75rem] border-2 border-dashed border-marca bg-marca-suave/40 p-5 text-left hover:bg-marca-suave md:col-span-2">
              <span aria-hidden className="text-4xl">📄</span>
              <span className="mt-3 text-xl font-extrabold text-marca-fuerte">Subir un archivo</span>
              <span className="mt-1 text-suave">PDF, foto o Word, hasta 25 MB. Si es un escaneo, lo pasamos a texto acá mismo. También podés arrastrarlo.</span>
            </button>
            <div className="grid gap-4">
              <button type="button" onClick={() => { setFotos([]); setError(""); setPaso("camara"); }}
                className="flex flex-col items-start rounded-[1.75rem] bg-marca p-5 text-left text-white hover:bg-marca-fuerte">
                <span aria-hidden className="text-3xl">📷</span>
                <span className="mt-2 text-lg font-extrabold">Escanear con la cámara</span>
                <span className="text-sm text-white/80">Sacale foto a cada página del libro o la fotocopia.</span>
              </button>
              <button type="button" onClick={escribir}
                className="flex flex-col items-start rounded-[1.75rem] border border-borde bg-superficie p-5 text-left hover:border-marca">
                <span aria-hidden className="text-3xl">✍️</span>
                <span className="mt-2 text-lg font-extrabold text-marca-fuerte">Escribir el texto</span>
                <span className="text-sm text-suave">Un vocabulario, una lectura o una consigna.</span>
              </button>
            </div>
            <input ref={entradaArchivo} type="file" multiple accept={ACEPTADOS.join(",")} className="sr-only" tabIndex={-1}
              onChange={(e) => { elegirArchivo(e.target.files); e.target.value = ""; }} />
          </div>
        ) : (
          <div className="rounded-[1.75rem] border border-borde bg-superficie p-5">
            <h2 className="text-lg font-bold">Escanear páginas</h2>
            <p className="mt-1 text-sm text-suave">Una foto por página, con buena luz y la hoja derecha. Cuando estén todas, las digitalizamos juntas en un solo material.</p>
            <ol className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-5">
              {fotos.map((f, i) => (
                <li key={`${i}-${f.name}-${f.size}`} className="relative">
                  {vista[i] ? (
                    // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
                    <img src={vista[i]} alt={`Página ${i + 1}`} className="aspect-[3/4] w-full rounded-xl border border-borde object-cover" />
                  ) : null}
                  <span className="absolute left-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-marca text-xs font-bold text-white">{i + 1}</span>
                  <button type="button" onClick={() => setFotos((l) => l.filter((_, j) => j !== i))} aria-label={`Quitar la página ${i + 1}`}
                    className="absolute right-1 top-1 grid size-8 place-items-center rounded-full bg-white/90 text-acento shadow">✕</button>
                </li>
              ))}
              <li>
                <button type="button" onClick={() => entradaCamara.current?.click()}
                  className="flex aspect-[3/4] w-full flex-col items-center justify-center rounded-xl border-2 border-dashed border-marca text-marca hover:bg-marca-suave">
                  <span aria-hidden className="text-3xl">＋</span>
                  <span className="text-sm font-semibold">{fotos.length ? "Otra página" : "Sacar foto"}</span>
                </button>
              </li>
            </ol>
            <input ref={entradaCamara} type="file" accept="image/*" capture="environment" multiple className="sr-only" tabIndex={-1}
              onChange={(e) => { sumarFotos(e.target.files); e.target.value = ""; }} />
            <div className="mt-5 flex flex-wrap gap-2">
              <Boton type="button" disabled={!fotos.length} onClick={() => void procesar(fotos, true)}>
                {fotos.length ? `Digitalizar ${fotos.length} ${fotos.length === 1 ? "página" : "páginas"}` : "Digitalizar"}
              </Boton>
              <Boton type="button" variante="secundario" onClick={() => { setFotos([]); setPaso("elegir"); }}>Volver</Boton>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (paso === "digitalizando") {
    return (
      <div className="renglones rounded-[1.75rem] border border-borde bg-superficie p-6 [--linea:rgb(19_29_79/0.08)] [--renglon:2.25rem]" role="status" aria-live="polite">
        <p className="text-2xl font-extrabold text-marca-fuerte">Digitalizando…</p>
        <p className="mt-2 text-suave">{progreso.etapa}</p>
        <div className="mt-4 h-3 max-w-lg overflow-hidden rounded-full bg-pizarra" role="progressbar" aria-label="Avance"
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progreso.avance * 100)}>
          <div className="h-full rounded-full bg-acento transition-[width] motion-reduce:transition-none" style={{ width: `${Math.max(4, progreso.avance * 100)}%` }} />
        </div>
        <p className="mt-4 text-sm text-suave">Todo pasa en este dispositivo: el archivo todavía no se subió.</p>
      </div>
    );
  }

  const guardando = paso === "guardando";
  return (
    <div className="space-y-5">
      {error ? <Aviso tono="peligro">{error}</Aviso> : null}
      {aviso ? <Aviso tono="alerta">{aviso}</Aviso> : null}
      <div className={`grid gap-6 ${vista.length ? "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]" : ""}`}>
        {vista.length ? (
          <section aria-label="Original" className="space-y-3">
            <h2 className="text-sm font-semibold text-suave">Original {archivo ? `· ${archivo.name} (${kb(archivo.size)})` : ""}</h2>
            {fotos.length ? (
              <div className="max-h-[70vh] space-y-3 overflow-y-auto rounded-2xl border border-borde bg-pizarra p-3">
                {vista.map((u, i) => (
                  // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
                  <img key={u} src={u} alt={`Página ${i + 1}`} className="w-full rounded-lg bg-white shadow-sm" />
                ))}
              </div>
            ) : archivo?.type === "application/pdf" ? (
              <iframe src={vista[0]} title="Vista previa del PDF" className="h-[70vh] w-full rounded-2xl border border-borde bg-white" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- vista previa local (blob:)
              <img src={vista[0]} alt="Vista previa" className="w-full rounded-2xl border border-borde bg-white" />
            )}
          </section>
        ) : null}

        <section aria-label="Versión digital" className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
            <label className="block">
              <span className="text-sm font-medium">Título</span>
              <input value={datos.titulo} onChange={(e) => setDatos({ ...datos, titulo: e.target.value })} maxLength={160} required
                className="mt-1 block min-h-11 w-full rounded-base border border-borde bg-superficie px-3 text-lg font-bold" placeholder="Irregular verbs" />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Para <span className="font-normal text-suave">(opcional)</span></span>
              <input value={datos.nivel} onChange={(e) => setDatos({ ...datos, nivel: e.target.value })} maxLength={60} list="niveles-material"
                className="mt-1 block min-h-11 w-full rounded-base border border-borde bg-superficie px-3" placeholder="Kids 2, Teens…" />
              <datalist id="niveles-material">{niveles.map((n) => <option key={n} value={n} />)}</datalist>
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium">Texto digital</span>
            <span className="block text-xs text-suave">Es lo que los estudiantes leen y escuchan en el celular, y lo que se busca en la biblioteca.</span>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={16} maxLength={200000} spellCheck lang="en"
              className="renglones mt-2 block w-full rounded-base border border-borde bg-superficie bg-local px-4 py-0 font-[450] leading-[2rem] [--linea:rgb(19_29_79/0.09)] [--renglon:2rem]"
              placeholder="Escribí o pegá el texto del material." />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Indicación para los estudiantes <span className="font-normal text-suave">(opcional)</span></span>
            <input value={datos.descripcion} onChange={(e) => setDatos({ ...datos, descripcion: e.target.value })} maxLength={500}
              className="mt-1 block min-h-11 w-full rounded-base border border-borde bg-superficie px-3" placeholder="Leelo antes del jueves y marcá las palabras nuevas." />
          </label>
          {comisiones.length ? (
            <fieldset>
              <legend className="text-sm font-medium">Compartir con <span className="font-normal text-suave">(también lo podés hacer después)</span></legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {comisiones.map((k) => {
                  const activa = elegidas.includes(k.id);
                  return (
                    <button key={k.id} type="button" aria-pressed={activa}
                      onClick={() => setElegidas((l) => (activa ? l.filter((x) => x !== k.id) : [...l, k.id]))}
                      className="min-h-11 rounded-full border border-borde px-4 text-sm font-semibold hover:bg-marca-suave aria-pressed:border-marca aria-pressed:bg-marca aria-pressed:text-sobre-marca">
                      {activa ? "✓ " : ""}{k.texto}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}
          <div className="flex flex-wrap gap-2 border-t border-borde pt-4">
            <Boton type="button" onClick={() => void guardar()} disabled={guardando}>
              {guardando ? (archivo ? "Subiendo y guardando…" : "Guardando…") : elegidas.length ? "Guardar y compartir" : "Guardar en la biblioteca"}
            </Boton>
            <Boton type="button" variante="secundario" disabled={guardando}
              onClick={() => { setArchivo(null); setFotos([]); setTexto(""); setDatos({ titulo: "", nivel: "", descripcion: "" }); setPaso("elegir"); }}>
              Empezar de nuevo
            </Boton>
          </div>
        </section>
      </div>
    </div>
  );
}
