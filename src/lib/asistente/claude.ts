import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import type { ProveedorIA } from "./tipos";

/** Modelo por defecto; se cambia con ASISTENTE_MODELO sin tocar código. */
const MODELO = "claude-opus-5-5";

/**
 * Proveedor de IA con Claude (Anthropic). Al modelo solo viajan la pregunta y
 * fragmentos de documentación aprobada (ver responder.ts): nunca datos
 * personales ni económicos.
 *
 * - El esfuerzo va en «low»: son respuestas cortas de ayuda, no razonamiento
 *   largo. El modelo piensa siempre; `max_tokens` deja lugar para eso y el
 *   largo de la respuesta lo fija la instrucción del sistema.
 * - Si el modelo declina por política, la API reintenta sola con el modelo de
 *   respaldo que elige Anthropic (`fallbacks: "default"`). Si igual declina,
 *   se lanza un error y responder.ts muestra la documentación tal cual.
 * - Timeout corto y un solo reintento: es un chat, no puede quedar colgado.
 */
export function proveedorClaude(apiKey: string): ProveedorIA {
  const cliente = new Anthropic({ apiKey, timeout: 25_000, maxRetries: 1 });
  const modelo = process.env.ASISTENTE_MODELO || MODELO;
  return {
    nombre: `claude:${modelo}`,
    async generar({ sistema, usuario, maxTokens }) {
      const respuesta = await cliente.beta.messages.create({
        model: modelo,
        max_tokens: maxTokens,
        system: [{ type: "text", text: sistema, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: usuario }],
        output_config: { effort: "low" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
      if (respuesta.stop_reason === "refusal") throw new Error("El modelo declinó responder.");
      const texto = respuesta.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("")
        .trim();
      return { texto, tokensEntrada: respuesta.usage.input_tokens, tokensSalida: respuesta.usage.output_tokens };
    },
  };
}
