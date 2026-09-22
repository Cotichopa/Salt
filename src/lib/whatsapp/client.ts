import "server-only";

// Cliente para mandar mensajes con la API de WhatsApp Cloud (Meta).
// Documentación: https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages/

const API_VERSION = process.env.WHATSAPP_API_VERSION || "v25.0";

/**
 * WhatsApp nos avisa los mensajes de celulares argentinos como 549XXXXXXXXXX (con el 9),
 * pero para responderles la API espera 54XXXXXXXXXX (sin el 9). Si no se lo sacamos,
 * Meta contesta "número no permitido" aunque esté cargado en la lista de prueba.
 */
export function toRecipient(phone: string) {
  return phone.replace(/^549(\d{10})$/, "54$1");
}

async function send(to: string, payload: Record<string, unknown>) {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  // Sin credenciales (por ejemplo, en pruebas locales) mostramos el mensaje en la terminal
  if (!token || !phoneNumberId) {
    console.log(`[whatsapp:simulado] → ${to}:`, JSON.stringify(payload));
    return;
  }

  const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: toRecipient(to), ...payload }),
  });
  if (!res.ok) {
    // No cortamos la app: dejamos el error en la terminal para poder revisarlo
    console.error(`[whatsapp] error ${res.status} enviando a ${to}:`, await res.text());
  }
}

export function sendText(to: string, body: string) {
  return send(to, { type: "text", text: { body, preview_url: false } });
}
