import type { Metadata } from "next";
import Link from "next/link";
import { Marca } from "@/componentes/marca";
import { institucion } from "@/config/institucion";
import { obtenerContenidoSitio } from "@/lib/sitio";

export const metadata: Metadata = {
  title: "Política de privacidad",
  description: `Cómo ${institucion.nombre} cuida los datos personales de quienes consultan, estudian y trabajan en el instituto.`,
};

// Los datos de contacto se editan desde el panel (Sitio web → Contacto).
export const dynamic = "force-dynamic";

/*
 * REVISIÓN LEGAL PENDIENTE: texto redactado según la Ley 25.326 de
 * Protección de los Datos Personales y la Disposición 10/2008 de la
 * autoridad de control. Confirmar con el instituto antes del lanzamiento:
 * razón social o titular responsable, CUIT, email de contacto y la
 * inscripción de la base en el registro de la AAIP.
 */
export default async function Privacidad() {
  const { contacto } = await obtenerContenidoSitio();
  const medios = [
    contacto.email ? `por email a ${contacto.email}` : null,
    contacto.whatsapp ? `por WhatsApp al ${contacto.whatsapp}` : null,
    contacto.direccion ? `personalmente en ${contacto.direccion}, ${institucion.localidad}` : null,
  ].filter(Boolean).join(", ");
  const h2 = "mt-8 text-lg font-bold text-marca";

  return (
    <div className="min-h-screen bg-pizarra">
      <header className="border-b border-borde bg-superficie">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/" aria-label={`${institucion.nombre}, inicio`}><Marca /></Link>
          <Link href="/" className="text-sm font-semibold text-marca hover:underline">Volver al inicio</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-10 text-[0.95rem] leading-relaxed">
        <h1 className="text-3xl font-bold tracking-tight">Política de privacidad</h1>
        <p className="mt-2 text-suave">Cómo cuida {institucion.nombre} los datos personales de quienes consultan, estudian y trabajan en el instituto.</p>

        <h2 className={h2}>Quién es responsable de los datos</h2>
        <p>{institucion.nombre}, con domicilio en {[contacto.direccion, institucion.localidad].filter(Boolean).join(", ")}, es responsable de la base de datos donde se guarda la información que se describe acá.</p>

        <h2 className={h2}>Qué datos usamos y para qué</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li><strong>Consultas desde la web:</strong> nombre, teléfono o email, y lo que nos cuentes sobre el curso que buscás. Los usamos solo para responderte y contarte sobre nuestros cursos.</li>
          <li><strong>Estudiantes y familias:</strong> datos de identificación y contacto, inscripciones, asistencia, actividades, notas, informes y pagos. Los usamos para organizar la cursada, comunicarnos con ustedes y administrar las cuotas.</li>
          <li><strong>Equipo del instituto:</strong> datos de contacto y el rol de cada persona en el sistema.</li>
        </ul>
        <p className="mt-2">No vendemos ni compartimos los datos con terceros para publicidad. Cada persona ve solo lo que le corresponde: por ejemplo, una familia ve la información de sus hijos y un docente, la de sus comisiones.</p>

        <h2 className={h2}>Si sos menor de edad</h2>
        <p>Los datos de estudiantes menores de 18 años los carga y administra su madre, padre o persona responsable, que es quien da el consentimiento.</p>

        <h2 className={h2}>Dónde se guardan</h2>
        <p>Los datos se guardan en servidores de proveedores de infraestructura informática, que pueden estar ubicados fuera de la Argentina, con conexión cifrada y acceso restringido. Esos proveedores solo los alojan: no los usan para fines propios.</p>

        <h2 className={h2}>Asistente con inteligencia artificial</h2>
        <p>Oakland AI responde con la información publicada por el instituto. Cuando usa un servicio de inteligencia artificial externo, solo se envía la pregunta escrita y textos de ayuda del instituto: nunca datos personales, notas ni pagos de nadie. Te recomendamos no escribir datos personales en el chat.</p>

        <h2 className={h2}>Cuánto tiempo los conservamos</h2>
        <p>Las consultas, mientras sigamos en contacto o hasta que pidas que las borremos. Los datos académicos y de pagos, mientras dure la relación con el instituto y el tiempo que exijan las normas contables y fiscales.</p>

        <h2 className={h2}>Tus derechos</h2>
        <p>Podés pedir gratis, en intervalos no menores a seis meses salvo que acredites un interés legítimo, el acceso a tus datos, y en cualquier momento su corrección, actualización o eliminación{medios ? `: ${medios}` : ""}. Te respondemos dentro de los plazos de la Ley 25.326 (10 días corridos para el acceso y 5 días hábiles para la corrección o eliminación).</p>
        <p className="mt-2">Brindar los datos es voluntario, pero sin los datos de contacto no podemos responder una consulta, y sin los datos del estudiante no podemos inscribirlo.</p>

        <h2 className={h2}>Autoridad de control</h2>
        <p>La Agencia de Acceso a la Información Pública, en su carácter de órgano de control de la Ley 25.326, tiene la atribución de atender las denuncias y reclamos que interpongan quienes resulten afectados en sus derechos por incumplimiento de las normas vigentes en materia de protección de datos personales.</p>

        <h2 className={h2}>Cambios</h2>
        <p>Si cambiamos esta política, publicamos la nueva versión en esta página. Las consultas enviadas guardan la versión del consentimiento que se aceptó en ese momento.</p>
      </main>
    </div>
  );
}
