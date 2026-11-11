/**
 * Marca en texto, con los colores del instituto. Es un reemplazo temporal:
 * cuando llegue el archivo original del logo (SVG o PNG con fondo
 * transparente) se cambia este componente por la imagen.
 */
export function Marca({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-1.5 leading-none ${className}`}>
      <span className="text-xl font-extrabold italic tracking-tight text-acento">Oakland</span>
      <span className="hidden text-xs font-bold uppercase tracking-[0.2em] text-marca min-[400px]:inline">Institute</span>
    </span>
  );
}
