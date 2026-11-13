import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cache Components queda desactivado a propósito: casi todas las pantallas
  // dependen de la sesión y preferimos render dinámico por pedido antes que
  // arriesgar contenido cacheado entre usuarios. Se puede activar más adelante
  // para la landing siguiendo la guía de autenticación de Next.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    return [
      {
        // Service worker: siempre la última versión (si no, los teléfonos se quedan con la vieja).
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
      {
        source: "/panel/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

export default nextConfig;
