-- =====================================================================
-- DATOS FICTICIOS DE DEMOSTRACIÓN — no usar en producción.
-- Nombres, aranceles, horarios y textos son inventados para poder recorrer
-- el sistema. Nada de esto describe al instituto real.
-- Idempotente: se puede ejecutar más de una vez.
-- Las cuentas de acceso demo se crean aparte: scripts/usuarios-demo.mjs
-- =====================================================================

insert into public.sedes (id, nombre, direccion) values
  ('00000000-0000-4000-8000-000000000001', 'Sede central (demo)', 'Dirección a definir')
on conflict (id) do nothing;

insert into public.ciclos_lectivos (id, nombre, fecha_inicio, fecha_fin, estado) values
  ('00000000-0000-4000-8000-000000000010', 'Ciclo 2027 (demo)', '2027-03-08', '2027-12-10', 'activo')
on conflict (id) do nothing;

-- Niveles sin referencia MCER: esa correspondencia la revisa y carga el instituto.
insert into public.niveles (id, codigo, nombre, orden, descripcion) values
  ('00000000-0000-4000-8000-000000000101', 'INI', 'Inicial', 1, 'Primer contacto con el idioma.'),
  ('00000000-0000-4000-8000-000000000102', 'ELE', 'Elemental', 2, 'Situaciones cotidianas simples.'),
  ('00000000-0000-4000-8000-000000000103', 'INT', 'Intermedio', 3, 'Conversación y textos de uso frecuente.'),
  ('00000000-0000-4000-8000-000000000104', 'AVA', 'Avanzado', 4, 'Uso fluido en contextos variados.')
on conflict (id) do nothing;

insert into public.cursos (id, slug, nombre, descripcion, publico, edad_minima, edad_maxima, modalidad, publicado, orden) values
  ('00000000-0000-4000-8000-000000000201', 'ninos', 'Inglés para niños',
   'Clases dinámicas con juegos, canciones y proyectos para aprender desde chicos.', 'ninos', 6, 11, 'presencial', true, 1),
  ('00000000-0000-4000-8000-000000000202', 'adolescentes', 'Inglés para adolescentes',
   'Comunicación real, acompañamiento escolar y preparación progresiva por niveles.', 'adolescentes', 12, 17, 'presencial', true, 2),
  ('00000000-0000-4000-8000-000000000203', 'adultos', 'Inglés para adultos',
   'Grupos reducidos con horarios pensados para quienes estudian o trabajan.', 'adultos', 18, null, 'mixta', true, 3),
  ('00000000-0000-4000-8000-000000000204', 'conversacion', 'Taller de conversación',
   'Curso especial breve para ganar fluidez. (Todavía no publicado.)', 'adultos', 16, null, 'presencial', false, 4)
on conflict (id) do nothing;

insert into public.aulas (id, sede_id, nombre, capacidad) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000001', 'Aula 1', 14),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000001', 'Aula 2', 12)
on conflict (id) do nothing;

insert into public.comisiones (id, curso_id, nivel_id, ciclo_id, sede_id, nombre, cupo, modalidad, estado, publicada, fecha_inicio, fecha_fin) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000101',
   '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000001', 'Niños Inicial · Lun y Mié', 12, 'presencial', 'abierta', true, '2027-03-08', '2027-12-10'),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000202', '00000000-0000-4000-8000-000000000102',
   '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000001', 'Adolescentes Elemental · Mar y Jue', 14, 'presencial', 'abierta', true, '2027-03-09', '2027-12-09'),
  ('00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000203', '00000000-0000-4000-8000-000000000103',
   '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000001', 'Adultos Intermedio · Mar y Jue noche', 2, 'mixta', 'abierta', true, '2027-03-09', '2027-12-09')
on conflict (id) do nothing;

insert into public.comision_horarios (id, comision_id, aula_id, dia_semana, hora_inicio, hora_fin, vigencia) values
  ('00000000-0000-4000-8000-000000000501', '00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000301', 1, '17:30', '18:30', '[2027-03-08,2027-12-11)'),
  ('00000000-0000-4000-8000-000000000502', '00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000301', 3, '17:30', '18:30', '[2027-03-08,2027-12-11)'),
  ('00000000-0000-4000-8000-000000000503', '00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000301', 2, '18:00', '19:30', '[2027-03-08,2027-12-11)'),
  ('00000000-0000-4000-8000-000000000504', '00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000301', 4, '18:00', '19:30', '[2027-03-08,2027-12-11)'),
  ('00000000-0000-4000-8000-000000000505', '00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000302', 2, '20:00', '21:30', '[2027-03-08,2027-12-11)'),
  ('00000000-0000-4000-8000-000000000506', '00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000000302', 4, '20:00', '21:30', '[2027-03-08,2027-12-11)')
on conflict (id) do nothing;

insert into public.conceptos (id, codigo, nombre, tipo) values
  ('00000000-0000-4000-8000-000000000601', 'MATRICULA', 'Matrícula', 'matricula'),
  ('00000000-0000-4000-8000-000000000602', 'CUOTA', 'Cuota mensual', 'cuota'),
  ('00000000-0000-4000-8000-000000000603', 'EXAMEN', 'Derecho de examen', 'derecho_examen'),
  ('00000000-0000-4000-8000-000000000604', 'MATERIAL', 'Materiales', 'material')
on conflict (id) do nothing;

-- Importes inventados.
insert into public.aranceles (id, concepto_id, ciclo_id, importe, vigente_desde) values
  ('00000000-0000-4000-8000-000000000701', '00000000-0000-4000-8000-000000000601', '00000000-0000-4000-8000-000000000010', 30000.00, '2026-11-01'),
  ('00000000-0000-4000-8000-000000000702', '00000000-0000-4000-8000-000000000602', '00000000-0000-4000-8000-000000000010', 45000.00, '2026-11-01')
on conflict (id) do nothing;

insert into public.categorias_gasto (id, nombre) values
  ('00000000-0000-4000-8000-000000000801', 'Alquiler'),
  ('00000000-0000-4000-8000-000000000802', 'Servicios'),
  ('00000000-0000-4000-8000-000000000803', 'Materiales y librería'),
  ('00000000-0000-4000-8000-000000000804', 'Mantenimiento'),
  ('00000000-0000-4000-8000-000000000805', 'Otros')
on conflict (id) do nothing;

insert into public.versiones_consentimiento (id, tipo, version, texto) values
  ('00000000-0000-4000-8000-000000000901', 'contacto_web', 1,
   'TEXTO PROVISORIO, PENDIENTE DE VALIDACIÓN LEGAL. Usaremos estos datos únicamente para responder tu consulta sobre los cursos.')
on conflict (id) do nothing;

-- Personas y estudiantes de ejemplo (sin cuentas).
insert into public.personas (id, nombres, apellidos) values
  ('00000000-0000-4000-8000-000000001001', 'Ana', 'Directora Demo'),
  ('00000000-0000-4000-8000-000000001002', 'Bruno', 'Administrador Demo'),
  ('00000000-0000-4000-8000-000000001003', 'Carla', 'Docente Demo'),
  ('00000000-0000-4000-8000-000000001004', 'Diego', 'Tutor Demo'),
  ('00000000-0000-4000-8000-000000001005', 'Emilia', 'Estudiante Menor Demo'),
  ('00000000-0000-4000-8000-000000001006', 'Fabián', 'Estudiante Adulto Demo'),
  ('00000000-0000-4000-8000-000000001007', 'Gabriela', 'Otra Familia Demo'),
  ('00000000-0000-4000-8000-000000001008', 'Hugo', 'Otro Menor Demo')
on conflict (id) do nothing;

insert into public.personas_datos (persona_id, email, telefono) values
  ('00000000-0000-4000-8000-000000001001', 'direccion@demo.invalid', null),
  ('00000000-0000-4000-8000-000000001002', 'administracion@demo.invalid', null),
  ('00000000-0000-4000-8000-000000001003', 'docente@demo.invalid', null),
  ('00000000-0000-4000-8000-000000001004', 'tutor@demo.invalid', '3810000001'),
  ('00000000-0000-4000-8000-000000001006', 'estudiante@demo.invalid', '3810000002'),
  ('00000000-0000-4000-8000-000000001007', 'otrafamilia@demo.invalid', '3810000003')
on conflict (persona_id) do nothing;

insert into public.estudiantes (id, persona_id, estado) values
  ('00000000-0000-4000-8000-000000001101', '00000000-0000-4000-8000-000000001005', 'aspirante'),
  ('00000000-0000-4000-8000-000000001102', '00000000-0000-4000-8000-000000001006', 'aspirante'),
  ('00000000-0000-4000-8000-000000001103', '00000000-0000-4000-8000-000000001008', 'aspirante')
on conflict (id) do nothing;

insert into public.comision_docentes (id, comision_id, docente_persona_id, desde) values
  ('00000000-0000-4000-8000-000000001201', '00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000001003', '2027-03-08'),
  ('00000000-0000-4000-8000-000000001202', '00000000-0000-4000-8000-000000000403', '00000000-0000-4000-8000-000000001003', '2027-03-09')
on conflict (id) do nothing;

insert into public.consultas (id, tipo, nombre_contacto, telefono, es_para_menor, nombre_estudiante, edad_estudiante, curso_interes_id, mensaje, origen)
values
  ('00000000-0000-4000-8000-000000001301', 'consulta', 'Contacto Demo Uno', '3810000010', true, 'Menor Demo', 8,
   '00000000-0000-4000-8000-000000000201', '¿Qué días cursan los de 8 años?', 'web'),
  ('00000000-0000-4000-8000-000000001302', 'preinscripcion', 'Contacto Demo Dos', '3810000011', false, null, null,
   '00000000-0000-4000-8000-000000000203', 'Quiero anotarme al turno noche.', 'web')
on conflict (id) do nothing;

-- Ayuda de la plataforma (contenido del sistema, aprobado en la carga inicial).
-- Los reglamentos y textos institucionales los carga y aprueba dirección.
insert into public.documentos_ayuda (slug, titulo, contenido, audiencia, estado, aprobado_en) values
  ('como-consultar', 'Cómo hacer una consulta o preinscripción',
   'Desde la página principal elegí el curso que te interesa y completá el formulario de consulta. Si la consulta es para un menor, la completa una persona adulta responsable. El instituto se comunica por el medio que indiques. Una consulta o preinscripción no reserva vacante: la inscripción queda confirmada recién cuando administración lo informa.',
   array['visitante', 'tutor', 'estudiante'], 'aprobado', now()),
  ('estados-de-inscripcion', 'Consulta, solicitud, reserva e inscripción confirmada',
   'Una consulta es un pedido de información. Una solicitud de inscripción indica el estudiante y la comisión elegida. Una reserva de vacante guarda un lugar por un plazo limitado. La inscripción confirmada (matrícula) es la única que asegura el lugar en la comisión y genera las obligaciones de pago.',
   array['visitante', 'tutor', 'estudiante', 'administracion', 'direccion'], 'aprobado', now()),
  ('informar-transferencia', 'Cómo informar un pago por transferencia',
   'En Cuenta, elegí Informar transferencia, indicá importe y fecha y adjuntá el comprobante. El pago queda en estado informado hasta que administración verifique la acreditación en la cuenta del instituto. Recién entonces figura como confirmado y se descuenta del saldo.',
   array['tutor', 'estudiante'], 'aprobado', now()),
  ('vinculos-familiares', 'Quién puede ver la información de un estudiante',
   'Cada persona adulta responsable tiene su propia cuenta. Para ver la información de un estudiante hace falta un vínculo verificado por administración. Los permisos son independientes: académico (cursos, asistencia y avisos), documental (documentación) y económico (cuenta y pagos). Para agregar, modificar o dar de baja un vínculo hay que pedirlo en administración.',
   array['tutor', 'estudiante', 'administracion', 'direccion'], 'aprobado', now()),
  ('tomar-asistencia', 'Cómo tomar asistencia',
   'En Mis comisiones elegí la comisión y la clase del día. Marcá presente, ausente, tarde o justificada para cada estudiante y guardá. Podés corregir la asistencia de una clase ya cargada; queda registrado quién y cuándo la modificó.',
   array['docente', 'administracion'], 'aprobado', now()),
  ('registrar-cobro', 'Cómo registrar y validar un cobro',
   'En Cobros elegí a la persona responsable de pago, indicá medio, importe y fecha, y seleccioná las obligaciones a las que se imputa. El efectivo recibido se confirma en el momento. Una transferencia se confirma solo después de verla acreditada en el banco. Un pago confirmado no se edita: si hubo un error se reversa indicando el motivo.',
   array['administracion', 'direccion'], 'aprobado', now()),
  ('tablero-indicadores', 'Cómo leer el tablero de dirección',
   'Caja muestra los cobros confirmados por fecha de pago, menos devoluciones, gastos y pagos a docentes del período. Devengado muestra las obligaciones con vencimiento en el período, netas de descuentos. Saldos pendientes y vencidos se calculan a la fecha de hoy. Es un informe de gestión interno, no un balance contable.',
   array['direccion'], 'aprobado', now())
on conflict (slug) do nothing;

-- ---------------------------------------------------------------------
-- Conocimiento de ejemplo para Oakland AI (contenido de demostración).
-- Reemplazar por los textos reales del instituto antes de producción.
-- ---------------------------------------------------------------------
insert into public.documentos_ayuda (slug, titulo, contenido, audiencia, estado, aprobado_en) values
  ('quienes-somos', 'Qué es Oakland Institute',
   'Oakland Institute es un instituto de inglés en Monteros, Tucumán. Enseñamos inglés a niños, adolescentes y adultos, en grupos armados por edad y por nivel. Las clases son prácticas y buscan que hables desde el primer día. También organizamos clases abiertas con familias, para que madres, padres y tutores vean cómo se trabaja en el aula.',
   array['visitante', 'estudiante', 'tutor', 'docente'], 'aprobado', now()),
  ('cursos-por-edad', 'Cursos por edad: niños, adolescentes y adultos',
   'Para niños de 6 a 11 años las clases usan juegos, canciones y proyectos. Para adolescentes de 12 a 17 años se trabaja la comunicación real y se acompaña lo que ven en la escuela. Para adultos hay grupos reducidos con horarios pensados para quienes estudian o trabajan, por la tarde y por la noche. Los horarios de cada grupo se ven en la sección de cursos de la página.',
   array['visitante', 'estudiante', 'tutor'], 'aprobado', now()),
  ('modalidades', 'Modalidades: presencial, virtual o mixta',
   'La mayoría de los cursos son presenciales en la sede de Monteros. Algunos grupos de adultos son mixtos: parte de las clases en el aula y parte virtual. La modalidad de cada curso figura en la oferta publicada.',
   array['visitante', 'estudiante', 'tutor'], 'aprobado', now()),
  ('nivelacion-como-es', 'Cómo es la nivelación',
   'Antes de asignarte un grupo hacemos una nivelación: una charla corta con un docente y algunos ejercicios simples. No es un examen para aprobar o desaprobar; sirve para ubicarte en el grupo donde vas a aprender mejor. Si nunca estudiaste inglés, no hace falta nivelación: empezás en el nivel inicial. En la página hay un test rápido de cuatro preguntas que da una orientación.',
   array['visitante', 'estudiante', 'tutor'], 'aprobado', now()),
  ('clases-abiertas-familias', 'Clases abiertas con familias',
   'Durante el año organizamos clases abiertas: las familias pueden entrar al aula y participar de una actividad con los chicos. Las fechas se avisan por la plataforma, en la sección Avisos.',
   array['visitante', 'tutor', 'estudiante'], 'aprobado', now()),
  ('ausencias', 'Qué hacer si vas a faltar',
   'Si vas a faltar a una clase, avisale a tu docente con anticipación. La asistencia queda registrada en la plataforma y las familias la pueden ver en Cursada. Si faltaste, pedile a tu docente lo que se trabajó y practicá con Oakland AI.',
   array['estudiante', 'tutor'], 'aprobado', now()),
  ('gramatica-present-simple', 'Present simple: cuándo y cómo se usa',
   'El present simple se usa para rutinas, hábitos y cosas que son siempre así. Ejemplos: I live in Monteros. She works at a school. We play football on Saturdays. En tercera persona del singular (he, she, it) el verbo lleva -s o -es: he plays, she watches. Para negar se usa do not o does not: I do not like coffee, he does not drive. Para preguntar: Do you speak English? Does she live here?',
   array['estudiante'], 'aprobado', now()),
  ('gramatica-past-simple', 'Past simple: hablar del pasado',
   'El past simple cuenta cosas terminadas en el pasado. Los verbos regulares agregan -ed: worked, played, visited. Los irregulares cambian: go → went, have → had, see → saw, eat → ate. Para negar y preguntar se usa did: I did not go. Did you see the match? Después de did el verbo vuelve a su forma base: Did you go? (no "did you went").',
   array['estudiante'], 'aprobado', now()),
  ('gramatica-present-perfect', 'Present perfect: experiencias y desde cuándo',
   'El present perfect se forma con have o has más el participio: I have visited Buenos Aires. She has lived here since 2019. Se usa para experiencias de vida (Have you ever been to Brazil?) y para cosas que empezaron en el pasado y siguen: I have studied English for two years. Since va con un punto de inicio (since 2019, since Monday) y for con una duración (for two years, for a week).',
   array['estudiante'], 'aprobado', now()),
  ('gramatica-condicional', 'Second conditional: situaciones imaginarias',
   'El second conditional habla de situaciones imaginarias o poco probables: If I had more time, I would travel. Se arma con if + past simple y would + verbo. Con el verbo to be se suele usar were para todas las personas: If I were you, I would study every day.',
   array['estudiante'], 'aprobado', now()),
  ('practicar-en-casa', 'Cómo practicar inglés en casa',
   'Practicá poco y seguido: quince minutos por día rinden más que dos horas una vez por semana. Escuchá canciones o series con subtítulos en inglés, anotá palabras nuevas con un ejemplo propio y repetilas en voz alta. Contale a alguien tu día en inglés, aunque sea con frases cortas. Podés pedirle a Oakland AI que te explique un tema o te dé ejemplos.',
   array['estudiante', 'tutor'], 'aprobado', now()),
  ('vocabulario-rutina', 'Vocabulario: la rutina diaria',
   'Frases útiles para contar tu día: wake up (despertarse), get up (levantarse), have breakfast (desayunar), go to work o go to school, have lunch (almorzar), do homework (hacer la tarea), go to the gym, cook dinner (cocinar la cena), watch TV, go to bed (acostarse). Ejemplo: I wake up at seven and I have breakfast with my family.',
   array['estudiante'], 'aprobado', now()),
  ('docentes-planificar-clase', 'Planificar una clase de 60 a 90 minutos',
   'Una estructura que funciona: warm-up de 5 a 10 minutos para activar (una pregunta, un juego corto); presentación del tema con ejemplos en contexto; práctica controlada (completar, ordenar, repetir); práctica libre donde usen el tema para hablar o escribir algo propio; cierre de 5 minutos para repasar y anticipar la tarea. Con niños conviene cambiar de actividad cada 10 o 15 minutos.',
   array['docente'], 'aprobado', now()),
  ('docentes-rubrica-oral', 'Rúbrica de ejemplo para producción oral',
   'Cuatro criterios con niveles de 1 a 4: fluidez (habla con pocas pausas), precisión (usa bien las estructuras del nivel), vocabulario (usa palabras variadas y adecuadas al tema) y pronunciación (se entiende con facilidad). Escribí para cada nivel una descripción observable. La IA puede sugerir una devolución con esta rúbrica, pero la nota la decide siempre el docente.',
   array['docente'], 'aprobado', now()),
  ('docentes-warm-ups', 'Ideas de warm-up para empezar la clase',
   'Two truths and a lie: cada estudiante dice tres frases y el grupo adivina cuál es falsa. Word chain: una palabra empieza con la última letra de la anterior. Find someone who: buscar compañeros que hagan ciertas cosas (Find someone who has a pet). Picture talk: describir una imagen en un minuto. Funcionan con todos los niveles cambiando la dificultad.',
   array['docente'], 'aprobado', now()),
  ('docentes-devoluciones', 'Cómo dar devoluciones que ayudan',
   'Empezá por algo que salió bien y concreto, marcá uno o dos errores importantes (no todos) con el ejemplo corregido, y cerrá con una sugerencia de práctica. Ejemplo: Muy bien la descripción de tu familia. Ojo con la tercera persona: she works, no she work. Para la próxima, practicá contar la rutina de otra persona.',
   array['docente'], 'aprobado', now())
on conflict (slug) do nothing;
