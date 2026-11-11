# 03 · Modelo de datos

Fuente de verdad: `supabase/migrations/`. Este documento explica el porqué; ante una diferencia, vale el SQL.

- Esquema `public`: tablas (todas con RLS) y funciones invocables por la API.
- Esquema `privado`: no expuesto por la API. Lógica privilegiada y auxiliares de autorización.
- Claves `uuid`. Instantes `timestamptz`. Fechas de negocio `date`. Importes `numeric(14,2)` + `moneda`.

## 1. Etapa 1 (implementado)

### Identidad

| Tabla | Qué representa | Reglas clave |
|---|---|---|
| `sedes` | Sede física | Una fila en la v1 |
| `personas` | Nombre y apellido | Baja lógica (`eliminada_en`) |
| `personas_datos` | Documento, nacimiento, contacto, domicilio | Separada para que los docentes vean nombres sin ver datos sensibles. Único `(tipo_documento, numero_documento)` → detección de duplicados |
| `cuentas` | Acceso (1 usuario de Auth ↔ 1 persona) | `estado` activa/suspendida |
| `roles_asignados` | Roles de personal: docente, administración, dirección | Único rol activo por cuenta; historial con `revocado_en`. Solo por función, solo dirección |
| `estudiantes` | Ficha académica de una persona | Puede existir sin cuenta. `legajo` autogenerado |
| `vinculos_responsables` | Responsable ↔ estudiante con permisos académico / documental / económico, responsable de pago, contacto de emergencia | Un solo vínculo abierto por par. Solo `verificado` da acceso |
| `auditoria` | Antes/después de operaciones críticas | Solo inserción (disparador impide cambios) |

**Vínculo — estados:** `invitado → aceptado → verificado → revocado`. También `invitado → verificado` (verificación presencial), `invitado|aceptado → rechazado`, `invitado|aceptado → revocado`. `revocado` y `rechazado` son finales.

### Académico

| Tabla | Qué representa | Reglas clave |
|---|---|---|
| `ciclos_lectivos` | Año/ciclo | `planificado → activo → cerrado` |
| `niveles` | Ubicación académica | `mcer_referencia` opcional y solo con revisor y fecha: es configuración del instituto, no acreditación |
| `cursos` | Propuesta formativa (público, edades, modalidad) | `publicado` controla la landing |
| `aulas` | Espacio físico | Único por sede |
| `comisiones` | Grupo concreto: curso + nivel + ciclo + cupo | `borrador → abierta → en_curso → finalizada` / `cancelada`. `publicada` controla la landing |
| `comision_docentes` | Docentes de la comisión con vigencia | Disparador rechaza superposición horaria del docente |
| `comision_horarios` | Día, hora, aula, vigencia | **Restricción de exclusión**: misma aula + mismo día + horas y vigencias superpuestas = error |
| `clases` | Cada encuentro | Único `(comisión, fecha, hora_inicio)` |
| `matriculas` | Inscripción confirmada (lado académico) | Única activa por estudiante y comisión. `matricula_anterior_id` encadena cambios y continuidad. Solo por función |
| `matriculas_pago` | Lado económico de la matrícula: responsable de pago y `condiciones` (foto de aranceles al inscribir) | Tabla aparte para que los docentes lean la matrícula sin ver quién paga ni cuánto |
| `reservas_vacante` | Lugar guardado con vencimiento | Ocupa cupo mientras esté vigente y no vencida |
| `lista_espera` | Interesados sin lugar | — |
| `asistencias` | Estado por clase y matrícula | Única por par; valida que la matrícula sea de esa comisión |
| `observaciones_estudiante` | Notas con visibilidad `gestion` / `docentes` / `familia` | Sin edición ni borrado |

**Matrícula — estados:** `activa → baja | cambiada | finalizada`. Nunca se borra.
**Cupo:** ocupados = matrículas activas + reservas vigentes no vencidas. Toda operación que consume cupo bloquea la fila de la comisión (`FOR UPDATE`), por lo que dos confirmaciones simultáneas se ejecutan en serie.

### Captación

| Tabla | Qué representa | Reglas clave |
|---|---|---|
| `consultas` | Pedido de información o preinscripción | Estado, responsable, próxima acción y fecha, origen, motivo de pérdida. Exige teléfono o correo. Límite de 5 por contacto por hora desde la web |
| `consulta_eventos` | Historial | Se genera solo ante cada cambio de estado o de responsable |
| `nivelaciones` | Instancia de nivelación | `realizada` exige nivel sugerido |
| `solicitudes_inscripcion` | Pedido formal: estudiante + comisión + solicitante + responsable de pago | `pendiente → en_revision → aprobada → confirmada` / `rechazada` / `cancelada`. Una abierta por estudiante y comisión |
| `versiones_consentimiento`, `consentimientos` | Textos legales versionados y quién aceptó cuál | El contenido lo define el instituto |

**Consulta — estados:** `nueva → contactada → nivelacion → solicitud → ganada | perdida` (`perdida` exige motivo).

### Cobros

| Tabla | Qué representa | Reglas clave |
|---|---|---|
| `conceptos` | Matrícula, cuota, curso especial, derecho de examen, material | — |
| `aranceles` | Precio con vigencia, general o por ciclo / curso / comisión | **Inmutable**: cambiar un precio = cerrar vigencia + fila nueva. Gana el más específico |
| `beneficios`, `beneficios_otorgados` | Descuento, beca, promoción familiar | Porcentaje o monto fijo. Otorgar exige aprobador (dirección) |
| `obligaciones` | Lo que se debe: estudiante, responsable de pago, concepto, período, vencimiento | `importe = importe_original − descuento` (columna generada). Guarda `arancel_id`: foto del precio. Única por matrícula + concepto + período |
| `pagos` | Dinero recibido o informado | `informado → confirmado | rechazado`, `confirmado → reversado`. Importe, medio y pagador inmutables; sin borrado. Único `(proveedor, referencia_externa)` |
| `imputaciones` | Qué parte de un pago cubre qué obligación | Solo sobre pagos confirmados; nunca supera el disponible del pago ni el saldo de la obligación; se anula, no se borra |
| `ajustes` | Reverso de pago, devolución, anulación de obligación, nota de crédito | Motivo obligatorio; inmutable |
| `eventos_pasarela` | Notificaciones recibidas del proveedor | Único `(proveedor, evento_id_externo)` → idempotencia |
| vistas `obligaciones_saldo`, `pagos_saldo` | Pagado, saldo, saldo a favor | **Única fuente de saldos**; `security_invoker` (respetan RLS) |

**Obligación — estados:** `pendiente ↔ parcial ↔ pagada` (se recalcula con cada imputación o reverso) y `pendiente → anulada`.

### Empresa, comunicación, documentos, ayuda

| Tabla | Qué representa | Reglas clave |
|---|---|---|
| `proveedores`, `categorias_gasto`, `gastos` | Egresos, con atribución opcional a curso o comisión | Se anulan con motivo; no se borran |
| `pagos_docentes` | Registro de pagos a docentes | No es liquidación laboral |
| `comunicaciones` | Aviso: institucional / comisión / individual; general / académica / económica | `borrador → enviada` |
| `comunicacion_envios` | Un registro por destinatario y canal | `pendiente → enviado → entregado → leido` / `fallido`. Único por comunicación + destinatario + canal (idempotencia). Intentos y próximo reintento |
| `preferencias_notificacion` | Canal × categoría por persona | El aviso interno no se puede desactivar |
| `documentos` | Metadatos del archivo privado | `ruta` única = clave de la política de Storage; `conservar_hasta` |
| `documentos_ayuda` | Documentación aprobada por audiencia | Índice de texto completo en español. Solo `aprobado` se recupera |
| `asistente_limites`, `asistente_uso` | Límite diario por perfil y contadores | No se guarda el texto de las preguntas |
| `tareas_ejecutadas` | Registro de tareas programadas | Clave `(tarea, clave)` |

### Operaciones transaccionales (funciones)

| Función | Quién | Garantiza |
|---|---|---|
| `confirmar_inscripcion` | Gestión | Cupo bajo bloqueo; convierte la reserva propia; crea matrícula + derecho de matrícula; cierra solicitud y consulta |
| `reservar_vacante`, `cambiar_comision`, `dar_de_baja_matricula` | Gestión | Mismo bloqueo de cupo; historial encadenado |
| `generar_cuotas` | Gestión / tarea programada | Idempotente; usa el arancel vigente al inicio del período; aplica beneficios aprobados |
| `registrar_pago` | Gestión | Pago + imputaciones en una sola transacción (todo o nada) |
| `informar_transferencia` | Responsable | Crea el pago en `informado`; el comprobante debe ser propio |
| `validar_pago`, `imputar_pago`, `reversar_pago`, `registrar_devolucion`, `anular_obligacion`, `crear_obligacion` | Gestión | Transiciones válidas, topes de importe, ajuste auditable |
| `procesar_evento_pasarela` | Solo `service_role` | Doble barrera de idempotencia (evento y referencia de cobro) |
| `invitar_responsable`, `responder_vinculo`, `verificar_vinculo`, `revocar_vinculo` | Gestión / la persona invitada | Transiciones del vínculo; nadie opera sobre sus propios permisos |
| `otorgar_rol`, `revocar_rol` | Dirección | No se puede quitar la última dirección |
| `enviar_comunicacion` | Autor | Destinatarios según tipo y categoría; reenvío no duplica |
| `tablero_direccion` | Dirección | Indicadores calculados en la base |
| `oferta_publicada`, `buscar_ayuda`, `mi_contexto`, `registrar_uso_asistente` | Según el caso | Datos mínimos públicos; búsqueda filtrada por RLS |

### Índices

Además de claves y únicos: apellidos de personas; vínculos por responsable (solo verificados) y por estudiante; matrículas activas por comisión; obligaciones por responsable + estado y por vencimiento (solo abiertas); pagos por pagador y por estado; imputaciones vigentes por pago y por obligación; consultas por estado + próxima acción; envíos pendientes por próximo intento; auditoría por tabla + registro.

## 2. Etapas 2 y 3 (diseñado, sin migrar)

Se listan para que la etapa 1 no cierre caminos. No existen todavía en la base.

**Competencias y contenidos**
- `competencias (id, codigo, nombre, habilidad[vocabulario|lectura|gramatica|escucha|escritura|habla], nivel_id, mcer_referencia?, revisado_por, revisado_en)`.
- `contenidos (id, tipo, enunciado jsonb, respuesta_correcta jsonb, competencia_id, dificultad 1-5, objetivo, estado[borrador|revisado|retirado], revisado_por)`. La columna `respuesta_correcta` no tiene permiso de lectura para estudiantes: se expone por vista sin ese campo.
- `comision_contenidos (comision_id, contenido_id, desde)`.

**Actividades y calificaciones**
- `actividades (id, comision_id, titulo, tipo[practica|formativa|acreditante], abre_en, cierra_en, intentos_max, ayudas_habilitadas text[])`.
- `actividad_items (actividad_id, contenido_id, orden, puntaje)`.
- `intentos (id, actividad_id, matricula_id, estado[en_curso|entregado|cerrado|anulado], iniciado_en, vence_en, entregado_en)` — `vence_en` lo fija el servidor.
- `respuestas (intento_id, item_id, respuesta jsonb, guardada_en, correcta?, puntaje?, corregida_por[regla|docente])`, única por intento + ítem (guardado idempotente).
- `devoluciones (respuesta_id, texto, origen[docente|ia_sugerida], aprobada_por?, aprobada_en?)` — lo sugerido por IA no es visible para el estudiante hasta que un docente lo aprueba.
- `calificaciones (matricula_id, actividad_id, nota, estado[borrador|publicada], publicada_por, publicada_en)`.
- `aprobaciones (matricula_id, resultado, decidido_por, decidido_en, fundamento)` — decisión docente explícita, no calculada.

**Práctica gamificada** — separada de la evidencia de aprendizaje
- `practica_eventos (estudiante_id, contenido_id, correcta, ocurrido_en)`.
- `puntos_juego (estudiante_id, puntos, motivo, ocurrido_en)`; `metas_semanales`; `medallas`, `medallas_otorgadas`.
- `dominio_competencias (estudiante_id, competencia_id, estado, evidencia jsonb, proxima_revision)`: repetición espaciada con reglas explícitas; repetir ítems fáciles no suma evidencia.
- Sin rankings públicos de menores.

**Evaluaciones en vivo**
- `sesiones_en_vivo (id, actividad_id, estado[preparada|abierta|pausada|cerrada], item_actual, item_cierra_en)`.
- Realtime sobre canales privados autorizados por matrícula; las respuestas se persisten en `respuestas`. Si se cae la conexión, el cliente relee el estado de la sesión. Las respuestas correctas no viajan al navegador antes del cierre.
- Sin vigilancia biométrica ni grabación.

**Certificados**
- `reconocimientos (id, tipo[medalla|competencia|certificado_instituto|certificacion_externa], estudiante_id, titulo, criterio, evidencia jsonb, estado[borrador|emitido|revocado|reemplazado], aprobado_por, emitido_en, codigo_verificacion único, reemplaza_a?)`.
- Verificación pública por código exacto mediante función que devuelve solo nombre, título, fecha y estado; con límite de intentos. Sin búsqueda por nombre.
- Las certificaciones externas se **registran** (entidad, fecha, comprobante); el sistema no las emite ni les atribuye reconocimiento oficial.

**Pasarela, escenarios y automatizaciones**
- La tabla `eventos_pasarela` y la función de procesamiento ya existen; falta el adaptador del proveedor (firma, mapeo) y la conciliación diaria.
- `escenarios (id, nombre, supuestos jsonb, resultado jsonb, creado_por)`: simulaciones que nunca modifican aranceles.
- `automatizaciones_comunicacion` con plantillas aprobadas y ventanas horarias.
