import { after, type NextRequest } from "next/server";
import { handleMessage } from "@/lib/whatsapp/bot";
import { extractMessages, isValidSignature, type WebhookBody } from "@/lib/whatsapp/webhook";

// Webhook de WhatsApp: la URL que le damos a Meta (https://<tu-dominio>/api/whatsapp).
// Este archivo es un "Route Handler": responde a pedidos HTTP directos, sin página.

/**
 * GET: verificación. Cuando configurás el webhook en Meta, Meta llama a esta URL con un
 * token que vos inventaste (WHATSAPP_VERIFY_TOKEN). Si coincide, devolvemos el
 * "challenge" y Meta queda conforme de que la URL es tuya.
 */
export function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const ok =
    params.get("hub.mode") === "subscribe" &&
    !!process.env.WHATSAPP_VERIFY_TOKEN &&
    params.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN;
  if (!ok) return new Response("Token inválido", { status: 403 });
  return new Response(params.get("hub.challenge") ?? "", { status: 200 });
}

// IDs de mensajes ya procesados. Meta a veces reenvía el mismo mensaje (por ejemplo si
// tardamos en responder): sin esto, un gasto se podría cargar dos veces.
const seen = new Set<string>();
function isDuplicate(id: string) {
  if (seen.has(id)) return true;
  seen.add(id);
  if (seen.size > 1000) seen.delete(seen.values().next().value!); // no crecer para siempre
  return false;
}

/** POST: cada mensaje nuevo (y cada aviso de "entregado/leído") llega acá */
export async function POST(req: NextRequest) {
  // Necesitamos el cuerpo "crudo" (texto exacto) para verificar la firma de Meta
  const raw = await req.text();
  if (!isValidSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new Response("Firma inválida", { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("JSON inválido", { status: 400 });
  }

  // Respondemos 200 enseguida y procesamos después (`after`): si tardamos,
  // Meta cree que falló y reenvía el mismo mensaje.
  const messages = extractMessages(body).filter((m) => !isDuplicate(m.id));
  after(async () => {
    for (const msg of messages) {
      try {
        await handleMessage(msg);
      } catch (e) {
        console.error("[whatsapp] error procesando mensaje", msg.id, e);
      }
    }
  });

  return new Response("OK", { status: 200 });
}
