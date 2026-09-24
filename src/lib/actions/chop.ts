"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { transcribeAudio } from "@/lib/transcribe";
import { handleInput } from "@/lib/whatsapp/bot";
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
  const user = await requireUser();
  const out = collectingOutbox();
  const ctx: Ctx = { userId: user.id, name: user.name, phone: `web:${user.id}`, out, source: "WEB" };
  return { ctx, out };
}

// Chop pudo cargar, editar o borrar gastos: que las otras pantallas se actualicen
function revalidate() {
  revalidatePath("/gastos");
  revalidatePath("/dashboard");
  revalidatePath("/categorias", "layout");
}

/** Mensaje escrito o botón tocado → respuestas de Chop */
export async function talkToChop(input: { text: string } | { replyId: string }): Promise<ChopMessage[]> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return [{ type: "text", body: "Ese mensaje es muy largo o está vacío 🤔 Probá de nuevo." }];

  const { ctx, out } = await webCtx();
  await handleInput(ctx, parsed.data);
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
  const transcript = await transcribeAudio(audio);
  if (!transcript) {
    return {
      transcript: null,
      messages: [{ type: "text", body: "Todavía no entiendo audios 🙉 (¡ya viene!). Escribímelo y lo cargo al toque." }],
    };
  }
  await handleInput(ctx, { text: transcript });
  revalidate();
  return { transcript, messages: out.messages };
}

/** "Nueva conversación": Chop se olvida del paso del menú en el que estaba */
export async function resetChop() {
  const user = await requireUser();
  await clearSession(`web:${user.id}`);
}
