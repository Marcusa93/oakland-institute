# 01 · Producto, supuestos, módulos y arquitectura

## 1. Síntesis

Una sola aplicación web para un instituto privado de inglés de Monteros (Tucumán) que reúne:

- **Landing pública** que convierte consultas en inscripciones, con la oferta administrada desde el propio sistema.
- **Gestión interna**: admisiones, estudiantes y familias, comisiones, asistencia, cuenta corriente, cobros, gastos, avisos y tablero de dirección.
- **Campus** para estudiantes, docentes y familias (práctica, actividades, evaluaciones y certificados), que llega en las etapas 2 y 3 sobre la misma base.
- **Asistente de IA por rol**, pequeño y contextual, que solo consulta lo que cada persona está autorizada a ver.

Idea rectora: **una única fuente de información**. Una persona se carga una vez y puede ser, a la vez, estudiante, responsable, pagadora o docente. Una consulta se convierte en solicitud y en matrícula sin volver a tipear datos. Los saldos se derivan siempre de pagos e imputaciones.

Cuatro separaciones atraviesan todo el diseño:

| Se separa | Para que |
|---|---|
| persona · cuenta · estudiante · responsable · responsable de pago | un menor exista sin cuenta, un adulto tenga varios hijos, y cada responsable vea solo lo que le corresponde |
| curso · nivel · comisión · clase | la oferta, la ubicación académica, el grupo concreto y cada encuentro evolucionen por separado |
| participación · dominio de competencias · aprobación · estado de cuenta | ninguna se infiera de otra (no se aprueba por asistir ni se bloquea una nota por deber) |
| consulta · solicitud · reserva · matrícula | el embudo comercial sea medible y solo la matrícula ocupe cupo de forma definitiva |

## 2. Estado de esta entrega

Ver el cuadro actualizado en el `README.md` (operativo / construido sin verificar / demostración / pendiente).

## 3. Supuestos explícitos (reversibles)

1. **Una institución, una sede.** Existe la tabla `sedes` y las comisiones/aulas la referencian; no hay multiempresa.
2. **Las cuentas las crea administración por invitación.** No hay registro abierto. Reduce suplantaciones y simplifica la verificación de vínculos.
3. **"Estudiante" y "tutor" no son roles que se asignan**: se derivan de los datos (tener ficha de estudiante; tener un vínculo verificado). Solo docente, administración y dirección se asignan, y solo dirección puede hacerlo.
4. **Moneda única ARS**, importes `numeric(14,2)`. La columna de moneda es explícita en todas las tablas económicas.
5. **Zona horaria America/Argentina/Tucuman**: instantes en UTC (`timestamptz`), fechas de negocio como `date`.
6. **Los docentes no ven datos de contacto ni documentación de las familias**; la comunicación pasa por avisos de la plataforma.
7. **Precios y beneficios los decide dirección**; administración cobra pero no modifica aranceles.
8. **Un menor ve su cursada pero no la cuenta corriente**, salvo que sea su propio responsable de pago.
9. **Sin precios en la landing** hasta que el instituto lo decida.
10. **Derecho de matrícula con vencimiento a 10 días y cuotas con vencimiento el día 10**: valores por defecto parametrizables.
11. **Identidad visual parametrizada** (nombre y colores del instituto; logo y tipografía provisorios) en variables (`src/app/globals.css`, `src/config/institucion.ts`).

## 4. Decisiones pendientes (requieren validación del instituto antes del lanzamiento)

Ninguna frena el desarrollo; todas tienen un valor provisorio conservador.

| Tema | Qué hay que decidir | Valor provisorio |
|---|---|---|
| **Aranceles** | Valores reales, día de vencimiento, recargos por mora, política ante bajas a mitad de mes | Importes ficticios; sin recargos; la baja no anula obligaciones sola |
| **Beneficios** | Reglas de becas, descuentos por hermanos, tope de acumulación, quién aprueba | Aprueba dirección; se acumulan con tope en el importe |
| **Permisos familiares** | Qué ve cada responsable por defecto; si un responsable puede pedir un vínculo por sí mismo; cómo se documenta la verificación; situaciones con restricciones de contacto | Todo permiso apagado hasta que administración lo enciende |
| **Menores y privacidad** | Base legal y texto de privacidad; desde cuándo un estudiante tiene cuenta propia; autorizaciones de imagen; plazos de conservación y procedimiento de supresión; inscripción de bases de datos | Texto rotulado "pendiente de validación legal"; sin cuentas propias para menores por defecto. **No se asumió ninguna edad ni requisito legal**: debe revisarlo un profesional |
| **Certificaciones** | Cuáles ofrece efectivamente el instituto y con qué entidades | Sección oculta en la landing; `certificaciones: []` |
| **MCER** | Correspondencia de cada nivel con el Marco Común Europeo | Niveles sin referencia; el campo exige revisor y fecha |
| **Reglas de aprobación** | Escala de notas, asistencia mínima, quién firma la aprobación | Sin definir (etapa 2); la decisión queda siempre en el docente |
| **Integraciones** | Proveedor de correo, pasarela local, proveedor de WhatsApp, proveedor de IA y sus condiciones de tratamiento de datos | Ninguna activa |
| **Fiscal** | Si se emite comprobante fiscal desde el sistema y con qué integración | Solo comprobantes internos; lo fiscal queda afuera |
| **Pagos docentes** | Si administración los ve; si se requiere liquidación | Solo dirección; es un registro, no una liquidación |
| **Asistencia** | Si la observación que el docente escribe al tomar asistencia la ve la familia | Hoy la base la entrega a la familia con permiso académico; la pantalla de familias no la muestra |
| **Avisos** | Si los avisos institucionales también deben llegar a docentes y personal | Hoy llegan a estudiantes activos y sus responsables |
| **Identidad** | Archivo original del logo, valores exactos de color, tipografía, lema y datos de contacto | Nombre «Oakland Institute» y paleta azul marino + rojo aplicados (colores aproximados desde imágenes); logo en texto |
| **Fotos** | Qué fotos se publican. Las que muestran niños, niñas o adolescentes requieren autorización de sus responsables | Solo se usa una foto de una clase de adultos; ninguna con menores |

## 5. Mapa de módulos

| Ámbito | Módulo | Contenido | Etapa |
|---|---|---|---|
| Público | Landing | Oferta publicada, preguntas frecuentes, consulta y preinscripción | 1 |
| Público | Verificador de certificados | Consulta por identificador, datos mínimos | 2 |
| Gestión | Captación | consultas → nivelación → solicitud → reserva → matrícula | 1 |
| Gestión | Personas | personas, cuentas, roles, estudiantes, vínculos, consentimientos | 1 |
| Gestión | Académico | ciclos, niveles, cursos, comisiones, aulas, horarios, clases, asistencia, observaciones, lista de espera | 1 |
| Gestión | Cobros | aranceles, beneficios, obligaciones, pagos, imputaciones, ajustes | 1 (pasarela: 2) |
| Gestión | Empresa | gastos, proveedores, pagos a docentes, tablero, escenarios | 1 (escenarios: 3) |
| Gestión | Comunicación | avisos institucionales, por comisión e individuales; preferencias | 1 (correo: 1, WhatsApp: 3) |
| Gestión | Documentos | metadatos + bucket privado con URL firmada | 1 |
| Campus | Práctica y actividades | banco de contenidos, entregas, práctica gamificada | 2 (adaptativa: 3) |
| Campus | Evaluaciones | formativas y acreditantes; en vivo | 2 (en vivo avanzado: 3) |
| Campus | Reconocimientos | medallas, competencias verificadas, certificados | 2 |
| Transversal | Autorización, auditoría, asistente por rol, tareas programadas | — | 1 |

Código por módulo: `src/app/panel/<módulo>/` (página + acciones + formularios) y la lógica crítica en SQL (`supabase/migrations`). No hay capa de servicios intermedia: para un equipo chico, menos piezas.

## 6. Recorridos principales

**A. De la consulta a la inscripción (menor).** Un adulto completa el formulario en la landing → consulta `nueva` (origen `web`, con la versión del texto de privacidad aceptado) → administración la toma, registra próxima acción y contacta → se coordina una nivelación y se registra el nivel sugerido → administración carga una sola vez al adulto y al menor, crea la solicitud y, si hace falta, reserva vacante por 72 h → confirma la inscripción: en una transacción se controla el cupo, se crea la matrícula con la foto de las condiciones económicas, se genera el derecho de matrícula a nombre del responsable de pago y la consulta pasa a `ganada` → se invita al adulto a crear su cuenta → acepta el vínculo → administración lo verifica y define permisos.

**B. Docente toma asistencia.** Ingresa → ve primero "Mis comisiones" → abre la clase de hoy → marca presente/ausente/tarde/justificada → guarda. No ve teléfonos, documentos ni deudas.

**C. Familia sigue la cursada y paga.** Ingresa → ve horarios, asistencia y avisos de sus hijos → en Cuenta ve obligaciones y saldo → informa una transferencia con comprobante → queda "en verificación" → administración la ve acreditada en el banco, la confirma y la imputa → el saldo baja.

**D. Administración cobra en mostrador.** Busca al responsable → ve sus obligaciones con saldo → registra efectivo y lo distribuye entre una o varias obligaciones (total o parcial) → si se equivoca, reversa con motivo.

**E. Dirección revisa la marcha.** Abre el tablero → elige período → ve caja, devengado, saldos, ocupación y conversión, cada uno con su fórmula → decide. Los precios y beneficios los cambia ella misma; nada los modifica automáticamente.

**F. Cambio y continuidad.** Cambio de comisión (controla cupo, encadena matrículas), baja con motivo, reinscripción al ciclo siguiente como nueva matrícula enlazada a la anterior. El historial no se pisa.

**G. Revocación de un vínculo.** Administración revoca con motivo → el acceso se corta en la siguiente consulta → queda en auditoría quién y cuándo.

## 7. Arquitectura

| Capa | Elección | Por qué |
|---|---|---|
| Aplicación | Next.js 16 (App Router) + TypeScript en Vercel | Stack pedido. Server Components y Server Actions: no hay API propia que mantener |
| Datos | PostgreSQL de Supabase | Integridad relacional, transacciones, RLS |
| Autenticación | Supabase Auth (correo + contraseña, invitación) | Sin servicio adicional |
| Archivos | Supabase Storage, bucket privado `documentos` | Acceso por política + URL firmada de corta duración |
| Tiempo real (etapa 3) | Supabase Realtime con canales autorizados | Para evaluaciones en vivo; PostgreSQL sigue siendo la fuente de verdad |
| Tareas programadas | Vercel Cron → ruta protegida → función SQL idempotente | Generación de cuotas, reintentos de envío |

**Dónde vive la seguridad.** En la base. Cada tabla tiene RLS; las operaciones con invariantes (cupos, pagos, vínculos, roles) son funciones SQL transaccionales y las tablas que protegen no aceptan escritura directa. La aplicación agrega una matriz de permisos para navegación y cortes tempranos, pero un error en la interfaz no expone datos.

- La **clave secreta** de Supabase solo existe en el servidor (`src/lib/supabase/admin.ts`, marcado `server-only`) y se usa para tres cosas: invitar cuentas, tareas programadas y notificaciones de pasarela.
- Los permisos **nunca** se leen de `user_metadata` (editable por el usuario): salen de tablas.
- Render dinámico por pedido y `Cache-Control: private, no-store` en `/panel`. `cacheComponents` desactivado a propósito.
- La auditoría guarda antes/después de operaciones críticas y no admite modificación ni borrado.

### Servicios adicionales (ninguno contratado todavía)

| Servicio | Para qué | Costo operativo | Cuándo |
|---|---|---|---|
| Correo transaccional (SMTP propio para Supabase Auth + envío de avisos) | Invitaciones, recuperación de clave y avisos por correo. El SMTP integrado de Supabase tiene límites muy bajos y no sirve para producción | Gratuito o de bajo costo a este volumen; requiere dominio propio y registros DNS | **Antes del lanzamiento** de la etapa 1 |
| Supabase plan pago | Copias de seguridad diarias, sin pausa por inactividad | Abono mensual fijo | Antes de cargar datos reales |
| Pasarela de pagos local | Cobro en línea | Comisión por operación | Etapa 2 |
| Proveedor de IA | Redacción de respuestas, borradores docentes | Por uso; acotado por límites diarios por rol | Opcional en etapa 1 (hoy el asistente cita documentación sin modelo) |
| Proveedor autorizado de WhatsApp | Avisos por WhatsApp | Por conversación + alta de plantillas | Etapa 3 |
| Monitoreo de errores | Detectar fallas en producción | El plan gratuito suele alcanzar | Recomendado al lanzar |

### Asistente de IA

Flujo de una pregunta:

1. ¿La herramienta está autorizada para el perfil? Se decide en código (`src/lib/asistente/herramientas.ts`).
2. ¿Queda cupo diario? Lo decide la base (`asistente_limites`), no el cliente.
3. Búsqueda en documentación aprobada: la RLS filtra por audiencia antes de que el texto llegue a ningún modelo.
4. Sin resultados → "no tengo esa información" + derivación a una persona.
5. Con resultados → sin proveedor: cita textual + fuente; con proveedor: redacción + fuente, marcada como generada.

- **Dos caminos separados**: documentos institucionales (búsqueda de texto completo en `documentos_ayuda`) y datos operativos (consultas y funciones determinísticas con la sesión del usuario). El modelo explica; no calcula saldos.
- **Permisos antes de recuperar y antes de ejecutar**, en código y en la base. Las instrucciones al modelo no son un mecanismo de seguridad.
- **Contenido recuperado = dato no confiable**: va delimitado y neutralizado.
- **Minimización**: al modelo solo viajan la pregunta y fragmentos de documentación aprobada. No se guarda el texto de las preguntas, solo contadores de uso.
- **Etapa 1: solo consultas.** No hay herramientas que modifiquen datos. Las futuras exigirán autorización específica, vista previa y auditoría.
- **Proveedor intercambiable**: interfaz `ProveedorIA` (`src/lib/asistente/tipos.ts`).

## 8. Operación

- **Entornos**: desarrollo, pruebas y producción son tres proyectos de Supabase distintos y tres entornos de Vercel, con variables propias (`NEXT_PUBLIC_ENTORNO`). Los datos ficticios nunca se cargan en producción.
- **Migraciones versionadas** en `supabase/migrations`. Se aplican en orden; nunca se edita una ya aplicada en producción.
- **Copias de seguridad**: las diarias del plan pago de Supabase + exportación lógica semanal (`pg_dump`) guardada fuera de Supabase.
- **Restauración verificable** (trimestral): restaurar la última copia en un proyecto vacío, comparar conteos de tablas clave y la suma de pagos confirmados contra producción, y dejar constancia de fecha y resultado.
- **Importación inicial desde planillas** (pendiente, ver backlog): carga a tablas de preparación, validación fila por fila, detección de duplicados por documento y por nombre + fecha de nacimiento, reporte previo y confirmación humana antes de pasar a las tablas reales.
- **Exportación**: CSV por listado y `pg_dump` completo.
- **Tareas programadas y envíos**: idempotentes (clave única por tarea/período; un envío por comunicación + destinatario + canal) y con reintentos.
- **Conservación y eliminación**: los documentos tienen `conservar_hasta`; las personas se dan de baja lógica (`eliminada_en`). Los plazos concretos son una decisión pendiente.
