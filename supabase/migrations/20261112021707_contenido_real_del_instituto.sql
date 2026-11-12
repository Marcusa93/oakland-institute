-- =====================================================================
-- 15 · Contenido real del instituto
-- 1. La landing suma secciones editables: grupos por edad, diferenciales
--    y propuestas (speaking club, refuerzo, etc.).
-- 2. El conocimiento de Oakland AI para visitantes pasa de textos de
--    ejemplo a la información que el instituto difunde (flyers e Instagram,
--    noviembre de 2026). Lo que no estaba confirmado se retira.
-- =====================================================================

alter table public.sitio_contenido drop constraint if exists sitio_contenido_clave_check;
alter table public.sitio_contenido add constraint sitio_contenido_clave_check check (clave in (
  'portada', 'grupos', 'diferenciales', 'propuestas', 'pasos', 'preguntas', 'contacto', 'anuncio', 'certificaciones'));

insert into public.documentos_ayuda (slug, titulo, contenido, audiencia, estado, aprobado_en) values
  ('quienes-somos', 'Qué es Oakland',
   'Oakland es un centro de enseñanza de la lengua inglesa en Monteros, Tucumán. Enseña inglés a chicos desde los 4 años, adolescentes y adultos, en grupos por edad y por nivel, con docentes jóvenes capacitados y especializados. Las clases tienen enfoque comunicativo, los cursos tienen certificación nacional, las aulas son climatizadas y se entrega material de estudio. Hay cursos presenciales y virtuales, con horarios por la siesta, la tarde y la noche.',
   array['visitante', 'estudiante', 'tutor', 'docente'], 'aprobado', now()),
  ('cursos-por-edad', 'Grupos por edad',
   'Kinder: 4 y 5 años. Kinder A: 6 años. Kinder B: 7 años. Kids 1: 8 años. Kids 2: 9 años. Kids starter: 10 años. Kids 4: 11 años. Teens 1: 12 años. Teens 2: 13 años. Teens 3: 14 años. Teens 4: 15 años. Para adultos hay Intensivo I e Intensivo II (principiantes e intermedios) y Avanzado I y Avanzado II. Los días y horarios de cada grupo se consultan por WhatsApp.',
   array['visitante', 'estudiante', 'tutor'], 'aprobado', now()),
  ('modalidades', 'Modalidades: presencial, virtual, grupal o individual',
   'Los cursos son presenciales en la sede de Monteros y también hay opciones virtuales. Además de los grupos, se dan clases individuales. Hay horarios por la siesta, la tarde y la noche.',
   array['visitante', 'estudiante', 'tutor'], 'aprobado', now()),
  ('nivelacion-como-es', 'Test de nivel y consultoría gratuitos',
   'El test de nivel y la consultoría son gratuitos: el instituto te atiende de forma personalizada para guiarte hacia el mejor curso para vos, tanto si querés empezar inglés, rendir un examen internacional, practicar solo speaking, reforzar vocabulario, aprender de forma individual, online o grupal, o si ya tenés conocimientos previos y no sabés a qué grupo ir. En la página hay además un test rápido de cuatro preguntas que da una orientación.',
   array['visitante', 'estudiante', 'tutor'], 'aprobado', now()),
  ('como-consultar', 'Cómo consultar o inscribirse',
   'La forma más rápida es escribir por WhatsApp al 3863 41-4937. También se puede completar el formulario de consulta de la página o ir al instituto: Leandro Aráoz 39, planta alta, Monteros, con atención presencial de lunes a viernes de 18 a 22 h. Si la consulta es para un menor, la hace una persona adulta responsable. Una consulta o preinscripción no reserva el lugar: la inscripción queda confirmada cuando el instituto lo informa.',
   array['visitante', 'tutor', 'estudiante'], 'aprobado', now()),
  ('inscripcion-requisitos', 'Qué se necesita para inscribirse',
   'Para inscribirse alcanza con una fotocopia del DNI de quien va a cursar. Si es menor de edad, la inscripción la hace una persona adulta responsable. La matrícula y la cuota son accesibles; los valores vigentes se informan por WhatsApp o en el instituto.',
   array['visitante', 'tutor', 'estudiante'], 'aprobado', now()),
  ('donde-estamos', 'Dónde está el instituto y cuándo atiende',
   'Oakland está en Leandro Aráoz 39, planta alta, en Monteros, Tucumán, frente a la plaza Bernabé Aráoz. La atención presencial es de lunes a viernes de 18 a 22 h. Por WhatsApp: 3863 41-4937. En Instagram: _oakland.english.',
   array['visitante', 'tutor', 'estudiante'], 'aprobado', now()),
  ('speaking-club', 'Speaking club',
   'El speaking club es un espacio para practicar inglés conversando sobre distintos temas en un ambiente distendido, con un cafecito. Se hace los viernes a las 16:30 y los sábados a las 17 h. Para sumarse, escribir por WhatsApp.',
   array['visitante', 'tutor', 'estudiante'], 'aprobado', now()),
  ('clases-refuerzo', 'Clases de refuerzo para exámenes',
   'Hay clases de refuerzo para preparar exámenes escritos y orales de inglés (de la escuela o la facultad): se refuerzan los contenidos para mejorar las notas. Hay horarios por la mañana y por la siesta. También se prepara para exámenes internacionales.',
   array['visitante', 'tutor', 'estudiante'], 'aprobado', now())
on conflict (slug) do update
  set titulo = excluded.titulo, contenido = excluded.contenido, audiencia = excluded.audiencia,
      estado = 'aprobado', version = public.documentos_ayuda.version + 1, actualizado_en = now();

-- Textos de ejemplo que no están confirmados por el instituto.
update public.documentos_ayuda set estado = 'retirado', actualizado_en = now()
 where slug = 'clases-abiertas-familias';
