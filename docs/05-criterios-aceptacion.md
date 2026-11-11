# 05 · Criterios de aceptación — Etapa 1

Cada criterio dice **cómo se verifica**. Los marcados ✅ tienen una prueba automática que hoy pasa (`pnpm test`); los 🟡 necesitan un proyecto de Supabase conectado para verificarse en la aplicación en ejecución.

Las pruebas de base (`tests/db`) levantan un PostgreSQL real, aplican las migraciones del repositorio y actúan con la identidad de cada rol igual que lo hace la API (rol `authenticated` + claims). Cubren políticas y funciones SQL; **no** cubren los servicios de Supabase (Auth, API REST, Storage) ni las pantallas.

## A. Aislamiento entre familias — `tests/db/aislamiento.test.ts`

| # | Criterio | Estado |
|---|---|---|
| A1 | Un responsable ve únicamente a los estudiantes con los que tiene vínculo verificado | ✅ |
| A2 | No puede leer personas, datos sensibles, matrículas, obligaciones, saldos, documentos, vínculos ni observaciones de otra familia | ✅ |
| A3 | En Storage solo puede leer archivos de sus estudiantes | ✅ (política SQL) · 🟡 (servicio real) |
| A4 | De las observaciones, ve solo las marcadas para la familia | ✅ |
| A5 | Los permisos del vínculo son independientes: sin permiso económico no ve la cuenta; sin documental, ni documentos ni datos sensibles | ✅ |
| A6 | Sin sesión no se lee ninguna tabla de personas ni de gestión | ✅ |
| A7 | Una cuenta suspendida pierde todos sus accesos | ✅ |

## B. Límites de acceso docente — `tests/db/aislamiento.test.ts`

| # | Criterio | Estado |
|---|---|---|
| B1 | Ve a los estudiantes de sus comisiones y no a los de otras | ✅ |
| B2 | No accede a obligaciones, saldos, pagos, imputaciones, gastos, aranceles, beneficios, ajustes ni pagos a docentes | ✅ |
| B3 | No ve datos sensibles, vínculos familiares ni documentación (tabla y Storage) | ✅ |
| B4 | Ve observaciones para docentes y familia; no las internas de gestión | ✅ |
| B5 | Registra asistencia en su comisión; se rechaza en una comisión ajena y con una matrícula que no es de la clase | ✅ |
| B6 | Pierde el acceso al estudiante cuando se le da de baja | ✅ |
| B7 | No puede ejecutar operaciones de gestión (inscribir, cobrar) ni ver el tablero | ✅ |
| B8 | No puede enviar avisos económicos, institucionales, a comisiones ajenas ni individuales a personas fuera de sus comisiones | ✅ |
| B9 | Un docente sin comisiones no ve estudiantes | ✅ |
| B10 | De la matrícula ve la parte académica; no quién paga ni las condiciones económicas (`matriculas_pago`) | ✅ |
| B11 | Clases y docentes de una comisión solo los ven quienes participan de ella | ✅ |

## C. Vínculos y roles — `tests/db/aislamiento.test.ts`

| # | Criterio | Estado |
|---|---|---|
| C1 | Un vínculo invitado o aceptado no da acceso; recién al verificarlo administración | ✅ |
| C2 | La revocación corta el acceso en la consulta siguiente (estudiante, matrículas, persona) | ✅ |
| C3 | La revocación conserva quién, cuándo y por qué, y queda en auditoría | ✅ |
| C4 | Un vínculo revocado no se reactiva | ✅ |
| C5 | Nadie puede crear, verificar ni modificar sus propios vínculos, ni aceptar una invitación ajena | ✅ |
| C6 | Nadie puede asignarse roles; administración tampoco puede otorgarse dirección | ✅ |
| C7 | Al revocar un rol de personal, el acceso asociado desaparece | ✅ |
| C8 | Los perfiles efectivos salen de tablas, no de metadatos editables | ✅ |

## D. Cupos e inscripciones — `tests/db/operaciones.test.ts`

| # | Criterio | Estado |
|---|---|---|
| D1 | 20 confirmaciones simultáneas sobre 5 lugares: entran exactamente 5 y las otras 15 reciben "sin cupo" | ✅ |
| D2 | Reservas y confirmaciones simultáneas comparten el mismo cupo | ✅ |
| D3 | Una reserva vigente guarda el lugar; al confirmar se convierte; vencida, lo libera | ✅ |
| D4 | No hay doble inscripción ni escritura directa de matrículas | ✅ |
| D5 | Consulta, solicitud y matrícula son registros distintos; la confirmación cierra solicitud y consulta y deja historial | ✅ |
| D6 | El visitante no puede fijar campos de seguimiento ni leer consultas; hay límite de envíos repetidos | ✅ |
| D7 | El cambio de comisión controla cupo, no deja nada a medias si falla y encadena las matrículas | ✅ |
| D9 | Gestión da de alta persona y estudiante con su propia sesión; el documento duplicado se rechaza; cancelar una reserva libera el lugar | ✅ |
| D8 | Se rechazan horarios superpuestos en la misma aula y docentes en dos comisiones a la vez | ✅ |

## E. Cuenta corriente y pagos — `tests/db/operaciones.test.ts`

| # | Criterio | Estado |
|---|---|---|
| E1 | Una obligación admite pagos parciales; su estado pasa por pendiente → parcial → pagada según el saldo | ✅ |
| E2 | No se imputa más que el saldo de la obligación ni más que lo disponible del pago; el excedente queda como saldo a favor | ✅ |
| E3 | Imputaciones simultáneas del mismo pago no superan su importe | ✅ |
| E4 | Un pago cubre varias obligaciones en una operación atómica (si una imputación falla, no queda nada) | ✅ |
| E5 | Una transferencia con comprobante queda "informada": no reduce saldo ni se puede imputar hasta que gestión la valida; el responsable no puede validarse | ✅ |
| E6 | Un pago confirmado no se edita ni se borra; se reversa con motivo, restituye el saldo y queda auditado | ✅ |
| E7 | Un aumento de arancel no modifica obligaciones ya generadas; el arancel no se edita, se reemplaza | ✅ |
| E8 | Solo dirección fija precios y aprueba beneficios; el descuento queda explícito en la obligación | ✅ |
| E9 | Generar las cuotas de un período dos veces no las duplica | ✅ |
| E11 | Solo informa una transferencia quien tiene obligaciones a su cargo o permiso económico; no se crean obligaciones de importe cero | ✅ |
| E10 | El tablero separa caja, devengado y saldos; los pagos reversados no cuentan; solo dirección lo ve | ✅ |

## F. Notificaciones duplicadas — `tests/db/operaciones.test.ts`, `aislamiento.test.ts`

| # | Criterio | Estado |
|---|---|---|
| F1 | La misma notificación de pasarela recibida 6 veces a la vez acredita un solo pago | ✅ |
| F2 | El mismo cobro notificado con otro identificador de evento tampoco duplica | ✅ |
| F3 | Una notificación con firma inválida se registra pero no acredita | ✅ |
| F4 | Ningún usuario con sesión puede invocar el procesamiento de pasarela ni la tarea programada | ✅ |
| F5 | Reenviar un aviso no duplica envíos | ✅ |
| F6 | Validación de firma del proveedor real | ⬜ (pasarela a definir, etapa 2) |

## G. Restricciones del asistente — `tests/db/ayuda.test.ts`, `tests/unidad/asistente.test.ts`

| # | Criterio | Estado |
|---|---|---|
| G1 | Solo recupera documentación aprobada y dirigida al perfil; los borradores y los documentos de otra audiencia no aparecen aunque coincidan | ✅ |
| G2 | Un visitante solo encuentra documentación pública | ✅ |
| G3 | Solo dirección modifica o aprueba la documentación que usa el asistente | ✅ |
| G4 | El límite diario lo fija la base por perfil; el cliente no puede elegirlo ni modificarlo | ✅ |
| G5 | Ninguna herramienta de la etapa 1 modifica datos | ✅ |
| G6 | Un docente no dispone de herramientas económicas aunque se pidan por nombre | ✅ |
| G7 | Sin información aprobada, lo reconoce, ofrece derivación y no llama al modelo | ✅ |
| G8 | Toda respuesta con información institucional señala su fuente; las generadas se marcan como tales | ✅ |
| G9 | Al modelo solo viajan la pregunta y fragmentos recuperados | ✅ |
| G10 | Un documento o una pregunta no pueden "romper" su delimitación para inyectar instrucciones | ✅ |
| G11 | Durante una evaluación sin ayudas habilitadas no responde ni consume cuota | ✅ |
| G12 | Si el proveedor falla, responde con el texto aprobado en lugar de un error | ✅ |
| G13 | Comportamiento con un proveedor real frente a intentos de manipulación | ⬜ (proveedor a definir; requiere batería de casos propia) |

## H. Datos y formato — `tests/unidad/base.test.ts`, `tests/db/ayuda.test.ts`

| # | Criterio | Estado |
|---|---|---|
| H1 | Importes en formato argentino, sin pasar por coma flotante | ✅ |
| H2 | Las fechas de negocio no se corren por zona horaria; "hoy" es el de Tucumán | ✅ |
| H3 | Los datos de demostración cargan sin errores y son idempotentes | ✅ |
| H4 | La oferta pública no expone cursos no publicados, cupos ni cantidad de inscriptos | ✅ |
| H5 | El menú muestra a cada rol solo sus secciones | ✅ |

## J. Campus — `tests/db/campus.test.ts`

| # | Criterio | Estado |
|---|---|---|
| J1 | El estudiante ve las preguntas de una actividad pero nunca la clave de corrección | ✅ |
| J2 | El servidor controla el plazo y corrige lo objetivo; quien no cursa no puede entregar | ✅ |
| J3 | La nota la pone el docente de la comisión, dentro del puntaje máximo; la familia la ve recién publicada | ✅ |
| J4 | La lección de práctica no trae respuestas; el banco no es legible por estudiantes | ✅ |
| J5 | Repetir el mismo ejercicio no suma XP; la experiencia se separa del dominio (ejercicios distintos bien resueltos) | ✅ |
| J6 | La racha perdona un día con comodín (se gana uno cada 7 días) | ✅ |
| J7 | El ranking es por comisión, solo para sus integrantes, por uso semanal, con alias y opción de no aparecer | ✅ |
| J8 | Dos ausencias en las últimas cuatro clases generan una alerta, sin duplicarse; la ven su docente y gestión, no otras familias ni otros docentes | ✅ |
| J9 | Una nota baja genera alerta de rendimiento; actividades vencidas sin entregar, de participación | ✅ |
| J10 | El informe se arma con datos calculados por la base; solo para estudiantes propios; dirección lo recibe, la familia solo si se le envía | ✅ |
| J11 | Solo dirección evalúa docentes; el docente ve únicamente lo que se le comparte | ✅ |
| J12 | Mensajería: docente ↔ familia de su estudiante sí; con familias ajenas, entre familias o con docentes ajenos, no; los mensajes no se editan | ✅ |
| J13 | El contenido de la landing lo lee cualquiera y lo edita solo gestión | ✅ |

## I. Recorridos en la aplicación (requieren entorno conectado)

| # | Criterio | Estado |
|---|---|---|
| I1 | La landing muestra la oferta publicada, funciona en celular y por teclado | ✅ render con oferta de ejemplo · 🟡 con base real |
| I2 | Enviar una consulta desde la landing la deja visible en Consultas con estado "nueva" | 🟡 |
| I3 | Invitar una cuenta, crear contraseña desde el correo e ingresar | 🟡 |
| I4 | Recorrido A completo (consulta → inscripción → vínculo verificado) | 🟡 |
| I5 | Recorrido B (docente toma y corrige asistencia desde un celular) | 🟡 |
| I6 | Recorrido C (familia informa transferencia con comprobante; administración valida e imputa) | 🟡 |
| I7 | Recorrido D (cobro en efectivo imputado a dos obligaciones; reverso) | 🟡 |
| I8 | Recorrido E (tablero con período; coincide con los movimientos cargados) | 🟡 |
| I9 | Cambiar la URL a una sección no permitida redirige con aviso | 🟡 |
| I10 | Sin conexión, los formularios conservan lo cargado y muestran un error comprensible | 🟡 |
| I11 | Contraste AA y foco visible en todas las pantallas | ✅ por diseño de tokens · 🟡 auditoría completa |

## Qué falta para dar la etapa 1 por aceptada

1. Conectar un proyecto de Supabase, aplicar migraciones y verificar el grupo I.
2. Correr el asesor de seguridad de Supabase sobre el proyecto real.
3. Configurar correo transaccional (sin eso no salen invitaciones a escala).
4. Resolver las decisiones pendientes de `01-producto.md` §4 que afectan textos legales, aranceles y permisos familiares.
