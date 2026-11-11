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

## Despliegue en el VPS (actual)

Producción corre en el VPS de Digital Amenities (Ubuntu + Caddy + systemd), igual que las demás apps del servidor:
usuario `oakland`, código en `/home/oakland/oakland-institute`, variables en `/etc/oakland/app.env`,
servicio `oakland.service` en `127.0.0.1:3140`, sitio en `/etc/caddy/oakland.caddy` y tarea diaria en `/etc/cron.d/oakland`.

```bash
sh scripts/vps/subir-variables.sh <dominio>                      # copia las variables (sin la contraseña de la base)
ssh mr-vps 'bash -s' -- <dominio> [www] < scripts/vps/instalar.sh  # instala o actualiza desde GitHub, compila y recarga Caddy
```

Para publicar cambios: push a `main` y volver a correr `instalar.sh` con el mismo dominio.

## Despliegue en Vercel

1. Importar el repositorio en el equipo de Vercel (Add New → Project). Framework: Next.js; no hace falta configurar comandos.
2. Variables de entorno (Production y Preview), copiando los valores de `.env.local`:
   `NEXT_PUBLIC_ENTORNO`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`,
   `NEXT_PUBLIC_SITIO_URL` (la URL pública, p. ej. `https://oakland-institute.vercel.app`), `CRON_SECRET`, `DEMO_CLAVE`, `ASISTENTE_PROVEEDOR`.
   Para la demo con acceso de un clic: `NEXT_PUBLIC_ENTORNO=desarrollo`. En producción real: `produccion` y sin `DEMO_CLAVE`.
3. Desplegar. `vercel.json` programa la tarea diaria `/api/tareas/diaria` (revisión de alertas), protegida con `CRON_SECRET`.
4. En Supabase → Authentication → URL Configuration: poner la URL pública como **Site URL** y agregar `https://<dominio>/**` en **Redirect URLs**.
5. Antes de usar con personas reales: SMTP propio en Supabase (el correo integrado envía muy pocos mensajes por hora) y regenerar la clave secreta.

Los enlaces de invitación usan la plantilla estándar de Supabase y llegan a `/auth/bienvenida`; los de recuperación, a `/auth/confirm`. Con SMTP propio se pueden personalizar las plantillas (ver `src/app/auth/confirm/route.ts`).

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
