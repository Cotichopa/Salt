import "server-only";
import { db } from "@/lib/db";
import { normalize } from "@/lib/text";
import { sendText } from "@/lib/whatsapp/client";
import { listCategories } from "@/lib/services/categories";
import { isAiEnabled, parseWithAI } from "@/lib/whatsapp/ai-parser";
import { handleMenu, proposeExpenses, showMainMenu, startDeleteLast, type Ctx, type Input } from "@/lib/whatsapp/menu";
import { clearSession, getSession } from "@/lib/whatsapp/session";
import type { IncomingMessage } from "@/lib/whatsapp/webhook";

// El "cerebro" de Chop (el bot de Salt): identifica a la persona, atiende los comandos
// que valen siempre (menu, cancelar...) y le pasa el resto al menú paso a paso.

const MENU_WORDS = ["menu", "hola", "inicio", "ayuda", "buenas", "buen dia", "empezar"];
const CANCEL_WORDS = ["cancelar", "salir", "chau"];
const DELETE_LAST = ["borrar ultimo", "eliminar ultimo", "borrar el ultimo", "eliminar el ultimo"];

export async function handleMessage(msg: IncomingMessage) {
  // Solo atendemos a cuentas activas cuyo teléfono esté cargado en Salt
  const user = await db.user.findFirst({ where: { phone: msg.from, active: true }, select: { id: true, name: true } });
  if (!user) {
    await sendText(msg.from, "Hola 👋 Soy Chop, el asistente de gastos de Salt. Este número no está registrado, así que no puedo ayudarte todavía. Pedile al administrador que lo cargue en tu cuenta.");
    return;
  }
  const ctx: Ctx = { userId: user.id, name: user.name, phone: msg.from };

  const input: Input = {
    text: msg.text?.body,
    replyId: msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id,
  };
  if (!input.text && !input.replyId) {
    await sendText(msg.from, "Todavía no escucho audios 🙉 Escribímelo y lo cargo al toque, o escribí *menu* para ver las opciones.");
    return;
  }

  const text = normalize(input.text ?? "").replace(/[!¡?¿.]/g, "");
  if (MENU_WORDS.includes(text)) return showMainMenu(ctx, `¡Hola ${user.name}! 👋 Soy *Chop*. Contame un gasto (ej: _"nafta 15000"_) o elegí una opción:`);
  if (CANCEL_WORDS.includes(text)) {
    await clearSession(ctx.phone);
    return sendText(ctx.phone, "Listo, cancelado 👌 Escribime cuando quieras.");
  }
  if (DELETE_LAST.includes(text)) return startDeleteLast(ctx);

  const session = await getSession(ctx.phone);
  if (await handleMenu(ctx, input, session)) return;

  // Nada en curso: probamos interpretar el mensaje tal como está escrito
  // ("ayer 3 lucas en el chino con débito") con la IA.
  if (input.text && isAiEnabled()) {
    const categories = await listCategories(ctx.userId);
    const parsed = await parseWithAI(input.text, categories.map((c) => c.name));

    if (parsed === null) {
      // La IA no está disponible (sin crédito, sin internet, error): seguimos con el menú
      await showMainMenu(ctx, "Uf, no pude interpretar eso 😕 Probá con el menú:");
      return;
    }
    if (parsed.length > 0 && (await proposeExpenses(ctx, parsed))) return;
  }

  await showMainMenu(ctx, "No te entendí 🤔 Probá escribiendo el gasto (ej: _\"super 12500 debito\"_) o elegí una opción:");
}
