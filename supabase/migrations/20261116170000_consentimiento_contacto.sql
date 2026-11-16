-- =====================================================================
-- Texto de consentimiento del formulario de consulta (versión 2)
--
-- Reemplaza al texto provisorio de los datos de ejemplo. La política
-- completa está en /privacidad. Las consultas ya recibidas conservan la
-- versión que aceptaron (consentimientos.version_id).
-- REVISIÓN LEGAL: confirmar con el instituto antes del lanzamiento.
-- =====================================================================
-- Versión fija (2): la 1 es el texto provisorio de los datos de ejemplo.
insert into public.versiones_consentimiento (tipo, version, texto)
values ('contacto_web', 2,
  'Acepto que Oakland Institute use estos datos solo para responder mi consulta y contarme sobre sus cursos. Puedo pedir verlos, corregirlos o borrarlos cuando quiera (ver la política de privacidad).')
on conflict (tipo, version) do nothing;
