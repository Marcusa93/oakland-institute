# Oakland Institute · gestión, captación y campus

Aplicación web para un instituto privado de inglés de Monteros, Tucumán. Next.js 16 + TypeScript en Vercel, Supabase (PostgreSQL, Auth, Storage, Realtime).

> Nombre y colores (azul marino y rojo) son los del instituto; el logo se muestra en texto hasta tener el archivo original, y lema, contacto y tipografía son **provisorios**. Se cambian en `src/config/institucion.ts`, `src/componentes/marca.tsx` y `src/app/globals.css`.

## Documentación

| | |
|---|---|
| [docs/01-producto.md](docs/01-producto.md) | Síntesis, supuestos, decisiones pendientes, módulos, recorridos, arquitectura y operación |
| [docs/02-permisos.md](docs/02-permisos.md) | Matriz de permisos por recurso y acción |
| [docs/03-modelo-de-datos.md](docs/03-modelo-de-datos.md) | Tablas, estados, restricciones y diseño de etapas 2–3 |
| [docs/04-backlog.md](docs/04-backlog.md) | Backlog priorizado con dependencias |
| [docs/05-criterios-aceptacion.md](docs/05-criterios-aceptacion.md) | Criterios de aceptación de la etapa 1 y su estado |
| [docs/06-indicadores.md](docs/06-indicadores.md) | Fórmulas del tablero |

## Estado

| | |
|---|---|
| **Operativo y verificado** | Base de datos de la etapa 1: 7 migraciones, RLS en todas las tablas, operaciones transaccionales. Pruebas automáticas contra PostgreSQL real. Lógica del asistente. Landing. |
| **Construido, sin verificar en ejecución** | Ingreso y pantallas del panel. Compilan, pero todavía no se probaron contra un proyecto de Supabase. |
| **Demostración** | `supabase/seed.sql` y `scripts/usuarios-demo.mjs` (datos y cuentas ficticias). La landing muestra una oferta de ejemplo cuando no hay base conectada. |
| **Integraciones pendientes** | Correo transaccional, pasarela de pagos, WhatsApp, proveedor de IA, emisión fiscal. |

## Puesta en marcha

Requisitos: Node 22+, pnpm 9.

```bash
pnpm install
pnpm test        # base de datos + unidad; no necesita Docker ni Supabase
pnpm dev         # landing en modo demostración si no hay .env.local
```

Para usar el panel hace falta un proyecto de Supabase:

1. Crear el proyecto (uno por entorno: desarrollo, pruebas, producción).
2. Copiar `.env.example` a `.env.local` y completar URL, clave publicable y clave secreta.
3. Aplicar las migraciones: `supabase link --project-ref <ref>` y `supabase db push`.
4. En Supabase → Authentication: **desactivar el registro abierto** y configurar la URL del sitio y `/auth/confirm` como redirección permitida. Plantillas de correo de invitación y recuperación apuntando a `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` (y `type=recovery`).
5. Solo en desarrollo o pruebas: cargar `supabase/seed.sql` y correr `node --env-file=.env.local scripts/usuarios-demo.mjs`.
6. Revisar el asesor de seguridad del proyecto antes de cargar datos reales.

Con Docker disponible, el entorno local completo es `supabase start` + `supabase db reset` (aplica migraciones y semilla).

## Estructura

```
supabase/migrations/   esquema, funciones y políticas (fuente de verdad)
supabase/seed.sql      datos ficticios de demostración
src/app/               landing, ingreso y panel (una carpeta por módulo)
src/lib/               sesión, permisos, formato, clientes de Supabase, asistente
src/componentes/       componentes de interfaz
src/config/            parámetros institucionales
tests/db/              criterios de aceptación contra PostgreSQL real
tests/unidad/          asistente, permisos y formato
```

## Convenciones

- Castellano en dominio, tablas, rutas e interfaz.
- La seguridad se decide en la base. Toda tabla nueva lleva RLS y permisos explícitos en su migración.
- Matrículas, pagos, imputaciones, obligaciones, vínculos y roles se escriben solo mediante funciones SQL.
- Lo confirmado no se edita: se ajusta o se reversa con motivo.
- Importes como `numeric`/string decimal; nunca coma flotante. Fechas y moneda con `src/lib/formato.ts`.
- La clave secreta de Supabase solo se usa en `src/lib/supabase/admin.ts`.
