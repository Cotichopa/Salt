import "server-only";
import { db } from "@/lib/db";
import { sendText } from "@/lib/whatsapp/client";
import type { IncomingMessage } from "@/lib/whatsapp/webhook";

// El "cerebro" del bot. Por ahora (etapa 7) solo identifica a la persona y repite
// lo que recibe; en la etapa 8 va el menú y en la 9 el texto libre.

export async function handleMessage(msg: IncomingMessage) {
  // Solo atendemos a cuentas activas cuyo teléfono esté cargado en Salt
  const user = await db.user.findFirst({ where: { phone: msg.from, active: true }, select: { id: true, name: true } });
  if (!user) {
    await sendText(msg.from, "Hola 👋 Este número no está registrado en Salt. Pedile al administrador que lo cargue en tu cuenta.");
    return;
  }

  const text = msg.text?.body?.trim();
  if (!text) {
    await sendText(msg.from, "Por ahora solo entiendo mensajes de texto 🙂");
    return;
  }

  await sendText(msg.from, `Hola ${user.name}! 👋 Recibí: "${text}"`);
}
