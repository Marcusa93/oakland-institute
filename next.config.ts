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
        source: "/panel/:path*",
        headers: [{ key: "Cache-Control", value: "private, no-store" }],
      },
    ];
  },
};

export default nextConfig;
