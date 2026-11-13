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
 *  · Notificaciones (push): se muestran y, al tocarlas, abren la pantalla
 *    que corresponde (o enfocan la app si ya está abierta).
 *
 * Al cambiar algo de este archivo, subir VERSION: los teléfonos borran lo
 * guardado de la versión anterior.
 */
const VERSION = "v2";
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

// ---------------------------------------------------------------------------
// Notificaciones al celular
// ---------------------------------------------------------------------------
self.addEventListener("push", (evento) => {
  let datos = {};
  try { datos = evento.data ? evento.data.json() : {}; } catch { datos = { cuerpo: evento.data ? evento.data.text() : "" }; }
  evento.waitUntil(
    self.registration.showNotification(datos.titulo || "Oakland Institute", {
      body: datos.cuerpo || "",
      icon: "/iconos/icono-192.png",
      badge: "/iconos/insignia-96.png",
      lang: "es-AR",
      // Misma etiqueta = reemplaza a la anterior (por ejemplo, varios mensajes del mismo hilo).
      tag: datos.etiqueta || undefined,
      renotify: Boolean(datos.etiqueta),
      data: { url: datos.url || "/panel" },
    }),
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = new URL((evento.notification.data && evento.notification.data.url) || "/panel", self.location.origin);
  if (destino.origin !== self.location.origin) return;
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      const abierta = ventanas.find((v) => v.url.startsWith(self.location.origin));
      if (abierta) return abierta.focus().then((v) => (v && "navigate" in v ? v.navigate(destino.href) : v));
      return self.clients.openWindow(destino.href);
    }),
  );
});
