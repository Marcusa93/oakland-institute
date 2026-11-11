# 02 · Matriz de permisos

La matriz se hace cumplir en **tres lugares**, del más fuerte al más débil:

1. **Base de datos** — políticas RLS y funciones (`supabase/migrations/…_rls_y_permisos.sql`, `…_funciones_operativas.sql`). Es la barrera real.
2. **Servidor** — `exigirPermiso(recurso, acción)` al inicio de cada página y acción (`src/lib/sesion.ts`).
3. **Interfaz** — el menú solo muestra lo permitido (`src/lib/permisos.ts`, `src/lib/navegacion.ts`).

Las capas 2 y 3 deben ser iguales o más restrictivas que la 1, nunca más permisivas.

## Perfiles

| Perfil | Cómo se obtiene | Quién lo otorga |
|---|---|---|
| Visitante | Sin sesión | — |
| Estudiante | La persona de la cuenta tiene ficha de estudiante | Se deriva del dato |
| Tutor / responsable | La persona tiene al menos un vínculo **verificado** | Administración verifica el vínculo |
| Docente | Rol asignado | Dirección |
| Administración | Rol asignado | Dirección |
| Dirección | Rol asignado | Dirección (debe quedar siempre al menos una) |

Una cuenta puede reunir varios perfiles (una docente que además es madre de un alumno). Nadie puede asignarse un rol ni crear o modificar sus propios vínculos: esas tablas no admiten escritura directa.

## Alcances

- **Todo**: cualquier fila.
- **Propio**: filas de la propia persona.
- **Vinculados**: estudiantes con vínculo verificado, y solo en el ámbito del permiso otorgado — **A**cadémico, **D**ocumental, **E**conómico.
- **Sus comisiones**: comisiones donde es docente vigente y estudiantes con matrícula **activa** en ellas.

## Matriz

V = ver · C = crear · E = editar · A = aprobar/validar · — = sin acceso

| Recurso | Visitante | Estudiante | Tutor | Docente | Administración | Dirección |
|---|---|---|---|---|---|---|
| Oferta publicada | V | V | V | V | V C E | V C E |
| Consulta / preinscripción | C (enviar) | — | — | — | V C E | V C E |
| Seguimiento comercial, nivelaciones, solicitudes | — | — | — | — | V C E | V C E |
| Persona (nombre) | — | V propio | V vinculados | V sus comisiones | V C E | V C E |
| Datos sensibles (documento, contacto, nacimiento) | — | V propio | V vinculados **D** | **—** | V C E | V C E |
| Ficha de estudiante | — | V propio | V vinculados | V sus comisiones | V C E | V C E |
| Vínculos responsable–estudiante | — | — | V propios · responder invitación | — | V C E A | V C E A |
| Roles de personal | — | — | — | V propio | V | V C E |
| Ciclos, niveles, cursos, aulas, comisiones, horarios | publicado | V | V | V | V C E | V C E |
| Matrículas (inscripciones) | — | V propio | V vinculados **A** | V sus comisiones | V C E A (por función) | V C E A |
| Reservas de vacante, lista de espera | — | — | — | — | V C E | V C E |
| Clases | — | V | V | V · C E sus comisiones | V C E | V C E |
| Asistencia | — | V propio | V vinculados **A** | V C E sus comisiones | V C E | V C E |
| Observaciones «gestión» | — | — | — | — | V C | V C |
| Observaciones «docentes» | — | — | — | V C sus comisiones | V C | V C |
| Observaciones «familia» | — | V propio | V vinculados **A** | V C sus comisiones | V C | V C |
| Documentos del estudiante | — | V propio | V vinculados **D** | **—** | V C E | V C E |
| Obligaciones y saldos | — | V si es su responsable de pago | V vinculados **E** | **—** | V C (por función) | V C |
| Pagos | — | V propios · informar transferencia | V propios · informar transferencia | **—** | V C A · reversar | V C A · reversar |
| Aranceles y beneficios | — | — | — | **—** | V | V C E A |
| Gastos, proveedores, categorías | — | — | — | **—** | V C E | V C E |
| Pagos a docentes | — | — | — | **—** | — | V C E |
| Avisos recibidos | — | V propios | V propios | V propios | V | V |
| Enviar aviso por comisión | — | — | — | C sus comisiones (no económico) | C | C |
| Enviar aviso institucional o económico | — | — | — | **—** | C | C |
| Preferencias de notificación | — | E propias | E propias | E propias | E propias | E propias |
| Tablero de dirección | — | — | — | — | — | V |
| Auditoría | — | — | — | — | — | V |
| Ayuda / documentación aprobada | V pública | V su audiencia | V su audiencia | V su audiencia | V todo | V C E A |
| Asistente | — | consulta | consulta | consulta | consulta | consulta |
| Notificaciones de pasarela, tareas programadas | — | — | — | — | — | solo `service_role` (V registro: dirección) |

## Reglas que conviene tener a la vista

- **Docentes y dinero**: no aparecen en ninguna política de tablas económicas. Tampoco ven datos de contacto, vínculos ni documentación.
- **El acceso docente sigue a la matrícula activa**: con la baja o el cambio de comisión deja de ver al estudiante.
- **Un vínculo `invitado` o `aceptado` no da acceso**; solo `verificado`. La revocación apaga los permisos en el mismo acto y no se puede reactivar: se crea un vínculo nuevo.
- **Cuenta suspendida** = sin perfiles, sin acceso.
- **Avisos económicos**: solo llegan a responsables de pago o a responsables con permiso económico; la función rechaza cualquier otro destinatario.
- **Archivos**: bucket privado; la política de Storage aplica la misma regla que la tabla `documentos`. Descarga con URL firmada de corta duración. No hay política de subida para usuarios: el servidor emite una URL de subida después de crear la fila autorizada.
- **Visitantes**: pueden insertar una consulta y nada más; un disparador descarta cualquier campo de seguimiento que intenten fijar y limita envíos repetidos.

## Excepciones previstas (no implementadas)

- Permiso puntual para que una docente vea un contacto de emergencia durante una salida.
- Responsable con acceso de solo lectura limitado en el tiempo.

Ambas se resolverían agregando columnas al vínculo; hoy se resuelven por administración.
