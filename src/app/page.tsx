import Image from "next/image";
import Link from "next/link";
import { FormularioConsulta } from "@/componentes/formulario-consulta";
import { Marca } from "@/componentes/marca";
import { OaklandAI } from "@/componentes/oakland-ai";
import { entorno, institucion, supabaseConfigurado } from "@/config/institucion";
import { obtenerOferta } from "@/lib/oferta";
import { enIngles, enlaceWhatsapp, obtenerContenidoSitio } from "@/lib/sitio";
import { crearClienteServidor } from "@/lib/supabase/servidor";
import { BotonOaklandAI } from "./landing/boton-ai";
import { BuscadorCursos } from "./landing/buscador-cursos";
import { ConversacionPortada } from "./landing/conversacion";
import { TestNivel } from "./landing/test-nivel";
import { TituloBilingue } from "./landing/titulo-bilingue";
import { IdiomaProvider, SelectorIdioma } from "./landing/idioma";
import { Traducible as T } from "./landing/traduccion";

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
  const { portada, pasos: PASOS, preguntas: PREGUNTAS, contacto: c, anuncio, certificaciones } = sitio;
  const whatsapp = enlaceWhatsapp(c.whatsapp);

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
            <a href="#cursos" className="hidden min-h-11 items-center whitespace-nowrap px-2 hover:text-acento md:inline-flex"><T es="Cursos" en="Courses" /></a>
            <a href="#test" className="hidden min-h-11 items-center whitespace-nowrap px-2 hover:text-acento md:inline-flex"><T es="Test de nivel" en="Level test" /></a>
            <a href="#consulta" className="latido hidden min-h-10 items-center whitespace-nowrap rounded-full bg-acento px-4 text-white lg:inline-flex"><T es="Inscripciones 2027 abiertas" en="2027 enrolment is open" /></a>
            <SelectorIdioma />
            <Link href="/ingresar" className="inline-flex min-h-11 items-center rounded-full border border-borde bg-white px-3 hover:border-marca sm:px-4"><T es="Ingresar" en="Log in" /></Link>
          </nav>
        </div>
      </header>

      <main id="contenido">
        {/* Portada: el título que se traduce solo es el momento de la página. */}
        <section className="relative overflow-hidden bg-marca">
          <div aria-hidden className="absolute -right-24 -top-24 size-[28rem] rounded-full bg-marca-fuerte" />
          <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-14 sm:pt-20 lg:grid-cols-[1.25fr_1fr] lg:items-center">
            <div>
              <p className="mb-6 text-lg font-semibold text-cielo"><T es={`Inglés en ${institucion.localidad}`} en={`English in ${institucion.localidad}`} /></p>
              {portada.titulo.es ? (
                <h1 className="font-extrabold leading-[0.95] tracking-[-0.04em] text-white [font-size:clamp(2.75rem,10vw,6.5rem)] [font-variation-settings:'opsz'_96,'wdth'_82]">
                  <T es={portada.titulo.es} en={enIngles(portada.titulo)} />
                </h1>
              ) : (
                <TituloBilingue />
              )}
              <p data-traducir className="mt-8 max-w-md text-xl text-white/85">
                <T es={portada.subtitulo.es} en={enIngles(portada.subtitulo)} />
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a href="#cursos" className="inline-flex min-h-12 items-center rounded-full bg-acento px-6 text-lg font-bold text-white hover:bg-[#a90d26]"><T es="Buscar mi curso" en="Find my course" /></a>
                <a href="#test" className="inline-flex min-h-12 items-center rounded-full bg-white/10 px-6 text-lg font-semibold text-white hover:bg-white/20"><T es="Probar mi nivel" en="Test my level" /></a>
                <BotonOaklandAI className="inline-flex min-h-12 items-center rounded-full border border-white/40 px-6 text-lg font-semibold text-white hover:bg-white/10" />
              </div>
              <p className="mt-6 max-w-sm text-sm text-white/70">
                <span className="hidden [@media(hover:hover)]:inline"><T es="Pasá el cursor sobre un título o un botón para ver su traducción, o cambiá toda la página con ES / EN."
                  en="Hover over a heading or button to see it in Spanish, or switch the whole page with ES / EN." /></span>
                <span className="[@media(hover:hover)]:hidden"><T es="Tocá un título para verlo en inglés, o mantené apretado un botón. También podés cambiar toda la página con ES / EN."
                  en="Tap a heading to see it in Spanish, or press and hold a button. You can also switch the whole page with ES / EN." /></span>
              </p>
            </div>

            <ConversacionPortada />
          </div>
        </section>

        <section id="cursos" aria-labelledby="titulo-cursos" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
          <h2 id="titulo-cursos" className="max-w-2xl text-4xl font-extrabold tracking-tight text-marca-fuerte sm:text-5xl [font-variation-settings:'opsz'_72]">
            <T es="Encontrá tu grupo en un toque" en="Find your group in one tap" />
          </h2>
          <p data-traducir className="mt-3 max-w-xl text-lg text-suave"><T es="Elegí para quién es y mirá cómo quedaría la semana." en="Choose who it's for and see what the week looks like." /></p>
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
          <div className="mx-auto grid max-w-6xl gap-10 rounded-[2.5rem] bg-white p-6 sm:p-10 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <h2 id="titulo-consulta" className="text-4xl font-extrabold tracking-tight text-marca-fuerte sm:text-5xl [font-variation-settings:'opsz'_72]"><T es="Escribinos" en="Write to us" /></h2>
              <p data-traducir className="mt-4 text-lg text-suave"><T es="Te respondemos por el medio que prefieras. Pedimos solo lo necesario para contactarte." en="We'll reply however you prefer. We only ask for what we need to reach you." /></p>
              {PREGUNTAS.length > 0 ? <div className="mt-10 divide-y divide-borde border-y border-borde">
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
            <FormularioConsulta cursos={cursos.map((x) => ({ id: x.id, nombre: x.nombre })).filter((x) => !x.id.startsWith("demo-"))} textoPrivacidad={privacidad} />
          </div>
        </section>
      </main>

      <footer className="overflow-hidden bg-marca text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-end justify-between gap-6 px-4 pt-12">
          <div className="pb-6 text-white/80">
            <p className="font-semibold text-white">{institucion.nombre}</p>
            <p>{institucion.localidad}</p>
            <p className="mt-1">{[c.direccion, c.telefono, c.email].filter(Boolean).join(" · ") || "Datos de contacto a confirmar."}</p>
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
