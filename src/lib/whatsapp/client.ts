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

  const post = (recipient: string) =>
    fetch(`https://graph.facebook.com/${API_VERSION}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to: recipient, ...payload }),
    });

  let res = await post(toRecipient(to));
  let error = res.ok ? "" : await res.text();
  // 131030 = "no está en la lista de números permitidos" (número de prueba). Depende de cómo se
  // cargó el número en esa lista de Meta: sin el 9 (lo de arriba) o con el 9. Si falló sin el 9,
  // se prueba tal cual llegó.
  if (!res.ok && error.includes("131030") && toRecipient(to) !== to) {
    res = await post(to);
    error = res.ok ? "" : await res.text();
  }
  if (!res.ok) {
    // No cortamos la app: dejamos el error en la terminal para poder revisarlo
    console.error(`[whatsapp] error ${res.status} enviando a ${to}:`, error);
  }
}

// Un audio de WhatsApp de 1 minuto pesa unos 100 KB y una foto, menos de 1 MB (WhatsApp las achica):
// más de esto no lo bajamos
const MAX_MEDIA_BYTES = 5_000_000;

/**
 * Baja un archivo que mandaron por WhatsApp (un audio). Meta manda solo el id: primero se pide la
 * dirección del archivo y después se baja, las dos cosas con el token. null si no se pudo.
 * Documentación: https://developers.facebook.com/docs/whatsapp/cloud-api/reference/media
 */
export async function downloadMedia(mediaId: string): Promise<Buffer | null> {
  const token = process.env.WHATSAPP_TOKEN;
  if (!token) return null;
  const auth = { Authorization: `Bearer ${token}` };
  try {
    const info = await fetch(`https://graph.facebook.com/${API_VERSION}/${mediaId}`, { headers: auth });
    if (!info.ok) throw new Error(`info ${info.status}: ${await info.text()}`);
    const { url, file_size } = (await info.json()) as { url?: string; file_size?: number };
    if (!url || (file_size ?? 0) > MAX_MEDIA_BYTES) throw new Error(`sin url o muy grande (${file_size} bytes)`);
    const file = await fetch(url, { headers: auth });
    if (!file.ok) throw new Error(`archivo ${file.status}`);
    return Buffer.from(await file.arrayBuffer());
  } catch (e) {
    console.error(`[whatsapp] no pude bajar el archivo ${mediaId}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

export function sendText(to: string, body: string) {
  return send(to, { type: "text", text: { body, preview_url: false } });
}

// Límites de WhatsApp: si un texto se pasa, Meta rechaza el mensaje entero
const cut = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

export type Button = { id: string; title: string };

/** Mensaje con hasta 3 botones (título de 20 caracteres como máximo) */
export function sendButtons(to: string, body: string, buttons: Button[]) {
  return send(to, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: cut(body, 1024) },
      action: {
        buttons: buttons.slice(0, 3).map((b) => ({ type: "reply", reply: { id: b.id, title: cut(b.title, 20) } })),
      },
    },
  });
}

export type ListRow = { id: string; title: string; description?: string };

/** Mensaje con un botón que abre una lista de hasta 10 opciones */
export function sendList(to: string, body: string, buttonText: string, rows: ListRow[], sectionTitle = "Opciones") {
  return send(to, {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: cut(body, 4096) },
      action: {
        button: cut(buttonText, 20),
        sections: [
          {
            title: cut(sectionTitle, 24),
            rows: rows.slice(0, 10).map((r) => ({
              id: r.id,
              title: cut(r.title, 24),
              ...(r.description ? { description: cut(r.description, 72) } : {}),
            })),
          },
        ],
      },
    },
  });
}
