"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireEditor } from "@/lib/dal";
import { transcribeAudio, transcriptionProblem } from "@/lib/transcribe";
import { trackChop } from "@/lib/whatsapp/usage";
import { audioHints, handleInput, processReceipt } from "@/lib/whatsapp/bot";
import { receiptKind } from "@/lib/services/receipt-reading";
import type { Ctx } from "@/lib/whatsapp/menu";
import { collectingOutbox, type ChopMessage } from "@/lib/whatsapp/outbox";
import { clearSession } from "@/lib/whatsapp/session";

// Chat con Chop desde la web. Usa exactamente el mismo "cerebro" que WhatsApp (handleInput):
// la única diferencia es que las respuestas se juntan y se devuelven, en vez de mandarse
// por WhatsApp. La conversación se identifica como "web:<id de usuario>".

const inputSchema = z.union([
  z.object({ text: z.string().trim().min(1).max(500) }),
  // Los ids de botones son cortos y del tipo "menu:add" o "cat:<id>"
  z.object({ replyId: z.string().regex(/^[\w:.-]{1,100}$/) }),
]);

async function webCtx() {
  const user = await requireEditor();
  const out = collectingOutbox();
  const ctx: Ctx = { userId: user.id, name: user.name, phone: `web:${user.id}`, out, source: "WEB" };
  return { ctx, out };
}

// Chop pudo cargar, editar o borrar gastos (o cambiar fijos): que las otras pantallas se actualicen
function revalidate() {
  revalidatePath("/gastos");
  revalidatePath("/dashboard");
  revalidatePath("/fijos");
  revalidatePath("/medios", "layout");
  revalidatePath("/categorias", "layout");
  revalidatePath("/etiquetas", "layout");
}

/** Mensaje escrito o botón tocado → respuestas de Chop */
export async function talkToChop(input: { text: string } | { replyId: string }): Promise<ChopMessage[]> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return [{ type: "text", body: "Ese mensaje es muy largo o está vacío 🤔 Probá de nuevo." }];

  const { ctx, out } = await webCtx();
  const kind = "text" in parsed.data ? "texto" : "botón";
  await trackChop({ userId: ctx.userId, source: "WEB", kind }, () => handleInput(ctx, parsed.data));
  revalidate();
  return out.messages;
}

// Las Server Actions aceptan hasta 1 MB por defecto; un minuto de audio pesa bastante menos
const MAX_AUDIO_BYTES = 1_000_000;

/** Audio grabado en el chat → lo pasa a texto y se lo manda a Chop */
export async function sendAudioToChop(formData: FormData): Promise<{ transcript: string | null; messages: ChopMessage[] }> {
  const audio = formData.get("audio");
  if (!(audio instanceof File) || audio.size === 0 || audio.size > MAX_AUDIO_BYTES) {
    return { transcript: null, messages: [{ type: "text", body: "No pude recibir el audio 😕 Probá con uno más corto." }] };
  }

  const { ctx, out } = await webCtx();
  return trackChop({ userId: ctx.userId, source: "WEB", kind: "audio" }, async () => {
    const result = await transcribeAudio(audio, await audioHints(ctx.userId));
    if (!result.ok) return { transcript: null, messages: [{ type: "text" as const, body: transcriptionProblem(result.reason) }] };
    // Igual que en WhatsApp: primero lo que se entendió, después la respuesta
    await out.text(`🎙️ Entendí: «${result.text}»`);
    await handleInput(ctx, { text: result.text });
    revalidate();
    return { transcript: result.text, messages: out.messages };
  });
}

// Un ticket (foto o PDF) desde el chat: hasta 5 MB, igual que por WhatsApp. Para que entre, el
// límite de las Server Actions se subió a 6 MB (next.config.ts). Las fotos llegan ya achicadas
// por el navegador (chop-chat.tsx), así que pesan mucho menos.
const MAX_RECEIPT_BYTES = 5_000_000;

/** Foto o factura en PDF adjunta en el chat → Chop la lee y propone el gasto, como por WhatsApp */
export async function sendReceiptToChop(formData: FormData): Promise<ChopMessage[]> {
  const file = formData.get("file");
  const caption = formData.get("caption");
  if (!(file instanceof File) || file.size === 0) {
    return [{ type: "text", body: "No pude recibir el archivo 😕 Probá de nuevo." }];
  }
  // El tipo lo decide el navegador por la extensión; si no es foto ni PDF, no se procesa
  const kind = receiptKind(file.type);
  if (!kind) return [{ type: "text", body: "📎 Ese archivo no lo puedo leer. Mandame el ticket como foto o como PDF." }];
  if (file.size > MAX_RECEIPT_BYTES) {
    return [{ type: "text", body: "Ese archivo es muy grande 😕 (el máximo es 5 MB). Probá con una foto." }];
  }

  const { ctx, out } = await webCtx();
  const text = typeof caption === "string" && caption.trim() ? caption.trim().slice(0, 500) : undefined;
  const data = Buffer.from(await file.arrayBuffer());
  await trackChop({ userId: ctx.userId, source: "WEB", kind: kind === "pdf" ? "pdf" : "foto" }, () =>
    processReceipt(ctx, data, kind, text),
  );
  revalidate();
  return out.messages;
}

/** "Nueva conversación": Chop se olvida del paso del menú en el que estaba */
export async function resetChop() {
  const user = await requireEditor();
  await clearSession(`web:${user.id}`);
}
