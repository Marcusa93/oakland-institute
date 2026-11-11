-- =====================================================================
-- Banco de ejercicios de ejemplo para la demo de la práctica gamificada.
--
-- · 67 ejercicios revisados (11 por habilidad, 12 en habla), de nivel inicial a intermedio
--   (dificultad 1 a 3). Enunciados en inglés, explicaciones en castellano.
-- · Sin nivel asignado (nivel_id null): los ve cualquier estudiante activo.
-- · Habla: por ahora con "ordenar" (frases útiles para conversar); la
--   evaluación oral queda para otra etapa.
-- · Escucha: el navegador lee audio_texto (speechSynthesis, en-US).
-- · Idempotente: no inserta un enunciado que ya exista. No borra nada.
--
-- Se carga a mano (SQL editor o psql) con un rol que salte RLS.
-- =====================================================================

insert into public.ejercicios
  (habilidad, tipo, dificultad, enunciado, opciones, respuesta, explicacion, audio_texto, estado, revisado_en)
select v.habilidad::public.habilidad, v.tipo, v.dificultad::smallint, v.enunciado, v.opciones::jsonb,
       v.respuesta, v.explicacion, v.audio_texto, 'revisado', now()
from (values
  ('vocabulario', 'opcion', 1, 'Which word is a fruit?', '["apple", "chair", "window", "shoe"]', 'apple', 'Apple es manzana; las otras palabras son objetos.', null),
  ('vocabulario', 'opcion', 1, 'The opposite of "hot" is ___.', '["cold", "warm", "tall", "fast"]', 'cold', 'Hot (caliente) y cold (frío) son opuestos.', null),
  ('vocabulario', 'opcion', 1, 'I drink ___ every morning.', '["coffee", "bread", "rice", "cheese"]', 'coffee', 'Con drink (tomar, beber) va una bebida.', null),
  ('vocabulario', 'opcion', 1, 'A person who teaches is a ___.', '["teacher", "waiter", "driver", "nurse"]', 'teacher', 'Teach (enseñar) + -er: teacher. Waiter es mozo; nurse, enfermero.', null),
  ('vocabulario', 'opcion', 1, 'Where do you buy medicine?', '["at a pharmacy", "at a bakery", "at a library", "at a gym"]', 'at a pharmacy', 'Pharmacy es farmacia. Bakery es panadería.', null),
  ('vocabulario', 'opcion', 2, 'My father''s sister is my ___.', '["aunt", "cousin", "niece", "grandmother"]', 'aunt', 'Aunt es tía. Cousin es primo o prima; niece, sobrina.', null),
  ('vocabulario', 'opcion', 2, 'You need an ___ when it rains.', '["umbrella", "oven", "pillow", "apron"]', 'umbrella', 'Umbrella es paraguas. Fijate que va con an porque empieza con sonido vocal.', null),
  ('vocabulario', 'opcion', 2, 'Choose the word that means the same as "big".', '["large", "tiny", "short", "thin"]', 'large', 'Big y large son sinónimos: grande.', null),
  ('vocabulario', 'opcion', 2, 'She is very ___: she always helps other people.', '["kind", "lazy", "rude", "boring"]', 'kind', 'Kind es amable. Rude es maleducado; lazy, vago.', null),
  ('vocabulario', 'opcion', 3, 'I''m looking ___ my keys. I can''t find them anywhere.', '["for", "at", "after", "up"]', 'for', 'Look for es buscar. Look at es mirar y look after, cuidar.', null),
  ('vocabulario', 'completar', 2, 'The month after March is ___.', '[]', 'April', 'Los meses en inglés se escriben con mayúscula: March, April, May.', null),
  ('gramatica', 'opcion', 1, 'She ___ from Argentina.', '["is", "am", "are"]', 'is', 'Con she, he e it, el verbo be es is.', null),
  ('gramatica', 'opcion', 1, 'They ___ football on Saturdays.', '["play", "plays", "playing"]', 'play', 'Con they no se agrega -s en presente simple.', null),
  ('gramatica', 'opcion', 1, 'There ___ two books on the table.', '["are", "is", "be"]', 'are', 'Para plural se usa there are; para singular, there is.', null),
  ('gramatica', 'opcion', 2, 'He ___ to work by bus every day.', '["goes", "go", "going"]', 'goes', 'En presente simple, con he/she/it el verbo lleva -s o -es: goes.', null),
  ('gramatica', 'opcion', 2, 'Last summer we ___ to the beach.', '["went", "go", "goes", "going"]', 'went', 'Last summer indica pasado: el pasado de go es went (irregular).', null),
  ('gramatica', 'opcion', 2, '___ you like pizza?', '["Do", "Does", "Are", "Is"]', 'Do', 'Para preguntar en presente simple con you se usa do.', null),
  ('gramatica', 'opcion', 2, 'Look! I ___ wearing my new shoes.', '["am", "is", "are", "do"]', 'am', 'Presente continuo: I am + verbo con -ing.', null),
  ('gramatica', 'completar', 2, 'My brother is ___ than me. (tall)', '[]', 'taller', 'Para comparar adjetivos cortos se agrega -er + than.', null),
  ('gramatica', 'opcion', 3, 'She has lived in Tucumán ___ 2015.', '["since", "for", "from", "ago"]', 'since', 'Since va con un punto de inicio (2015); for, con una duración (ten years).', null),
  ('gramatica', 'opcion', 3, 'If it rains tomorrow, we ___ at home.', '["will stay", "stayed", "would stay", "are stay"]', 'will stay', 'Primer condicional: if + presente, will + verbo.', null),
  ('gramatica', 'ordenar', 2, 'Make a question: ask someone where they live.', '["live", "do", "Where", "you"]', 'Where do you live?', 'Las preguntas en presente simple llevan do/does antes del sujeto.', null),
  ('lectura', 'opcion', 1, 'Hi! My name is Sofía. I am 15 years old and I live in Monteros with my parents and my little brother, Tomás. I go to school in the morning and I study English on Tuesdays and Thursdays. My favourite food is empanadas.

How old is Sofía?', '["She is 15.", "She is 13.", "She is 50.", "She is 5."]', 'She is 15.', 'El texto dice: I am 15 years old.', null),
  ('lectura', 'opcion', 1, 'Hi! My name is Sofía. I am 15 years old and I live in Monteros with my parents and my little brother, Tomás. I go to school in the morning and I study English on Tuesdays and Thursdays. My favourite food is empanadas.

Who is Tomás?', '["Her brother", "Her father", "Her teacher", "Her friend"]', 'Her brother', 'My little brother, Tomás: es su hermano menor.', null),
  ('lectura', 'opcion', 1, 'Hi! My name is Sofía. I am 15 years old and I live in Monteros with my parents and my little brother, Tomás. I go to school in the morning and I study English on Tuesdays and Thursdays. My favourite food is empanadas.

When does Sofía study English?', '["On Tuesdays and Thursdays", "Every day", "On weekends", "On Mondays"]', 'On Tuesdays and Thursdays', 'Lo dice al final: I study English on Tuesdays and Thursdays.', null),
  ('lectura', 'opcion', 1, 'Hi! My name is Sofía. I am 15 years old and I live in Monteros with my parents and my little brother, Tomás. I go to school in the morning and I study English on Tuesdays and Thursdays. My favourite food is empanadas.

What is her favourite food?', '["Empanadas", "Pizza", "Salad", "Tamales"]', 'Empanadas', 'My favourite food is empanadas.', null),
  ('lectura', 'opcion', 2, 'Dear Martín,
Thanks for your email. I''m having a great time in Salta. It''s sunny during the day, but it''s cold at night, so I always wear a jacket. Yesterday we visited a museum and ate tamales in the main square. Tomorrow we are going to take the Train to the Clouds. I''ll send you photos!
Love,
Cami

Where is Cami?', '["In Salta", "In Monteros", "In Buenos Aires", "In Córdoba"]', 'In Salta', 'I''m having a great time in Salta.', null),
  ('lectura', 'opcion', 2, 'Dear Martín,
Thanks for your email. I''m having a great time in Salta. It''s sunny during the day, but it''s cold at night, so I always wear a jacket. Yesterday we visited a museum and ate tamales in the main square. Tomorrow we are going to take the Train to the Clouds. I''ll send you photos!
Love,
Cami

Why does Cami always wear a jacket?', '["Because it''s cold at night", "Because it''s raining", "Because she is sick", "Because it''s sunny"]', 'Because it''s cold at night', 'So (entonces) une la causa con la consecuencia: it''s cold at night, so I always wear a jacket.', null),
  ('lectura', 'opcion', 2, 'Dear Martín,
Thanks for your email. I''m having a great time in Salta. It''s sunny during the day, but it''s cold at night, so I always wear a jacket. Yesterday we visited a museum and ate tamales in the main square. Tomorrow we are going to take the Train to the Clouds. I''ll send you photos!
Love,
Cami

What did they do yesterday?', '["They visited a museum", "They took a train", "They went to the beach", "They stayed at the hotel"]', 'They visited a museum', 'Yesterday indica pasado: we visited a museum.', null),
  ('lectura', 'opcion', 2, 'Dear Martín,
Thanks for your email. I''m having a great time in Salta. It''s sunny during the day, but it''s cold at night, so I always wear a jacket. Yesterday we visited a museum and ate tamales in the main square. Tomorrow we are going to take the Train to the Clouds. I''ll send you photos!
Love,
Cami

What are they going to do tomorrow?', '["Take a train", "Visit a museum", "Go back home", "Eat tamales"]', 'Take a train', 'Going to habla de planes: we are going to take the Train to the Clouds.', null),
  ('lectura', 'opcion', 3, 'NOTICE
The school library will be closed on Monday for cleaning. From Tuesday, it will open at 9 a.m. instead of 8 a.m. On Monday, students can still return books using the box next to the main door. Books borrowed before Friday must be returned by the 20th.

Why will the library be closed on Monday?', '["For cleaning", "For a holiday", "Because of a strike", "For a party"]', 'For cleaning', 'Closed on Monday for cleaning: cerrada por limpieza.', null),
  ('lectura', 'opcion', 3, 'NOTICE
The school library will be closed on Monday for cleaning. From Tuesday, it will open at 9 a.m. instead of 8 a.m. On Monday, students can still return books using the box next to the main door. Books borrowed before Friday must be returned by the 20th.

What time will the library open from Tuesday?', '["At 9 a.m.", "At 8 a.m.", "At 10 a.m.", "At noon"]', 'At 9 a.m.', 'Instead of significa en lugar de: abre a las 9 en lugar de las 8.', null),
  ('lectura', 'opcion', 3, 'NOTICE
The school library will be closed on Monday for cleaning. From Tuesday, it will open at 9 a.m. instead of 8 a.m. On Monday, students can still return books using the box next to the main door. Books borrowed before Friday must be returned by the 20th.

How can students return books on Monday?', '["Using the box next to the main door", "Sending them by post", "Giving them to a teacher", "They can''t return books"]', 'Using the box next to the main door', 'Students can still return books using the box next to the main door.', null),
  ('escucha', 'escuchar', 1, 'Where is Peter from?', '["Canada", "Australia", "Spain", "Mexico"]', 'Canada', 'I''m from Canada: soy de Canadá.', 'Hello, my name is Peter and I''m from Canada.'),
  ('escucha', 'escuchar', 1, 'How many cats does the speaker have?', '["Two", "One", "Three", "None"]', 'Two', 'Two cats and a dog: dos gatos y un perro.', 'I have two cats and a dog.'),
  ('escucha', 'escuchar', 1, 'What time does the bus leave?', '["At 7:30", "At 7:00", "At 6:30", "At 7:15"]', 'At 7:30', 'Half past seven son las siete y media.', 'The bus leaves at half past seven.'),
  ('escucha', 'escuchar', 1, 'What does the person want?', '["A glass of water", "A cup of coffee", "A sandwich", "The bill"]', 'A glass of water', 'Can I have…? es una forma amable de pedir algo.', 'Can I have a glass of water, please?'),
  ('escucha', 'escuchar', 2, 'What''s the weather like?', '["Rainy", "Sunny", "Snowy", "Windy"]', 'Rainy', 'It''s raining: está lloviendo.', 'It''s raining, so don''t forget your umbrella.'),
  ('escucha', 'escuchar', 2, 'When does the speaker''s sister work?', '["At night", "In the morning", "Only on weekends", "In the afternoon"]', 'At night', 'She works at the hospital at night.', 'My sister is a nurse. She works at the hospital at night.'),
  ('escucha', 'escuchar', 2, 'Where do you turn left?', '["At the bank", "At the pharmacy", "At the school", "At the park"]', 'At the bank', 'Turn left at the bank: doblá a la izquierda en el banco.', 'Go straight on and turn left at the bank. The pharmacy is on your right.'),
  ('escucha', 'escuchar', 2, 'When is the meeting?', '["On Friday at eight", "On Thursday at eight", "On Friday at nine", "On Saturday at eight"]', 'On Friday at eight', 'On Friday at eight: el viernes a las ocho.', 'Let''s meet on Friday at eight, at the café near the square.'),
  ('escucha', 'escuchar', 3, 'Why can''t the speaker come to class?', '["Because of a headache", "Because the bus was late", "Because of a holiday", "Because of work"]', 'Because of a headache', 'Headache es dolor de cabeza.', 'Sorry, I can''t come to class today. I''ve got a terrible headache.'),
  ('escucha', 'escuchar', 3, 'How much did they pay?', '["Twenty dollars", "Twenty-five dollars", "Five dollars", "Forty-five dollars"]', 'Twenty dollars', 'Costaban veinticinco, pero con el descuento pagaron veinte (twenty).', 'The tickets were twenty-five dollars, but we got a discount, so we only paid twenty.'),
  ('escucha', 'escuchar', 3, 'What does the speaker ask for?', '["To speak more slowly", "To speak louder", "To repeat the name", "To write it down"]', 'To speak more slowly', 'More slowly: más despacio. Es una frase muy útil para pedir ayuda.', 'Could you speak more slowly, please? I''m still learning English.'),
  ('escritura', 'completar', 1, 'My name ___ Lucía.', '[]', 'is', 'Con my name (it) el verbo be es is.', null),
  ('escritura', 'completar', 1, 'Write the number in words: 12 = ___', '[]', 'twelve', 'Doce en inglés se escribe twelve.', null),
  ('escritura', 'completar', 1, '___ you speak English? Yes, I can.', '[]', 'Can', 'La respuesta Yes, I can indica que la pregunta empieza con can.', null),
  ('escritura', 'completar', 2, 'Write the plural: one child, two ___.', '[]', 'children', 'Child tiene plural irregular: children.', null),
  ('escritura', 'completar', 2, 'Yesterday I ___ pizza with my friends. (eat)', '[]', 'ate', 'El pasado de eat es irregular: ate.', null),
  ('escritura', 'completar', 2, 'We ___ English right now. (study)', '[]', 'are studying', 'Right now pide presente continuo: are + studying.', null),
  ('escritura', 'completar', 2, 'There isn''t ___ milk in the fridge. (some / any)', '[]', 'any', 'En oraciones negativas se usa any.', null),
  ('escritura', 'completar', 2, 'I have lived here ___ ten years.', '[]', 'for', 'For va con una duración: for ten years.', null),
  ('escritura', 'completar', 3, 'Complete: go, went, ___ (past participle)', '[]', 'gone', 'Go es irregular: go, went, gone.', null),
  ('escritura', 'completar', 3, 'This is the ___ day of my life! (good)', '[]', 'best', 'El superlativo de good es irregular: the best.', null),
  ('escritura', 'completar', 3, 'Dear Ms. Pérez, I am writing ___ ask about the English course.', '[]', 'to', 'I am writing to + verbo: es la forma habitual de empezar un email formal.', null),
  ('habla', 'ordenar', 1, 'Greet someone and ask how they are.', '["how", "are", "you", "Hi"]', 'Hi, how are you?', 'Un saludo informal y amable para empezar una conversación.', null),
  ('habla', 'ordenar', 1, 'Ask someone''s name.', '["name", "What''s", "your"]', 'What''s your name?', 'What''s es la forma corta de what is.', null),
  ('habla', 'ordenar', 1, 'Introduce yourself.', '["Ana", "is", "My", "name"]', 'My name is Ana.', 'Para presentarte: my name is… o I''m…', null),
  ('habla', 'ordenar', 1, 'Answer politely when someone says "Nice to meet you".', '["to", "meet", "Nice", "too", "you"]', 'Nice to meet you too.', 'Too al final significa también.', null),
  ('habla', 'ordenar', 2, 'Ask for the bill at a restaurant.', '["we", "have", "please", "the", "bill", "Could"]', 'Could we have the bill, please?', 'Could we have…? es más amable que give me.', null),
  ('habla', 'ordenar', 2, 'Ask someone to say it again.', '["repeat", "please", "you", "Sorry", "that", "can"]', 'Sorry, can you repeat that, please?', 'Pedir que repitan es normal: es una de las frases más útiles.', null),
  ('habla', 'ordenar', 2, 'Ask for directions to the bus station.', '["the", "I", "get", "bus", "to", "station", "do", "How"]', 'How do I get to the bus station?', 'How do I get to…? sirve para preguntar cómo llegar a cualquier lugar.', null),
  ('habla', 'ordenar', 2, 'Order a drink at a café.', '["would", "of", "a", "please", "tea", "I", "cup", "like"]', 'I would like a cup of tea, please.', 'I would like (o I''d like) es la forma cortés de pedir.', null),
  ('habla', 'ordenar', 2, 'Say that you don''t understand.', '["I", "understand", "don''t", "Sorry"]', 'Sorry, I don''t understand.', 'Don''t es la forma corta de do not.', null),
  ('habla', 'ordenar', 3, 'Suggest a plan to a friend.', '["don''t", "go", "we", "tonight", "cinema", "to", "Why", "the"]', 'Why don''t we go to the cinema tonight?', 'Why don''t we…? sirve para proponer un plan.', null),
  ('habla', 'ordenar', 3, 'Ask a friend about their weekend.', '["What", "you", "did", "weekend", "last", "do"]', 'What did you do last weekend?', 'Para preguntar por el pasado se usa did + verbo en forma base.', null),
  ('habla', 'ordenar', 3, 'Tell someone you have the same opinion.', '["I", "with", "agree", "you"]', 'I agree with you.', 'Agree with someone: estar de acuerdo con alguien. No se dice I am agree.', null)
) as v (habilidad, tipo, dificultad, enunciado, opciones, respuesta, explicacion, audio_texto)
where not exists (select 1 from public.ejercicios e where e.enunciado = v.enunciado);
