import "server-only";
import { after } from "next/server";
import * as webpush from "web-push";
import { crearClienteAdmin } from "@/lib/supabase/admin";

/**
 * Envío de notificaciones al celular (Web Push). La base encola (triggers de
 * avisos, mensajes, actividades, devoluciones y material) y acá se mandan a
 * cada teléfono suscripto, firmadas con las claves VAPID del instituto.
 */

interface Suscripcion { id: string; endpoint: string; p256dh: string; auth: string }
interface Pendiente { id: string; titulo: string; cuerpo: string; url: string; etiqueta: string | null; suscripciones: Suscripcion[] }

let configurado = false;
function configurar(): boolean {
  if (configurado) return true;
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privada = process.env.VAPID_PRIVATE_KEY;
  if (!publica || !privada) return false;
  // El «subject» identifica al remitente ante Google/Apple/Mozilla: el sitio del instituto.
  const sitio = process.env.NEXT_PUBLIC_SITIO_URL ?? "";
  webpush.setVapidDetails(sitio.startsWith("https://") ? sitio : "https://oakland.2-25-185-242.sslip.io", publica, privada);
  configurado = true;
  return true;
}

export function pushConfigurado() {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

/** Manda lo pendiente. Devuelve cuántas salieron, cuántas fallaron y cuántos teléfonos se dieron de baja. */
export async function enviarPendientes(limite = 100) {
  const resumen = { enviadas: 0, fallidas: 0, bajas: 0 };
  if (!configurar()) return resumen;
  const admin = crearClienteAdmin();
  const { data, error } = await admin.rpc("tomar_notificaciones_push", { p_limite: limite });
  if (error || !data) return resumen;

  for (const n of data as Pendiente[]) {
    const carga = JSON.stringify({ titulo: n.titulo, cuerpo: n.cuerpo, url: n.url, etiqueta: n.etiqueta });
    let reintentar: string | null = null;
    await Promise.all(n.suscripciones.map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga, { TTL: 24 * 60 * 60, urgency: "normal" });
        await admin.from("suscripciones_push").update({ usada_en: new Date().toISOString(), fallos: 0 }).eq("id", s.id);
      } catch (e) {
        const estado = (e as { statusCode?: number }).statusCode ?? 0;
        if (estado === 404 || estado === 410) {
          // El teléfono desinstaló la app o revocó el permiso: se borra.
          await admin.from("suscripciones_push").delete().eq("id", s.id);
          resumen.bajas++;
        } else if (estado === 429 || estado >= 500 || estado === 0) {
          reintentar = `HTTP ${estado || "sin respuesta"}`;
        } else {
          // Rechazo permanente (claves inválidas, etc.): no se reintenta; tras 3 se borra el teléfono.
          const { data: fila } = await admin.from("suscripciones_push").select("fallos").eq("id", s.id).maybeSingle();
          const fallos = (fila?.fallos ?? 0) + 1;
          if (fallos >= 3) { await admin.from("suscripciones_push").delete().eq("id", s.id); resumen.bajas++; }
          else await admin.from("suscripciones_push").update({ fallos }).eq("id", s.id);
        }
      }
    }));
    if (reintentar) {
      resumen.fallidas++;
      await admin.from("notificaciones_push").update({ error: reintentar }).eq("id", n.id);
    } else {
      resumen.enviadas++;
      await admin.from("notificaciones_push").update({ enviada_en: new Date().toISOString(), error: null }).eq("id", n.id);
    }
  }
  return resumen;
}

/**
 * Después de responder al usuario, manda lo que se encoló en esta acción
 * (avisos, mensajes, etc.). Si algo falla, la tarea de cada minuto lo reintenta.
 */
export function despacharPush() {
  if (!pushConfigurado()) return;
  after(() => enviarPendientes().then(() => undefined, () => undefined));
}
