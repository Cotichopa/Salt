import "server-only";
import { db } from "@/lib/db";
import { normalize } from "@/lib/text";
import { downloadMedia, sendText } from "@/lib/whatsapp/client";
import { isTranscriptionEnabled, transcribeAudio, transcriptionProblem } from "@/lib/transcribe";
import { whatsappOutbox } from "@/lib/whatsapp/outbox";
import { listCategories } from "@/lib/services/categories";
import { isAiEnabled, parseMessage } from "@/lib/whatsapp/ai-parser";
import { ReceiptError } from "@/lib/services/receipts";
import { readReceipt, receiptKind, type ReceiptKind } from "@/lib/services/receipt-reading";
import { listPaymentSources } from "@/lib/services/payment-sources";
import { isDeleteLast, parseWithoutAI } from "@/lib/whatsapp/quick-parser";
import {
  handleDelete,
  handleEdit,
  handleMenu,
  handleQuery,
  proposeExpenses,
  showMainMenu,
  type Ctx,
  type Input,
} from "@/lib/whatsapp/menu";
import { clearSession, getSession } from "@/lib/whatsapp/session";
import { loadDueRecurring } from "@/lib/services/recurring";
import { pendingNotices } from "@/lib/services/notices";
import { handleSection, handleSectionState } from "@/lib/whatsapp/sections";
import { askFollowup } from "@/lib/whatsapp/sections/confirm";
import { loadedFixedText } from "@/lib/whatsapp/sections/fijos";
import type { IncomingMessage } from "@/lib/whatsapp/webhook";

// Chop, el bot de Salt. handleMessage recibe lo que llega por WhatsApp y handleInput es el
// "cerebro", que también usa el chat de la web (src/lib/actions/chop.ts).

const MENU_WORDS = ["menu", "hola", "inicio", "ayuda", "buenas", "buen dia", "empezar"];
const CANCEL_WORDS = ["cancelar", "salir", "chau"];

/** Mensaje que llega por WhatsApp: identifica a la persona por su teléfono y se lo pasa a Chop */
export async function handleMessage(msg: IncomingMessage) {
  // Solo atendemos a cuentas activas cuyo teléfono esté cargado en Salt
  const user = await db.user.findFirst({ where: { phone: msg.from, active: true }, select: { id: true, name: true } });
  if (!user) {
    await sendText(msg.from, "Hola 👋 Soy Chop, el asistente de gastos de Salt. Este número no está registrado, así que no puedo ayudarte todavía. Pedile al administrador que lo cargue en tu cuenta.");
    return;
  }
  const ctx: Ctx = { userId: user.id, name: user.name, phone: msg.from, out: whatsappOutbox(msg.from), source: "WHATSAPP" };
  if (msg.audio) return handleAudio(ctx, msg.audio.id);
  if (msg.image) return handleReceipt(ctx, msg.image.id, "image", msg.image.caption);
  if (msg.document) {
    // Un archivo adjunto: una factura en PDF o una foto mandada "como documento" (llega sin comprimir)
    const kind = receiptKind(msg.document.mime_type);
    if (!kind) return ctx.out.text("📎 Ese archivo no lo puedo leer. Mandame el ticket como foto o como PDF.");
    // WhatsApp a veces pone el nombre del archivo como texto: eso no es algo que haya escrito la persona
    const caption = msg.document.caption !== msg.document.filename ? msg.document.caption : undefined;
    return handleReceipt(ctx, msg.document.id, kind, caption);
  }
  const input: Input = {
    text: msg.text?.body,
    replyId: msg.interactive?.button_reply?.id ?? msg.interactive?.list_reply?.id,
  };
  if (!input.text && !input.replyId) {
    await sendText(msg.from, "Por ahora entiendo mensajes escritos, audios y tickets (foto o PDF) 🙂 Escribí *menu* para ver las opciones.");
    return;
  }
  await handleInput(ctx, input);
}

/** Nota de voz: se baja, se pasa a texto, se muestra lo que se entendió y se procesa como escrito */
async function handleAudio(ctx: Ctx, mediaId: string) {
  if (!isTranscriptionEnabled()) return ctx.out.text(transcriptionProblem("off"));
  const audio = await downloadMedia(mediaId);
  if (!audio) return ctx.out.text(transcriptionProblem("error"));
  const result = await transcribeAudio(audio, await audioHints(ctx.userId));
  if (!result.ok) return ctx.out.text(transcriptionProblem(result.reason));
  await ctx.out.text(`🎙️ Entendí: «${result.text}»`);
  await handleInput(ctx, { text: result.text });
}

const NO_RECEIPTS = 'Todavía no puedo leer tickets 😕 Escribime el gasto (ej: _"super 12500"_).';

/** Ticket por WhatsApp (foto o PDF): se baja y se procesa */
async function handleReceipt(ctx: Ctx, mediaId: string, kind: ReceiptKind, caption?: string) {
  if (!isAiEnabled()) return ctx.out.text(NO_RECEIPTS);
  const file = await downloadMedia(mediaId);
  if (!file) return ctx.out.text(`No pude bajar ${kind === "pdf" ? "el PDF" : "la foto"} 😕 Probá mandarlo de nuevo.`);
  await processReceipt(ctx, file, kind, caption);
}

/**
 * Un ticket (foto o factura en PDF): se guarda, la IA lo lee (readReceipt, que también aplica el
 * comercio conocido por su CUIT) y se propone el gasto, que se confirma como cualquier otro (y se
 * puede corregir escribiendo). Al guardarlo, el archivo queda con el gasto para verlo en la web.
 * El texto que venga con el archivo ("fue con la visa") manda sobre lo que se lee.
 */
export async function processReceipt(ctx: Ctx, file: Buffer, kind: ReceiptKind, caption?: string) {
  if (!isAiEnabled()) return ctx.out.text(NO_RECEIPTS);
  const pdf = kind === "pdf";
  let reading: Awaited<ReturnType<typeof readReceipt>>;
  try {
    reading = await readReceipt(ctx.userId, file, kind, caption);
  } catch (e) {
    if (!(e instanceof ReceiptError)) throw e;
    return ctx.out.text(
      pdf
        ? "No pude leer ese PDF 😕 Mandame una foto de la factura, o escribime el gasto."
        : "No pude abrir esa imagen 😕 Probá sacarle otra foto al ticket.",
    );
  }
  const { parsed, receiptId } = reading;
  if (!parsed) {
    return showMainMenu(
      ctx,
      "No pude leer el ticket: la IA no me respondió 😕 (suele ser algo pasajero).\n" +
        'Probá mandarlo de nuevo en un rato o escribime el gasto (ej: _"super 12500"_):',
    );
  }
  const heading = pdf ? "📄 Esto leí de la factura 👇" : "🧾 Esto leí del ticket 👇";
  if (parsed.intent === "cargar" && (await proposeExpenses(ctx, parsed.expenses, heading, receiptId))) return;
  const why = parsed.intent === "otro" && parsed.question ? `${parsed.question} ` : "";
  await ctx.out.text(
    pdf
      ? `🤔 No pude sacar el gasto de ese PDF. ${why}\nProbá mandándome una foto de la factura, o escribime el gasto.`
      : `🤔 No pude sacar el gasto de esa foto. ${why}\nProbá con una foto más de cerca y con buena luz, o escribime el gasto.`,
  );
}

/** Palabras que ayudan a Whisper a entender los audios: las categorías y tarjetas de la persona */
export async function audioHints(userId: string) {
  const [categories, sources] = await Promise.all([listCategories(userId), listPaymentSources(userId)]);
  return [...categories.map((c) => c.name), ...sources.map((s) => s.name)];
}

/**
 * El "cerebro" de Chop, igual para WhatsApp y para el chat de la web: atiende los comandos
 * que valen siempre (menu, cancelar...), sigue el menú paso a paso o le pregunta a la IA.
 */
export async function handleInput(ctx: Ctx, input: Input) {
  await noticeLoadedFixed(ctx);
  const text = normalize(input.text ?? "").replace(/[!¡?¿.]/g, "");
  const notices = await accountNotices(ctx);
  if (MENU_WORDS.includes(text)) {
    const hello = `¡Hola ${ctx.name}! 👋 Soy *Chop*. Contame un gasto (ej: _"nafta 15000"_) o elegí una opción:`;
    const withNotices = notices ? `${hello}

*Además:*
${notices}` : hello;
    // El texto de un mensaje con botones tiene un límite (1024): si no entra, los avisos van antes
    if (withNotices.length <= 1000) return showMainMenu(ctx, withNotices);
    await ctx.out.text(notices);
    return showMainMenu(ctx, hello);
  }
  // Cualquier otro mensaje: los avisos van aparte, antes de la respuesta
  if (notices) await ctx.out.text(notices);
  if (CANCEL_WORDS.includes(text)) {
    await clearSession(ctx.phone);
    return ctx.out.text("Listo, cancelado 👌 Escribime cuando quieras.");
  }
  // Vale aunque haya otra conversación en curso, como "menu" o "cancelar"
  if (input.text && isDeleteLast(input.text)) return void (await handleDelete(ctx, { last: true, text: "", amount: 0 }));

  let session = await getSession(ctx.phone);
  // Chop había hecho una pregunta ("¿cuál es el nombre nuevo?") y le contestan con texto: se deja la
  // pregunta y, más abajo, la respuesta se interpreta junto con el mensaje original
  const followup = session?.state === "followup" && input.text ? session.data.followup : undefined;
  if (followup) {
    await clearSession(ctx.phone);
    session = null;
  }
  if (await handleSectionState(ctx, input, session)) return;
  if (await handleMenu(ctx, input, session)) return;

  // Nada en curso: primero probamos sin IA (gratis) y, si no alcanza, le preguntamos a la IA
  if (input.text) {
    const [categories, sources] = await Promise.all([listCategories(ctx.userId), listPaymentSources(ctx.userId)]);

    // Mensajes simples ("nafta 15000", "cuánto gasté este mes"): se entienden con reglas, sin gastar tokens.
    // Si es la respuesta a una pregunta de Chop y se entiende sola, es un mensaje nuevo.
    const quick = parseWithoutAI(input.text, categories, sources);
    if (followup && !quick) {
      const combined = `${followup.text}\n(Chop preguntó: "${followup.question}". Respuesta: ${input.text})`;
      if (followup.section) {
        if (await handleSection(ctx, followup.section, combined)) return;
      } else if (isAiEnabled()) {
        return askAI(ctx, combined, categories, sources);
      }
    }
    if (quick) console.log(`[quick-parser] ${quick.intent} resuelto sin IA`);
    if (quick?.intent === "cargar" && (await proposeExpenses(ctx, quick.expenses))) return;
    if (quick?.intent === "consultar") return void (await handleQuery(ctx, quick));
    if (quick?.intent === "eliminar") return void (await handleDelete(ctx, quick.target));
    if (quick?.intent === "seccion" && (await handleSection(ctx, quick.section, input.text, quick.quick))) return;

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
    // La IA no respondió (caída, sin crédito, sin internet) o respondió algo inválido: que se entienda
    // que no es culpa del mensaje, y que los gastos simples y el menú andan igual (van sin IA)
    await showMainMenu(
      ctx,
      "No pude entender ese mensaje: la IA no me respondió 😕 (suele ser algo pasajero).\n" +
        'Probá de nuevo en un rato, escribí el gasto simple (ej: _"nafta 15000"_) o usá el menú:',
    );
    return;
  }
  if (parsed.intent === "cargar" && (await proposeExpenses(ctx, parsed.expenses))) return;
  if (parsed.intent === "consultar") return void (await handleQuery(ctx, parsed));
  if (parsed.intent === "eliminar") return void (await handleDelete(ctx, parsed.target));
  if (parsed.intent === "editar") return void (await handleEdit(ctx, parsed.target, parsed.changes));
  // De otra sección (fijos...): la sección hace su propia llamada chica a la IA
  if (parsed.intent === "seccion" && (await handleSection(ctx, parsed.section, text))) return;
  // No entendió del todo: repregunta en vez de tirar el menú de una
  if (parsed.intent === "otro" && parsed.question) {
    // Se acuerda de la pregunta: la respuesta se interpreta junto con este mensaje
    await askFollowup(ctx, undefined, text, parsed.question, "\n\n_Escribí *menu* si preferís los botones._");
    return;
  }

  await showMainMenu(ctx, "No te entendí 🤔 Probá escribiendo el gasto (ej: _\"super 12500 debito\"_) o elegí una opción:");
}

/**
 * Los gastos fijos que ya llegaron a su día se cargan al primer mensaje (igual que al abrir la web)
 * y se avisan todos juntos en un solo mensaje. Si falla, Chop sigue igual.
 */
async function noticeLoadedFixed(ctx: Ctx) {
  try {
    const notice = loadedFixedText(await loadDueRecurring(ctx.userId));
    if (notice) await ctx.out.text(notice);
  } catch (e) {
    console.error("[fijos]", e instanceof Error ? e.message : e);
  }
}

/**
 * Avisos de la cuenta que todavía no se entregaron (vencimiento de tarjetas, resumen de la semana
 * y del mes), juntos en un texto. Vacío si no hay. Si falla, Chop sigue igual.
 */
async function accountNotices(ctx: Ctx) {
  try {
    return (await pendingNotices(ctx.userId)).join("\n\n");
  } catch (e) {
    console.error("[avisos]", e instanceof Error ? e.message : e);
    return "";
  }
}
