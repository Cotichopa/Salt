import "server-only";
import sharp from "sharp";
import { db } from "@/lib/db";

// Fotos de tickets: llegan por WhatsApp, Chop las lee (ai-parser.ts → parseReceipt) y la foto queda
// guardada con el gasto para verla en la web (/api/tickets/<id>).

export class ReceiptError extends Error {}

// 1568 px de lado es lo que Claude recomienda: más grande no lee mejor y cuesta más tokens.
// En JPEG calidad 80 un ticket queda en ~200 KB.
const MAX_SIDE = 1568;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Achica la foto, la guarda y devuelve su id y el JPEG (para mandárselo a la IA). Aprovecha para
 * borrar las fotos de más de un día con las que no se llegó a guardar ningún gasto (cancelado).
 */
export async function saveReceipt(userId: string, image: Buffer) {
  let jpeg: Buffer;
  try {
    jpeg = await sharp(image)
      .rotate() // respeta la orientación con que se sacó la foto
      .resize(MAX_SIDE, MAX_SIDE, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
  } catch {
    throw new ReceiptError("No pude abrir la imagen");
  }
  await db.receipt.deleteMany({ where: { userId, createdAt: { lt: new Date(Date.now() - DAY_MS) }, expenses: { none: {} } } });
  const receipt = await db.receipt.create({
    data: { userId, data: new Uint8Array(jpeg), mimeType: "image/jpeg" },
    select: { id: true },
  });
  return { id: receipt.id, jpeg };
}

/** La foto, solo si es de la persona (para mostrarla en la web) */
export async function getReceipt(userId: string, id: string) {
  return db.receipt.findFirst({ where: { id, userId }, select: { data: true, mimeType: true } });
}
