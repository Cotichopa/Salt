import "server-only";
import { db } from "@/lib/db";
import { normalize } from "@/lib/text";
import { sendText } from "@/lib/whatsapp/client";
import { whatsappOutbox } from "@/lib/whatsapp/outbox";
import { listCategories } from "@/lib/services/categories";
import { isAiEnabled, parseMessage } from "@/lib/whatsapp/ai-parser";
import { listPaymentSources } from "@/lib/services/payment-sources";
import { parseQuick } from "@/lib/whatsapp/quick-parser";
import {
  handleDelete,
  handleEdit,
  handleMenu,
  handleQuery,
  proposeExpenses,
  showMainMenu,
  startDeleteLast,
  type Ctx,
  type Input,
} from "@/lib/whatsapp/menu";
import { clearSession, getSession } from "@/lib/whatsapp/session";
import type { IncomingMessage } from "@/lib/whatsapp/webhook";

// Chop, el bot de Salt. handleMessage recibe lo que llega por WhatsApp y handleInput es el
// "cerebro", que también usa el chat de la web (src/lib/actions/chop.ts).

const MENU_WORDS = ["menu", "hola", "inicio", "ayuda", "buenas", "buen dia", "empezar"];
const CANCEL_WORDS = ["cancelar", "salir", "chau"];
const DELETE_LAST = ["borrar ultimo", "eliminar ultimo", "borrar el ultimo", "eliminar el ultimo"];

/** Mensaje que llega por WhatsApp: identifica a la persona por su teléfono y se lo pasa a Chop */
export async function handleMessage(msg: IncomingMessage) {
  // Solo atendemos a cuentas activas cuyo teléfono esté cargado en Salt
  const user = await db.user.findFirst({ where: { phone: msg.from, active: true }, select: { id: true, name: true } });
  if (!user) {
    await sendText(msg.from, "Hola 👋 Soy Chop, el asistente de gastos de Salt. Este número no está registrado, así que no puedo ayudarte todavía. Pedile al administrador que lo cargue en tu cuenta.");
    return;
  }
  const input: Input = {
    text: msg.text?.body,
    replyId: msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id,
  };
  if (!input.text && !input.replyId) {
    await sendText(msg.from, "Todavía no escucho audios 🙉 Escribímelo y lo cargo al toque, o escribí *menu* para ver las opciones.");
    return;
  }
  const ctx: Ctx = { userId: user.id, name: user.name, phone: msg.from, out: whatsappOutbox(msg.from), source: "WHATSAPP" };
  await handleInput(ctx, input);
}

/**
 * El "cerebro" de Chop, igual para WhatsApp y para el chat de la web: atiende los comandos
 * que valen siempre (menu, cancelar...), sigue el menú paso a paso o le pregunta a la IA.
 */
export async function handleInput(ctx: Ctx, input: Input) {
  const text = normalize(input.text ?? "").replace(/[!¡?¿.]/g, "");
  if (MENU_WORDS.includes(text)) return showMainMenu(ctx, `¡Hola ${ctx.name}! 👋 Soy *Chop*. Contame un gasto (ej: _"nafta 15000"_) o elegí una opción:`);
  if (CANCEL_WORDS.includes(text)) {
    await clearSession(ctx.phone);
    return ctx.out.text("Listo, cancelado 👌 Escribime cuando quieras.");
  }
  if (DELETE_LAST.includes(text)) return startDeleteLast(ctx);

  const session = await getSession(ctx.phone);
  if (await handleMenu(ctx, input, session)) return;

  // Nada en curso: primero probamos sin IA (gratis) y, si no alcanza, le preguntamos a la IA
  if (input.text) {
    const [categories, sources] = await Promise.all([listCategories(ctx.userId), listPaymentSources(ctx.userId)]);

    // Mensajes simples de carga ("nafta 15000"): se entienden con reglas, sin gastar tokens
    const quick = parseQuick(input.text, categories, sources);
    if (quick) {
      console.log("[quick-parser] resuelto sin IA");
      if (await proposeExpenses(ctx, [quick])) return;
    }

    if (isAiEnabled()) return askAI(ctx, input.text, categories, sources);
  }

  await showMainMenu(ctx, "No te entendí 🤔 Probá escribiendo el gasto (ej: _\"super 12500 debito\"_) o elegí una opción:");
}

/** Le pregunta a la IA qué quiso decir la persona y actúa en consecuencia */
async function askAI(
  ctx: Ctx,
  text: string,
  categories: Awaited<ReturnType<typeof listCategories>>,
  sources: Awaited<ReturnType<typeof listPaymentSources>>,
) {
  const parsed = await parseMessage(text, {
    categories: categories.map((c) => c.name),
    sources: sources.map((s) => s.name),
  });

  if (parsed === null) {
    // La IA no está disponible (sin crédito, sin internet, error): seguimos con el menú
    await showMainMenu(ctx, "Uf, no pude interpretar eso 😕 Probá con el menú:");
    return;
  }
  if (parsed.intent === "cargar" && (await proposeExpenses(ctx, parsed.expenses))) return;
  if (parsed.intent === "consultar") return void (await handleQuery(ctx, parsed));
  if (parsed.intent === "eliminar") return void (await handleDelete(ctx, parsed.target));
  if (parsed.intent === "editar") return void (await handleEdit(ctx, parsed.target, parsed.changes));
  // No entendió del todo: repregunta en vez de tirar el menú de una
  if (parsed.intent === "otro" && parsed.question) {
    await ctx.out.text(`${parsed.question}\n\n_Escribí *menu* si preferís los botones._`);
    return;
  }

  await showMainMenu(ctx, "No te entendí 🤔 Probá escribiendo el gasto (ej: _\"super 12500 debito\"_) o elegí una opción:");
}
