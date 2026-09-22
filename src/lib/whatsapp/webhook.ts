import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Lo que Meta nos manda al webhook (solo los campos que usamos).
// Ejemplo real: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
export type WebhookBody = {
  object?: string;
  entry?: {
    changes?: {
      field?: string;
      value?: {
        contacts?: { wa_id: string; profile?: { name?: string } }[];
        messages?: IncomingMessage[];
        statuses?: unknown[]; // avisos de "enviado", "entregado", "leído": los ignoramos
      };
    }[];
  }[];
};

export type IncomingMessage = {
  id: string;
  from: string; // teléfono en formato internacional sin "+", ej: 5491122334455
  timestamp: string;
  type: string; // "text", "interactive", "image", "audio", ...
  text?: { body: string };
  interactive?: {
    type: "button_reply" | "list_reply";
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string };
  };
};

/** Saca todos los mensajes que vienen en un aviso de Meta (puede traer varios juntos) */
export function extractMessages(body: WebhookBody): IncomingMessage[] {
  return (body.entry ?? []).flatMap((e) => (e.changes ?? []).flatMap((c) => c.value?.messages ?? []));
}

/**
 * Verifica que el aviso venga realmente de Meta. Meta firma el cuerpo con el
 * "App Secret" de tu app (HMAC-SHA256) y manda la firma en X-Hub-Signature-256.
 * Sin esto, cualquiera que conozca la URL podría cargar gastos a nombre de otro.
 */
export function isValidSignature(rawBody: string, header: string | null) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const received = Buffer.from(header.slice("sha256=".length), "hex");
  // timingSafeEqual compara sin filtrar información por el tiempo que tarda
  return received.length === expected.length && timingSafeEqual(received, expected);
}
