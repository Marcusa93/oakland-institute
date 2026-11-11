# 04 · Backlog priorizado con dependencias

Estado: ✅ hecho y verificado · 🟡 construido, falta verificarlo en ejecución · ⬜ pendiente · 🔒 bloqueado por una decisión del instituto.

Prioridad: **P0** imprescindible para operar · **P1** necesario para lanzar · **P2** mejora.

## Etapa 1 — Gestión y captación

| # | Ítem | Prio | Estado | Depende de |
|---|---|---|---|---|
| 1.1 | Esquema, RLS y funciones transaccionales | P0 | ✅ | — |
| 1.2 | Pruebas automáticas de los criterios de aceptación | P0 | ✅ | 1.1 |
| 1.3 | Identidad parametrizada, componentes accesibles | P0 | ✅ (provisoria) | — |
| 1.4 | Landing con oferta administrable y formulario | P0 | ✅ render · 🟡 envío real | 1.1 |
| 1.5 | **Proyecto Supabase de desarrollo + variables en Vercel** | P0 | ⬜ | Decisión: crear proyecto |
| 1.6 | Ingreso, invitación, recuperación de clave | P0 | 🟡 | 1.5 |
| 1.7 | Panel por rol + inicio con tareas | P0 | 🟡 | 1.5 |
| 1.8 | Consultas y seguimiento comercial | P0 | 🟡 | 1.5 |
| 1.9 | Estudiantes, responsables y vínculos | P0 | 🟡 | 1.5 |
| 1.10 | Comisiones, horarios, inscripción, reserva, baja, cambio | P0 | 🟡 | 1.5 |
| 1.11 | Asistencia docente | P0 | 🟡 | 1.10 |
| 1.12 | Cuenta corriente, cobros, validación, reversos | P0 | 🟡 | 1.9 |
| 1.13 | Vista de familias: cursada y cuenta | P0 | 🟡 | 1.9, 1.12 |
| 1.14 | Gastos y registro de pagos a docentes | P1 | 🟡 | 1.5 |
| 1.15 | Avisos internos | P1 | 🟡 | 1.9 |
| 1.16 | Tablero de dirección | P1 | 🟡 | 1.12, 1.14 |
| 1.17 | Asistente con documentación aprobada | P1 | ✅ lógica · 🟡 pantalla | 1.5 |
| 1.18 | Tipos TypeScript generados desde la base | P1 | ⬜ | 1.5 |
| 1.19 | Pruebas de punta a punta (navegador) de los recorridos A–G | P1 | ⬜ | 1.5 |
| 1.20 | Correo transaccional (SMTP de Auth + envío de avisos con reintentos) | P1 | ⬜ 🔒 | Elegir proveedor y dominio |
| 1.21 | Tarea programada: generar cuotas del mes | P1 | ⬜ (función lista) | 1.5 |
| 1.22 | Nivelaciones y solicitudes: pantallas propias | P1 | ⬜ (tablas listas) | 1.8 |
| 1.23 | Administración de oferta: cursos, niveles, ciclos, aulas | P1 | ⬜ parcial (comisiones sí) | 1.10 |
| 1.24 | Aranceles y beneficios: pantalla de dirección | P1 | ⬜ (tablas y reglas listas) 🔒 | Valores y reglas reales |
| 1.25 | Documentación del estudiante: subir y ver | P1 | ⬜ parcial (comprobantes sí) | 1.9 |
| 1.26 | Roles de personal y alta de cuentas de staff | P1 | ⬜ (funciones listas) | 1.6 |
| 1.27 | Importación desde planillas con validación y duplicados | P1 | ⬜ 🔒 | Recibir las planillas actuales |
| 1.28 | Exportación CSV de listados | P2 | ⬜ | — |
| 1.29 | Edición de documentación de ayuda y reglamentos | P2 | ⬜ (tabla y permisos listos) | — |
| 1.30 | Textos legales y política de privacidad | P1 | 🔒 | Validación profesional |
| 1.31 | Identidad definitiva y contenidos institucionales | P1 | 🔒 | Nombre, logo, paleta, textos |
| 1.32 | Copias de seguridad y simulacro de restauración | P1 | ⬜ | Proyecto de producción |
| 1.33 | Auditoría de accesibilidad con lector de pantalla | P2 | ⬜ | 1.19 |
| 1.34 | Recibo interno imprimible | P2 | ⬜ | 1.12 |
| 1.36 | Resumen de asistencia calculado en la base (vista por matrícula) | P2 | ⬜ | 1.11 |
| 1.37 | Asistencia: ver y corregir registros de alumnos dados de baja; clases de otras fechas; cancelar clase | P2 | ⬜ | 1.11 |
| 1.38 | Limpieza de filas de `documentos` sin archivo (subidas abandonadas) | P2 | ⬜ | 1.25 |
| 1.39 | Historial de ajustes para gestión; motivo del reverso visible para la familia (decidir) | P2 | ⬜ | 1.12 |
| 1.40 | Paginación de listados largos; conservar lo escrito cuando una acción devuelve error | P2 | ⬜ | 1.19 |
| 1.41 | Alta de estudiante en una sola función transaccional (hoy son tres pasos con deshacer manual) | P1 | ⬜ | 1.9 |
| 1.42 | Botón para cancelar reserva (la función `cancelar_reserva` ya existe) y acceso a asistencia desde Comisiones para gestión | P2 | ⬜ | 1.10 |
| 1.35 | Preferencias de notificación (pantalla) | P2 | ⬜ (tabla lista) | 1.20 |

**Camino crítico:** 1.5 → 1.19 (verificar todo lo 🟡) → 1.20 → 1.30/1.31 → carga inicial (1.27) → producción (1.32).

## Adelantado de la etapa 2 (hecho)

| # | Ítem | Estado |
|---|---|---|
| 2.1a | Actividades con preguntas autocorregibles, entregas con plazo controlado por el servidor y corrección rápida | ✅ base · 🟡 pantallas |
| 2.5a | Práctica gamificada por habilidad: XP, rachas con comodines, metas semanales, medallas, ranking de uso por comisión | ✅ base · 🟡 pantallas |
| 2.9 | Alertas automáticas de ausentismo, participación y rendimiento | ✅ base · 🟡 pantallas |
| 2.10 | Informes por estudiante (docente y dirección), imprimibles | ✅ base · 🟡 pantallas |
| 2.11 | Evaluación de docentes por dirección | ✅ base · 🟡 pantallas |
| 2.12 | Mensajería institucional con reglas por rol | ✅ base · 🟡 pantallas |
| 2.13 | Landing autogestionable (portada, pasos, preguntas, contacto, anuncio, certificaciones) | ✅ base · 🟡 pantallas |
| 2.14 | Oakland AI en landing y panel con contenido de ejemplo | ✅ |

## Etapa 2 — Campus y pagos en línea

| # | Ítem | Depende de |
|---|---|---|
| 2.1 | Competencias y banco de contenidos revisados por docentes | Etapa 1 |
| 2.2 | Actividades, entregas y corrección por reglas | 2.1 |
| 2.3 | Evaluaciones formativas y acreditantes; publicación de resultados | 2.2 · 🔒 reglas de aprobación |
| 2.4 | Asistente docente: borradores de ejercicios, rúbricas y devoluciones (con aprobación docente) | 2.2 · 🔒 proveedor de IA |
| 2.5 | Práctica gamificada inicial: experiencia, metas semanales, medallas | 2.1 |
| 2.6 | Reconocimientos y certificados con verificación pública | 2.3 · 🔒 certificaciones reales |
| 2.7 | Pasarela de pagos: adaptador, firma, conciliación | Etapa 1 · 🔒 proveedor |
| 2.8 | Consultas operativas del asistente (saldo, horarios) con herramientas determinísticas | 1.17 |

## Etapa 3 — En vivo, adaptativo y automatización

| # | Ítem | Depende de |
|---|---|---|
| 3.1 | Evaluaciones en vivo con Realtime, reconexión y control de tiempos en servidor | 2.3 |
| 3.2 | Práctica adaptativa y repetición espaciada | 2.5 |
| 3.3 | Conversación y pronunciación | 2.4 |
| 3.4 | WhatsApp por proveedor autorizado | 1.20 · 🔒 proveedor |
| 3.5 | Automatizaciones de comunicación (recordatorios de vencimiento, ausencias) | 1.20 |
| 3.6 | Escenarios de gestión y margen por curso | 1.16 |
| 3.7 | Acciones del asistente con vista previa, autorización y auditoría | 2.8 |
| 3.8 | Segunda sede | Decisión de negocio |
