/*
 * Service worker de la app instalable.
 *
 * Qué guarda y qué no:
 *  · Archivos estáticos de la app (/_next/static, íconos, fuentes, fotos):
 *    se guardan al usarlos y se sirven desde el teléfono (abre más rápido).
 *  · Páginas: SIEMPRE se piden a la red. Muchas son privadas (panel de cada
 *    persona), así que nunca se guardan. Si no hay conexión, se muestra
 *    /sin-conexion.html.
 *  · Formularios, acciones y datos (POST, /api, Supabase): no se tocan.
 *
 * Al cambiar algo de este archivo, subir VERSION: los teléfonos borran lo
 * guardado de la versión anterior.
 */
const VERSION = "v1";
const ESTATICOS = `oakland-estaticos-${VERSION}`;
const PRECARGA = `oakland-base-${VERSION}`;
const SIN_CONEXION = "/sin-conexion.html";

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches.open(PRECARGA)
      .then((cache) => cache.addAll([SIN_CONEXION, "/iconos/icono-192.png"]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((c) => c.startsWith("oakland-") && !c.endsWith(VERSION)).map((c) => caches.delete(c))))
      .then(() => self.clients.claim()),
  );
});

function esEstatico(url) {
  return url.pathname.startsWith("/_next/static/")
    || url.pathname.startsWith("/iconos/")
    || url.pathname.startsWith("/fotos/")
    || url.pathname.startsWith("/vendor/")
    || /\.(woff2?|png|jpe?g|webp|svg|ico)$/.test(url.pathname);
}

self.addEventListener("fetch", (evento) => {
  const pedido = evento.request;
  if (pedido.method !== "GET") return;
  const url = new URL(pedido.url);
  if (url.origin !== self.location.origin) return;

  // Páginas: red primero; sin conexión, la página de aviso.
  if (pedido.mode === "navigate") {
    evento.respondWith(
      fetch(pedido).catch(() => caches.match(SIN_CONEXION, { cacheName: PRECARGA })),
    );
    return;
  }

  if (!esEstatico(url)) return;
  // /_next/static lleva el hash en el nombre: nunca cambia, del teléfono primero.
  // Fotos e íconos pueden cambiar con el mismo nombre: se muestra lo guardado
  // y se actualiza en segundo plano para la próxima vez.
  const inmutable = url.pathname.startsWith("/_next/static/");
  evento.respondWith(
    caches.open(ESTATICOS).then(async (cache) => {
      const guardado = await cache.match(pedido);
      const deRed = fetch(pedido).then((respuesta) => {
        if (respuesta.ok && respuesta.type === "basic") cache.put(pedido, respuesta.clone());
        return respuesta;
      });
      if (guardado) {
        if (!inmutable) evento.waitUntil(deRed.catch(() => {}));
        return guardado;
      }
      return deRed;
    }),
  );
});
