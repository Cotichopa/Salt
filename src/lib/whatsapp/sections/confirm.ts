import "server-only";
import { normalize } from "@/lib/text";
import type { Section } from "@/lib/whatsapp/ai-parser";
import type { Ctx, Input } from "@/lib/whatsapp/menu";
import { setSession, type PendingAction } from "@/lib/whatsapp/session";

// Confirmación genérica de las secciones (fijos, tarjetas...): Chop guarda en la sesión QUÉ va a
// hacer (la acción) y lo hace recién cuando la persona toca una opción. Las opciones son hasta 2
// botones más "Cancelar" (WhatsApp permite 3). Quién ejecuta cada acción: sections/index.ts.

const YES = ["si", "dale", "ok", "confirmo", "confirmar", "sip", "obvio", "listo", "de una"];
const NO = ["no", "cancelar", "cancela", "nada", "dejalo"];

export async function askConfirm(ctx: Ctx, action: PendingAction) {
  await setSession(ctx.phone, "confirm:action", { action });
  await ctx.out.buttons(action.body, [
    ...action.options.map((o) => ({ id: `act:${o.id}`, title: o.title })),
    { id: "act:no", title: "❌ Cancelar" },
  ]);
  return true;
}

/**
 * Chop pregunta algo que falta ("¿cuál es el nombre nuevo?") y se acuerda de qué preguntó: la
 * respuesta ("Market") se interpreta junto con el mensaje original (ver bot.ts). `extra` va después
 * de la pregunta (ejemplos, "escribí menu...").
 */
export async function askFollowup(ctx: Ctx, section: Section | undefined, text: string, question: string, extra = "") {
  await setSession(ctx.phone, "followup", { followup: { section, text, question } });
  await ctx.out.text(`${question}${extra}`);
  return true;
}

/** Qué eligió: el id de una opción, "no" si canceló, o null si no se entiende */
export function readConfirm(input: Input, action: PendingAction): string | null {
  const id = input.replyId;
  if (id?.startsWith("act:")) {
    const option = id.slice(4);
    return option === "no" || action.options.some((o) => o.id === option) ? option : null;
  }
  const text = normalize(input.text ?? "").replace(/[!¡?¿.]/g, "");
  if (NO.includes(text)) return "no";
  const byWords = action.options.find((o) => o.words?.some((w) => text === w || text.includes(w)));
  if (byWords) return byWords.id;
  // "sí" elige la primera opción (la principal)
  return YES.includes(text) ? action.options[0].id : null;
}
