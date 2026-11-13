import Image from "next/image";
import Link from "next/link";
import { FormularioConsulta } from "@/componentes/formulario-consulta";
import { Marca } from "@/componentes/marca";
import { OaklandAI } from "@/componentes/oakland-ai";
import { entorno, institucion, supabaseConfigurado } from "@/config/institucion";
import { obtenerOferta } from "@/lib/oferta";
import { enIngles, enlaceMapa, enlaceWhatsapp, obtenerContenidoSitio } from "@/lib/sitio";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { BotonOaklandAI } from "./landing/boton-ai";
import { BuscadorCursos } from "./landing/buscador-cursos";
import { ConversacionPortada } from "./landing/conversacion";
import { EscaleraGrupos } from "./landing/escalera";
import { TestNivel } from "./landing/test-nivel";
import { TituloBilingue } from "./landing/titulo-bilingue";
import { IdiomaProvider, SelectorIdioma } from "./landing/idioma";
import { Traducible as T } from "./landing/traduccion";
import { BotonInstalar } from "@/componentes/instalar-app";

// La oferta se administra desde el panel: se lee en cada visita, no al compilar.
export const dynamic = "force-dynamic";

async function textoPrivacidad() {
  const provisorio = "Acepto que usen estos datos únicamente para responder mi consulta.";
  if (!supabaseConfigurado()) return provisorio;
  try {
    const supabase = await crearClienteServidor();
    const { data } = await supabase.from("versiones_consentimiento").select("texto").eq("tipo", "contacto_web").order("version", { ascending: false }).limit(1).maybeSingle();
    return data?.texto ?? provisorio;
  } catch {
    return provisorio;
  }
}

export default async function Landing() {
  const [{ cursos, origen }, privacidad, sitio] = await Promise.all([obtenerOferta(), textoPrivacidad(), obtenerContenidoSitio()]);
  // Textos editables desde el panel (Sitio web); si no hay nada cargado, los de siempre.
  const { portada, pasos: PASOS, preguntas: PREGUNTAS, contacto: c, anuncio, certificaciones, grupos, diferenciales, propuestas } = sitio;
  const whatsapp = enlaceWhatsapp(c.whatsapp);
  const whatsappConsulta = enlaceWhatsapp(c.whatsapp, "¡Hola Oakland! Quiero consultar por los cursos de inglés.");
  const mapa = enlaceMapa(c.direccion);
  const instagram = c.redes.find((r) => /instagram/i.test(r.nombre));
  const pista = (
    <>
      <span className="hidden [@media(hover:hover)]:inline"><T es="Pasá el cursor sobre un título o un botón para verlo en inglés."
        en="Hover over a heading or button to see it in Spanish." /></span>
      <span className="[@media(hover:hover)]:hidden"><T es="Tocá un título para verlo en inglés, o mantené apretado un botón."
        en="Tap a heading to see it in Spanish, or press and hold a button." /></span>
    </>
  );

  return (
    <IdiomaProvider>
    <div className="bg-pizarra">
      {entorno() !== "produccion" ? (
        <p className="bg-alerta-suave px-4 py-1.5 text-center text-xs font-medium text-alerta">
          Sitio en preparación: textos y datos de contacto provisorios.
          {origen === "demo" ? " La oferta que ves es de ejemplo." : ""}
        </p>
      ) : null}

      {anuncio.activo && anuncio.texto.es ? (
        <aside aria-label="Anuncio" className="bg-acento px-4 py-2 text-center text-sm font-semibold text-white">
          <span data-traducir><T es={anuncio.texto.es} en={enIngles(anuncio.texto)} /></span>
          {anuncio.enlace ? (
            <>
              {" "}
              <a href={anuncio.enlace} className="inline-flex min-h-8 items-center underline underline-offset-4 hover:no-underline"
                {...(/^https?:/i.test(anuncio.enlace) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
                <T es={anuncio.textoEnlace.es || "Ver más"} en={anuncio.textoEnlace.en || (anuncio.textoEnlace.es ? anuncio.textoEnlace.es : "Learn more")} />
              </a>
            </>
          ) : null}
        </aside>
      ) : null}

      <header className="sticky top-0 z-30 border-b border-borde/70 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
          <Link href="/" aria-label={`${institucion.nombre}, inicio`}><Marca /></Link>
          <nav aria-label="Principal" className="flex items-center gap-1.5 text-sm font-semibold sm:gap-4">
            <a href="#cursos" className="hidden min-h-11 items-center whitespace-nowrap px-2 hover:text-acento xl:inline-flex"><T es="Horarios" en="Schedules" /></a>
            <a href="#test" className="hidden min-h-11 items-center whitespace-nowrap px-2 hover:text-acento md:inline-flex"><T es="Test de nivel" en="Level test" /></a>
            <a href="#grupos" className="hidden min-h-11 items-center whitespace-nowrap px-2 hover:text-acento md:inline-flex"><T es="Grupos" en="Groups" /></a>
            {whatsappConsulta ? (
              <a href={whatsappConsulta} target="_blank" rel="noopener noreferrer" className="latido hidden min-h-10 items-center gap-2 whitespace-nowrap rounded-full bg-acento px-4 text-white lg:inline-flex">
                <T es="Escribinos por WhatsApp" en="Message us on WhatsApp" />
              </a>
            ) : (
              <a href="#consulta" className="latido hidden min-h-10 items-center whitespace-nowrap rounded-full bg-acento px-4 text-white lg:inline-flex"><T es="Hacé tu consulta" en="Ask us" /></a>
            )}
            <SelectorIdioma />
            <BotonInstalar />
            <Link href="/ingresar" className="inline-flex min-h-11 items-center rounded-full border border-borde bg-white px-3 hover:border-marca sm:px-4"><T es="Ingresar" en="Log in" /></Link>
          </nav>
        </div>
      </header>

      <main id="contenido">
        {/* Portada: el título que se traduce solo es el momento de la página. */}
        <section className="renglones relative overflow-hidden bg-marca [--renglon:3.25rem] lg:[--renglon:4rem]">
          {/* El margen rojo de la hoja: justo a la izquierda del contenido. */}
          <div aria-hidden className="margen-cuaderno hidden opacity-80 sm:block" style={{ left: "max(1.25rem, calc(50% - 36rem - 1rem))" }} />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-14 sm:px-12 sm:pt-20 lg:grid-cols-[1.2fr_1fr] lg:items-center xl:px-4">
            <div>
              <p className="mb-6 inline-flex items-center gap-2 text-lg font-semibold text-cielo">
                <span aria-hidden className="h-0.5 w-8 rounded-full bg-acento" />
                <T es={`Inglés en ${institucion.localidad}`} en={`English in ${institucion.localidad}`} />
              </p>
              {portada.titulo.es ? (
                <>
                  <h1 className="font-extrabold leading-[0.95] tracking-[-0.04em] text-white [font-size:clamp(2.75rem,10vw,6.5rem)] [font-variation-settings:'opsz'_96,'wdth'_82]">
                    <T es={portada.titulo.es} en={enIngles(portada.titulo)} />
                  </h1>
                  <p className="mt-6 max-w-sm text-sm text-white/70">{pista}</p>
                </>
              ) : (
                <TituloBilingue>{pista}</TituloBilingue>
              )}
              <p data-traducir className="mt-8 max-w-md text-xl text-white/85">
                <T es={portada.subtitulo.es} en={enIngles(portada.subtitulo)} />
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#grupos" className="inline-flex min-h-13 items-center rounded-full bg-acento px-7 text-lg font-bold text-white shadow-[0_10px_30px_-10px_rgb(200_16_46/0.8)] transition-transform hover:-translate-y-0.5 hover:bg-[#a90d26] motion-reduce:transition-none"><T es="Buscar mi curso" en="Find my course" /></a>
                <a href="#test" className="inline-flex min-h-13 items-center rounded-full border-2 border-white/30 px-7 text-lg font-semibold text-white transition-colors hover:border-white hover:bg-white/10"><T es="Probar mi nivel" en="Test my level" /></a>
              </div>
              <BotonOaklandAI conIcono className="mt-5 inline-flex min-h-11 items-center gap-2.5 rounded-full py-1 pr-3 text-base font-semibold text-white/85 underline-offset-4 hover:text-white hover:underline" />
            </div>

            <ConversacionPortada />
          </div>
        </section>

        {grupos.length ? <EscaleraGrupos tramos={grupos} diferenciales={diferenciales} /> : null}

        <section id="cursos" aria-labelledby="titulo-cursos" className={`mx-auto max-w-6xl scroll-mt-20 px-4 pb-20 ${grupos.length ? "pt-4" : "pt-20"}`}>
          <h2 id="titulo-cursos" className="max-w-2xl text-4xl font-extrabold tracking-tight text-marca-fuerte sm:text-5xl [font-variation-settings:'opsz'_72]">
            <T es="Mirá cómo quedaría tu semana" en="See what your week would look like" />
          </h2>
          <p data-traducir className="mt-3 max-w-xl text-lg text-suave"><T es="Elegí para quién es y te mostramos días y horarios." en="Choose who it's for and we'll show you days and times." /></p>
          <div className="mt-10">
            {cursos.length === 0 ? (
              <div className="rounded-[2.25rem] bg-white p-8">
                <p className="text-xl font-bold">{origen === "error" ? "No pudimos cargar los cursos en este momento." : "Estamos armando los grupos del próximo ciclo."}</p>
                <p className="mt-2 text-suave">Dejanos tu <a className="font-semibold text-marca underline" href="#consulta">consulta</a> y te avisamos cuando estén los horarios.</p>
              </div>
            ) : (
              <BuscadorCursos cursos={cursos} />
            )}
          </div>
        </section>

        <section id="test" aria-labelledby="titulo-test" className="scroll-mt-20 bg-marca-fuerte">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 lg:grid-cols-[1fr_1.3fr] lg:items-center">
            <div className="text-white">
              <h2 id="titulo-test" className="text-4xl font-extrabold tracking-tight sm:text-5xl [font-variation-settings:'opsz'_72]"><T es="¿Cuánto inglés sabés?" en="How much English do you know?" /></h2>
              <p data-traducir className="mt-4 max-w-md text-xl text-white/80"><T es="Cuatro frases para completar. Treinta segundos. Sin registrarte." en="Four sentences to complete. Thirty seconds. No sign-up." /></p>
              <div className="mt-10 hidden items-end gap-5 lg:flex">
                <Image src="/fotos/docente.png" alt="Docente del instituto en el aula" width={335} height={597} sizes="160px"
                  className="h-64 w-auto rounded-[1.75rem] object-cover" />
                <p className="globo globo-izq mb-16 max-w-[14rem] bg-white px-5 py-4 font-semibold text-marca-fuerte">
                  <T es="Después lo vemos juntos en la nivelación." en="Then we'll look at it together in the placement test." />
                </p>
              </div>
            </div>
            <TestNivel />
          </div>
        </section>

        {propuestas.length ? (
          <section id="propuestas" aria-labelledby="titulo-propuestas" className="mx-auto max-w-6xl scroll-mt-20 px-4 pt-20">
            <h2 id="titulo-propuestas" className="text-4xl font-extrabold tracking-tight text-marca-fuerte sm:text-5xl [font-variation-settings:'opsz'_72]"><T es="Además de los cursos" en="Beyond the courses" /></h2>
            <ul className="mt-12 grid gap-x-10 gap-y-12 md:grid-cols-2">
              {propuestas.map((p, i) => (
                <li key={`${i}-${p.pregunta.es}`} className="flex flex-col gap-5">
                  <p className="globo globo-izq w-fit max-w-[90%] bg-white px-5 py-3 text-lg font-bold text-marca-fuerte ring-1 ring-borde">
                    <T es={p.pregunta.es} en={enIngles(p.pregunta)} />
                  </p>
                  <div className="globo globo-der ml-auto w-fit max-w-[92%] bg-marca px-5 py-4 text-white">
                    <p data-traducir><T es={p.respuesta.es} en={enIngles(p.respuesta)} /></p>
                    {p.cuando.es ? (
                      <p data-traducir className="mt-3 inline-flex rounded-full bg-cielo px-3 py-1 text-sm font-bold text-marca-fuerte"><T es={p.cuando.es} en={enIngles(p.cuando)} /></p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="titulo-pasos" className="mx-auto max-w-6xl px-4 py-20">
          <h2 id="titulo-pasos" className="text-4xl font-extrabold tracking-tight text-marca-fuerte sm:text-5xl [font-variation-settings:'opsz'_72]"><T es="Cómo es empezar" en="How getting started works" /></h2>
          <ol className="relative mt-12 grid gap-10 md:grid-cols-4 md:gap-6">
            <div aria-hidden className="absolute left-6 top-6 hidden h-1 w-[calc(100%-3rem)] rounded-full bg-cielo md:block" />
            {PASOS.map(({ titulo: tp, texto: tx }, i) => (
              <li key={`${i}-${tp.es}`} className="relative flex gap-4 md:block">
                <span className={`relative z-10 grid size-12 shrink-0 place-items-center rounded-full text-xl font-extrabold ${i === PASOS.length - 1 ? "bg-acento text-white" : "bg-marca text-white"}`}>{i + 1}</span>
                <div className="md:mt-5">
                  <h3 className="text-xl font-bold"><T es={tp.es} en={enIngles(tp)} /></h3>
                  <p className="mt-1 text-suave"><T es={tx.es} en={enIngles(tx)} /></p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* Solo las certificaciones que el instituto efectivamente ofrece (se cargan desde el panel). */}
        {certificaciones.length > 0 ? (
          <section aria-labelledby="titulo-certificaciones" className="mx-auto max-w-6xl px-4 pb-20">
            <h2 id="titulo-certificaciones" className="text-4xl font-extrabold tracking-tight text-marca-fuerte sm:text-5xl [font-variation-settings:'opsz'_72]"><T es="Certificaciones" en="Certifications" /></h2>
            <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {certificaciones.map((k, i) => (
                <li key={`${i}-${k.nombre.es}`} className="rounded-[1.75rem] bg-white p-6">
                  <h3 className="text-xl font-bold text-marca-fuerte"><T es={k.nombre.es} en={enIngles(k.nombre)} /></h3>
                  {k.descripcion.es ? <p data-traducir className="mt-2 text-suave"><T es={k.descripcion.es} en={enIngles(k.descripcion)} /></p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section id="consulta" aria-labelledby="titulo-consulta" className="scroll-mt-20 px-4 pb-20">
          <div className="renglones relative mx-auto grid max-w-6xl gap-10 overflow-hidden rounded-[2.5rem] bg-white py-8 pl-10 pr-6 shadow-[0_30px_80px_-40px_rgb(19_29_79/0.35)] [--linea:#e9eef8] sm:[--linea:#e3eaf7] [--renglon:2.25rem] sm:py-12 sm:pl-20 sm:pr-10 lg:grid-cols-[1fr_1.4fr]">
            <div aria-hidden className="margen-cuaderno left-6 opacity-60 sm:left-12" />
            <div className="relative">
              <h2 id="titulo-consulta" className="text-4xl font-extrabold tracking-tight text-marca-fuerte sm:text-5xl [font-variation-settings:'opsz'_72]"><T es="Escribinos" en="Write to us" /></h2>
              <p data-traducir className="mt-4 text-lg text-suave"><T es="La forma más rápida es WhatsApp. También podés dejarnos tu consulta acá o pasar por el instituto." en="WhatsApp is the fastest way. You can also leave your question here or drop by." /></p>
              {whatsappConsulta ? (
                <a href={whatsappConsulta} target="_blank" rel="noopener noreferrer"
                  className="mt-6 flex min-h-14 items-center gap-3 rounded-full bg-[#1f7a4d] py-2 pl-2 pr-6 text-white shadow-[0_12px_30px_-12px_rgb(31_122_77/0.8)] transition-transform hover:-translate-y-0.5 hover:bg-[#17603c] motion-reduce:transition-none">
                  <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-white/15">
                    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.6-.3Z" /></svg>
                  </span>
                  <span className="leading-tight">
                    <span className="block font-bold"><T es="Escribinos por WhatsApp" en="Message us on WhatsApp" /></span>
                    <span className="block text-sm text-white/85">{c.whatsapp.replace(/^\+54\s?9\s?/, "")}</span>
                  </span>
                </a>
              ) : null}
              {c.direccion || c.horario.es ? (
                <dl className="mt-6 space-y-3 text-base">
                  {c.direccion ? (
                    <div>
                      <dt className="text-sm font-semibold text-suave"><T es="Dónde estamos" en="Where we are" /></dt>
                      <dd className="font-semibold">
                        {c.direccion}, {institucion.localidad}
                        {mapa ? <> · <a href={mapa} target="_blank" rel="noopener noreferrer" className="text-marca underline underline-offset-4 hover:no-underline"><T es="Cómo llegar" en="Directions" /></a></> : null}
                      </dd>
                    </div>
                  ) : null}
                  {c.horario.es ? (
                    <div>
                      <dt className="text-sm font-semibold text-suave"><T es="Atención presencial" en="Office hours" /></dt>
                      <dd className="font-semibold"><T es={c.horario.es} en={enIngles(c.horario)} /></dd>
                    </div>
                  ) : null}
                  {instagram ? (
                    <div>
                      <dt className="text-sm font-semibold text-suave">Instagram</dt>
                      <dd><a href={instagram.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-marca underline underline-offset-4 hover:no-underline">@{instagram.url.replace(/\/$/, "").split("/").pop()}</a></dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}
              {PREGUNTAS.length > 0 ? <div className="mt-10">
                {PREGUNTAS.map(({ pregunta: p, respuesta: r }, i) => (
                  <details key={`${i}-${p.es}`} className="group py-1">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 font-semibold">
                      <T es={p.es} en={enIngles(p)} />
                      <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-pizarra text-marca transition-transform group-open:rotate-45">+</span>
                    </summary>
                    <p data-traducir className="pb-4 text-suave"><T es={r.es} en={enIngles(r)} /></p>
                  </details>
                ))}
              </div> : null}
            </div>
            <div className="relative"><FormularioConsulta cursos={cursos.map((x) => ({ id: x.id, nombre: x.nombre })).filter((x) => !x.id.startsWith("demo-"))} textoPrivacidad={privacidad} /></div>
          </div>
        </section>
      </main>

      <footer className="overflow-hidden bg-marca text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-6 px-4 pt-12">
          <div className="pb-6 text-white/80">
            <p className="font-semibold text-white">{institucion.nombre}</p>
            <p>{institucion.localidad}</p>
            <p className="mt-1">{[c.direccion, c.telefono, c.email].filter(Boolean).join(" · ") || "Datos de contacto a confirmar."}</p>
            {c.horario.es ? <p className="mt-1"><T es={`Atención: ${c.horario.es}`} en={`Office hours: ${enIngles(c.horario)}`} /></p> : null}
            {whatsapp || c.redes.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {whatsapp ? <li><a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-cielo hover:underline">WhatsApp</a></li> : null}
                {c.redes.map((r) => (
                  <li key={r.url}><a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center font-semibold text-cielo hover:underline">{r.nombre}</a></li>
                ))}
              </ul>
            ) : null}
          </div>
          <Link href="/ingresar" className="mb-6 font-semibold text-cielo hover:underline"><T es="Acceso para alumnos, familias y docentes" en="Login for students, families and teachers" /></Link>
        </div>
        <p aria-hidden className="mx-auto -mb-[0.22em] max-w-6xl select-none px-4 text-[clamp(5rem,22vw,17rem)] font-extrabold italic leading-none tracking-[-0.06em] text-acento">
          Oakland
        </p>
      </footer>
      <OaklandAI perfil="visitante" ejemplo={entorno() !== "produccion"} enlaceContacto="#consulta" />
    </div>
    </IdiomaProvider>
  );
}
