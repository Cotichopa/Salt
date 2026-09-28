import "server-only";
import type { Section } from "@/lib/whatsapp/ai-parser";
import { BACK, showMainMenu, type Ctx, type Input } from "@/lib/whatsapp/menu";
import { askConfirm, readConfirm } from "@/lib/whatsapp/sections/confirm";
import { handleFixed, receiveFixed, runFixedAction, showFixedList } from "@/lib/whatsapp/sections/fijos";
import { clearSession, type Session } from "@/lib/whatsapp/session";

// Las otras partes de la app que maneja Chop, además de los gastos (por ahora, los fijos).
// bot.ts llama acá: handleSectionState para seguir una conversación de una sección, y
// handleSection cuando un mensaje nuevo es de una sección.

/** Mensaje nuevo de una sección. `list`: mostrar la lista sin IA. false si la IA no respondió. */
export async function handleSection(ctx: Ctx, section: Section, text: string, list = false): Promise<boolean> {
  switch (section) {
    case "fijo":
      return list ? showFixedList(ctx) : handleFixed(ctx, text);
  }
}

/** Sigue una conversación en curso de una sección (una confirmación o un fijo a medio crear) */
export async function handleSectionState(ctx: Ctx, input: Input, session: Session | null): Promise<boolean> {
  const id = input.replyId;
  // Los botones del menú y "Deshacer" los atiende menu.ts en cualquier momento
  if (id?.startsWith("menu:") || id?.startsWith("undo:")) return false;

  if (session?.state === "confirm:action" && session.data.action) {
    const action = session.data.action;
    const choice = readConfirm(input, action);
    if (choice === null) return askConfirm(ctx, action); // no se entendió: se vuelve a preguntar
    await clearSession(ctx.phone);
    if (choice === "no") {
      await ctx.out.text(`Listo, no cambié nada 👌${BACK}`);
      return true;
    }
    await runAction(ctx, action.type, action.data, choice);
    return true;
  }
  if (session?.state === "fixed:new") return receiveFixed(ctx, input, session.data);

  // Un botón de confirmación viejo, de una conversación que ya terminó
  if (id?.startsWith("act:")) {
    await showMainMenu(ctx, "Esa opción ya venció ⏳ Arranquemos de nuevo:");
    return true;
  }
  return false;
}

async function runAction(ctx: Ctx, type: string, data: Record<string, unknown>, option: string) {
  if (type.startsWith("fixed:")) return runFixedAction(ctx, type, data, option);
  await ctx.out.text(`No sé hacer eso todavía 🤔${BACK}`);
}
