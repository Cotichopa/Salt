import "server-only";
import type { Section, SectionQuick } from "@/lib/whatsapp/ai-parser";
import { BACK, showMainMenu, type Ctx, type Input } from "@/lib/whatsapp/menu";
import { askConfirm, readConfirm } from "@/lib/whatsapp/sections/confirm";
import { handleFixed, receiveFixed, runFixedAction, showFixedList } from "@/lib/whatsapp/sections/fijos";
import { handleCategories, receiveNewCategory, runCategoryAction, showCategoriesList } from "@/lib/whatsapp/sections/categorias";
import { handleMenuButtons, sendPicker } from "@/lib/whatsapp/sections/listas";
import { handleBudgets, receiveBudgetAmount, runBudgetAction, showBudgetsList } from "@/lib/whatsapp/sections/presupuestos";
import {
  handleCards,
  handleCardsQuick,
  markPaidButton,
  receiveNewSource,
  runCardAction,
  showSourcesList,
  undoPaid,
} from "@/lib/whatsapp/sections/tarjetas";
import { clearSession, type Session } from "@/lib/whatsapp/session";

// Las otras partes de la app que maneja Chop, además de los gastos: fijos, tarjetas, presupuestos,
// categorías y el menú de botones.
// bot.ts llama acá: handleSectionState para seguir una conversación de una sección, y
// handleSection cuando un mensaje nuevo es de una sección.

/** Mensaje nuevo de una sección. Con `quick`, sin IA. false si no se pudo resolver. */
export async function handleSection(ctx: Ctx, section: Section, text: string, quick?: SectionQuick): Promise<boolean> {
  const list = quick?.action === "listar";
  switch (section) {
    case "fijo":
      return list ? showFixedList(ctx) : handleFixed(ctx, text);
    case "presupuesto":
      return list ? showBudgetsList(ctx) : handleBudgets(ctx, text);
    case "categoria":
      return list ? showCategoriesList(ctx) : handleCategories(ctx, text);
    case "tarjeta":
      if (list) return showSourcesList(ctx);
      if (quick) return handleCardsQuick(ctx, quick.action as "pagar" | "resumen", quick.name);
      return handleCards(ctx, text);
  }
}

/** Sigue una conversación en curso de una sección (una confirmación o un fijo a medio crear) */
export async function handleSectionState(ctx: Ctx, input: Input, session: Session | null): Promise<boolean> {
  const id = input.replyId;
  // El menú (➕ Agregar · 📊 Consultar · 🗑️ Eliminar) y sus listas valen en cualquier momento
  if (await handleMenuButtons(ctx, input, session)) return true;
  // "Deshacer" y los demás botones del menú los atiende menu.ts en cualquier momento
  if (id?.startsWith("menu:") || id?.startsWith("undo:")) return false;
  // Botones de los resúmenes, que valen en cualquier momento: "pay:<tarjeta>:<mes>"
  if (id?.startsWith("pay:") || id?.startsWith("unpay:")) {
    const [kind, cardId, month] = id.split(":");
    return kind === "pay" ? markPaidButton(ctx, cardId, month) : undoPaid(ctx, cardId, month);
  }

  if (session?.state === "confirm:action" && session.data.action) {
    const action = session.data.action;
    const choice = readConfirm(input, action);
    if (choice === null) {
      // Escribió otra cosa: se deja la confirmación y el mensaje sigue su camino (a otra consulta, un gasto...)
      if (input.text) {
        await clearSession(ctx.phone);
        return false;
      }
      return askConfirm(ctx, action); // un botón que no corresponde: se vuelve a preguntar
    }
    await clearSession(ctx.phone);
    if (choice === "no") {
      await ctx.out.text(`Listo, no cambié nada 👌${BACK}`);
      return true;
    }
    await runAction(ctx, action.type, action.data, choice);
    return true;
  }
  if (session?.state === "fixed:new") return receiveFixed(ctx, input, session.data);
  if (session?.state === "card:new") return receiveNewSource(ctx, input, session.data);
  if (session?.state === "budget:new") return receiveBudgetAmount(ctx, input, session.data);
  if (session?.state === "category:new") return receiveNewCategory(ctx, input);

  // Un botón de confirmación viejo, de una conversación que ya terminó
  if (id?.startsWith("act:")) {
    await showMainMenu(ctx, "Esa opción ya venció ⏳ Arranquemos de nuevo:");
    return true;
  }
  return false;
}

async function runAction(ctx: Ctx, type: string, data: Record<string, unknown>, option: string) {
  if (type.startsWith("fixed:")) return runFixedAction(ctx, type, data, option);
  if (type.startsWith("card:")) return runCardAction(ctx, type, data, option);
  if (type.startsWith("budget:")) return runBudgetAction(ctx, type, data);
  if (type.startsWith("category:")) {
    // "Pasar los gastos a otra": se elige a cuál de la lista
    if ((await runCategoryAction(ctx, type, data, option)) === "move") await sendPicker(ctx, `movecat.${data.id}`);
    return;
  }
  await ctx.out.text(`No sé hacer eso todavía 🤔${BACK}`);
}
