import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "@/lib/db";

// Cuánto cuesta cada mensaje a Chop (tabla chop_messages, la ve el superadmin en Resumen).
// trackChop abre una "cajita" para el mensaje (AsyncLocalStorage: Node la mantiene a lo largo de
// todo lo que se hace para atenderlo, sin pasarla por parámetro); cada consulta a la IA anota sus
// tokens con noteAiUsage, y si Chop no entendió, noteNotUnderstood guarda el texto.

type Usage = { aiCalls: number; inputTokens: number; outputTokens: number; costUsd: number; notUnderstood: string | null };

const storage = new AsyncLocalStorage<Usage>();

export type MessageKind = "texto" | "botón" | "audio" | "foto" | "pdf" | "ticket del formulario";

export async function trackChop<T>(
  meta: { userId: string; source: "WEB" | "WHATSAPP"; kind: MessageKind },
  fn: () => Promise<T>,
): Promise<T> {
  const usage: Usage = { aiCalls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0, notUnderstood: null };
  try {
    return await storage.run(usage, fn);
  } finally {
    // Si falla el registro, Chop igual contestó: no se corta nada
    await db.chopMessage
      .create({
        data: {
          ...meta,
          aiCalls: usage.aiCalls,
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          costUsd: usage.costUsd,
          understood: usage.notUnderstood === null,
          text: usage.notUnderstood?.slice(0, 500),
        },
      })
      .catch((e) => console.error("[chop-uso] no pude guardar el registro:", e instanceof Error ? e.message : e));
  }
}

/** Una consulta a la IA (askModel en ai-parser.ts) */
export function noteAiUsage(inputTokens: number, outputTokens: number, costUsd: number) {
  const usage = storage.getStore();
  if (!usage) return; // fuera de un mensaje (scripts, el banco de pruebas): no se registra
  usage.aiCalls += 1;
  usage.inputTokens += inputTokens;
  usage.outputTokens += outputTokens;
  usage.costUsd += costUsd;
}

/** Chop no entendió el mensaje: se guarda el texto para mejorar el pre-filtro */
export function noteNotUnderstood(text: string | undefined) {
  const usage = storage.getStore();
  if (usage && text) usage.notUnderstood = text;
}
