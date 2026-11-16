# Lanzamiento: de la demo al sistema real

Lista para pasar de la demo (`oakland.2-25-185-242.sslip.io`, base de
desarrollo con datos inventados) a `oaklandinstitute.com.ar` con los datos del
instituto. Seguir en orden; cada paso dice quién lo hace.

## 1. Base de datos de producción (Digital Amenities)

1. Crear un proyecto de Supabase nuevo para producción (región São Paulo,
   `sa-east-1`, la más cercana). Plan Pro: incluye copias diarias de 7 días;
   el plan gratuito no tiene copias y pausa el proyecto si no se usa.
2. Aplicar las migraciones:
   `supabase db push --db-url "postgresql://postgres.<ref>:<clave>@<pooler>:5432/postgres"`.
   **No** cargar `supabase/seed.sql` ni `instalacion-inicial.sql`: tienen datos
   de ejemplo.
3. Authentication → Sign In / Providers: **desactivar** «Allow new users to sign
   up» (las cuentas se crean solo por invitación).
4. Authentication → URL Configuration: Site URL `https://oaklandinstitute.com.ar`
   y en Redirect URLs `https://oaklandinstitute.com.ar/**`.

## 2. Correo propio (Digital Amenities + instituto)

El correo integrado de Supabase manda muy pocos mensajes por hora y desde una
dirección genérica. Con SMTP propio llegan las invitaciones y los cambios de
contraseña con el nombre del instituto.

1. Elegir proveedor: Brevo (300 correos por día gratis) o Resend (3.000 por mes
   gratis). Crear la cuenta a nombre del instituto.
2. Verificar el dominio `oaklandinstitute.com.ar` en el proveedor: agregar en el
   DNS los registros SPF, DKIM y DMARC que indique.
3. Supabase → Authentication → Emails → SMTP Settings: host, puerto 587, usuario
   y clave del proveedor; remitente `Oakland Institute <hola@oaklandinstitute.com.ar>`.
4. Authentication → Rate Limits: subir «emails per hour» a 100.
5. Authentication → Emails → Templates: pegar
   - «Invite user» → asunto «Te damos la bienvenida a Oakland Institute» y el
     HTML de `supabase/plantillas/invitacion.html`;
   - «Reset password» → asunto «Elegí una contraseña nueva» y el HTML de
     `supabase/plantillas/recuperacion.html`.
6. Probar: desde Equipo, invitar a una cuenta de prueba propia; abrir el correo,
   elegir la contraseña y entrar.

## 3. Variables del servidor (Digital Amenities)

Crear `.env.produccion` (no se sube a git) con los datos del proyecto nuevo:

```
NEXT_PUBLIC_ENTORNO=produccion
NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=…
SUPABASE_SECRET_KEY=…
NEXT_PUBLIC_SITIO_URL=https://oaklandinstitute.com.ar
CRON_SECRET=<texto largo al azar>
NEXT_PUBLIC_VAPID_PUBLIC_KEY=…   # generar un par nuevo para producción
VAPID_PRIVATE_KEY=…
# Oakland AI con Claude (opcional; sin esto cita la ayuda aprobada tal cual)
ASISTENTE_PROVEEDOR=anthropic
ANTHROPIC_API_KEY=…
# Cuotas automáticas el día 1 (por defecto: activadas, vencen el 10)
CUOTAS_DIA_VENCIMIENTO=10
```

Sin `DEMO_CLAVE`: en producción no existen las cuentas de prueba. Con
`NEXT_PUBLIC_ENTORNO=produccion` desaparecen la franja «Sitio en preparación» y
el rótulo de demo de Oakland AI.

Subir y publicar:

```
ARCHIVO=.env.produccion sh scripts/vps/subir-variables.sh oaklandinstitute.com.ar
ssh mr-vps 'bash /home/oakland/oakland-institute/scripts/vps/instalar.sh oaklandinstitute.com.ar www'
```

## 4. Primera cuenta de dirección (Digital Amenities)

En el SQL Editor del proyecto nuevo, crear a Abril como persona. Después,
invitarla desde Supabase → Authentication → Users → Invite, y asociar la cuenta:

```sql
insert into public.personas (nombres, apellidos) values ('Abril', 'Assad') returning id;
-- con el id de la persona y el de la cuenta invitada:
insert into public.cuentas (id, persona_id) values ('<id de auth.users>', '<id de persona>');
insert into public.roles_asignados (cuenta_id, rol) values ('<id de auth.users>', 'direccion');
```

Desde ahí, Abril suma al resto del equipo en **Instituto → Equipo**.

## 5. Carga inicial (instituto, con acompañamiento)

1. **Oferta académica:** sede, ciclo lectivo, cursos (con su descripción para la
   web), niveles y aulas.
2. **Aranceles y becas:** precio de matrícula y de cuota; becas y descuentos.
3. **Comisiones** con horarios y docentes.
4. **Estudiantes:** Estudiantes → «Importar desde una planilla» (descargar la
   planilla modelo). Después, inscribirlos en sus comisiones.
5. **Sitio web:** textos, contacto, redes y anuncio.

## 6. Pendientes del instituto

- **Logo original** (SVG o PNG con fondo transparente): reemplaza a la marca en
  texto (`src/componentes/marca.tsx`).
- **Política de privacidad** (`/privacidad`) y texto del formulario: revisión
  legal y datos del responsable (razón social, CUIT, email de contacto).
  Inscribir la base en el Registro Nacional de Bases de Datos (AAIP).
- **Email de contacto** del instituto para el sitio.

## 7. Copias de seguridad (Digital Amenities)

Además de las copias del plan Pro de Supabase, el servidor guarda una copia
propia de los datos cada día (14 diarias y 8 semanales):

1. En el VPS: instalar `postgresql-client-17` o más nuevo (repositorio de
   PostgreSQL, `apt.postgresql.org`). La versión de Ubuntu suele ser vieja.
2. Crear `/etc/oakland/copia.env` (root, permisos 600) con
   `BASE_URL=postgresql://postgres.<ref>:<clave>@<pooler>:5432/postgres`
   y, para una copia fuera del servidor, `RCLONE_DESTINO=…` (rclone configurado).
3. `instalar.sh` ya programa la copia diaria a las 03:30. Probarla a mano:
   `sh /home/oakland/oakland-institute/scripts/vps/copia-seguridad.sh`.
4. **Simulacro de restauración** (una vez por trimestre): desde la Mac,
   `SIMULACRO_ORIGEN="postgresql://…" node scripts/simulacro-restauracion.mjs`.
   Arma una base vacía con las migraciones, carga la copia y compara las filas
   de cada tabla. Primer simulacro: 16/11/2026 sobre la base de desarrollo,
   71 tablas y 590 filas, todas iguales.
5. Restaurar de verdad: proyecto nuevo con las migraciones aplicadas y
   `sh scripts/restaurar-copia.sh <copia.sql.gz> "<conexión>"`.

Los archivos subidos (comprobantes, audios, biblioteca) están en Supabase
Storage: los cubre la copia del plan Pro. Para tener otra copia, rclone puede
sincronizar los buckets con las claves S3 de Storage.
