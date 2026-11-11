// Módulo común (sin "use client"): lo usan la página de servidor y el formulario.
export const ESTADOS = [
  ["nueva", "Nueva"], ["contactada", "Contactada"], ["nivelacion", "En nivelación"],
  ["solicitud", "Con solicitud"], ["ganada", "Inscripta"], ["perdida", "Perdida"],
] as const;
