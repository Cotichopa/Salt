import "server-only";
import { sendButtons, sendList, sendText, type Button, type ListRow } from "@/lib/whatsapp/client";

// Por dónde responde Chop. El "cerebro" (bot.ts y menu.ts) no sabe si está hablando por
// WhatsApp o en el chat de la web: solo llama a ctx.out.text / buttons / list.
// - En WhatsApp, cada respuesta se manda al teléfono en el momento.
// - En la web, las respuestas se juntan y se devuelven todas juntas para mostrarlas.

export type { Button, ListRow };

export type ChopMessage =
  | { type: "text"; body: string }
  | { type: "buttons"; body: string; buttons: Button[] }
  | { type: "list"; body: string; buttonText: string; rows: ListRow[] };

export type Outbox = {
  text: (body: string) => Promise<void>;
  buttons: (body: string, buttons: Button[]) => Promise<void>;
  list: (body: string, buttonText: string, rows: ListRow[], sectionTitle?: string) => Promise<void>;
};

export function whatsappOutbox(phone: string): Outbox {
  return {
    text: (body) => sendText(phone, body),
    buttons: (body, buttons) => sendButtons(phone, body, buttons),
    list: (body, buttonText, rows, sectionTitle) => sendList(phone, body, buttonText, rows, sectionTitle),
  };
}

/** Salida del chat de la web: guarda los mensajes en `messages` en vez de mandarlos */
export function collectingOutbox(): Outbox & { messages: ChopMessage[] } {
  const messages: ChopMessage[] = [];
  return {
    messages,
    text: async (body) => void messages.push({ type: "text", body }),
    buttons: async (body, buttons) => void messages.push({ type: "buttons", body, buttons: buttons.slice(0, 3) }),
    list: async (body, buttonText, rows) => void messages.push({ type: "list", body, buttonText, rows: rows.slice(0, 10) }),
  };
}
