import "server-only";
import { normalize } from "@/lib/text";
import { listCategories } from "@/lib/services/categories";
import { listPaymentSources } from "@/lib/services/payment-sources";
import { merchantCategory, setReceiptCuit, validCuit } from "@/lib/services/merchants";
import { savePdfReceipt, saveReceipt } from "@/lib/services/receipts";
import { parseReceipt, type Parsed, type ReceiptFile } from "@/lib/whatsapp/ai-parser";

// Leer un ticket (foto o factura en PDF), igual para Chop (bot.ts → processReceipt) y para el
// formulario de gasto de la web (actions/expenses.ts → readReceiptForForm).

export type ReceiptKind = "image" | "pdf";

// Solo estos tipos de imagen: otros (SVG, TIFF, GIF...) no son fotos de tickets y sharp los abriría
// con librerías que tuvieron fallas de seguridad. saveReceipt además mira el contenido del archivo.
const IMAGE_TYPES = new Set(["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"]);

/** Qué tipo de ticket es un archivo, por su tipo (MIME): PDF o imagen. null si no es ninguno. */
export function receiptKind(mimeType: string | undefined): ReceiptKind | null {
  if (mimeType === "application/pdf") return "pdf";
  return mimeType && IMAGE_TYPES.has(mimeType.toLowerCase()) ? "image" : null;
}

/**
 * Una transferencia leída del comprobante. `own`: de una cuenta tuya a otra tuya (mismo CUIL de los
 * dos lados, o el mismo nombre): no es un gasto. `to`: a quién (para la descripción y las preguntas).
 */
export type ReceiptTransfer = { to: string | null; own: boolean };

/**
 * Guarda el ticket y lo lee con la IA. `parsed` es null si la IA no respondió. Si se leyó un CUIT
 * válido, queda con el ticket, y si el comercio ya es conocido su categoría reemplaza a la que eligió
 * la IA, salvo que el texto que vino con el ticket nombre otra ("esto es de regalos").
 * Si es un comprobante de transferencia (decisiones de Felipe, 2026-11-16): la persona que recibe hace
 * de comercio (su CUIL se recuerda con la categoría), el medio es transferencia, la descripción
 * "Transferencia a <nombre>" y la categoría no se adivina (se pregunta), salvo que la persona ya sea
 * conocida o el texto nombre una.
 * ReceiptError si el archivo no se puede abrir.
 */
export async function readReceipt(userId: string, file: Buffer, kind: ReceiptKind, caption?: string) {
  const saved = await storeReceipt(userId, file, kind);

  const [categories, sources] = await Promise.all([listCategories(userId), listPaymentSources(userId)]);
  const result = await parseReceipt(saved.file, caption, {
    categories: categories.map((c) => c.name),
    sources: sources.map((s) => s.name),
  });
  const parsed: Parsed | null = result?.parsed ?? null;
  const captionCategory = !!caption && namesCategory(categories, caption);

  let transfer: ReceiptTransfer | null = null;
  if (result?.transfer && parsed?.intent === "cargar") {
    const t = result.transfer;
    transfer = { to: t.to, own: isOwnTransfer(t) };
    for (const e of parsed.expenses) {
      e.paymentMethod = "TRANSFER";
      e.description = t.to ? `Transferencia a ${t.to}` : "Transferencia";
      if (!captionCategory) e.categoryName = "";
    }
  }

  const cuit = validCuit(transfer ? result?.transfer?.toCuit : result?.cuit);
  if (cuit && parsed && !transfer?.own) {
    await setReceiptCuit(userId, saved.id, cuit);
    const known = await merchantCategory(userId, cuit);
    if (known && parsed.intent === "cargar" && !captionCategory) {
      for (const e of parsed.expenses) e.categoryName = known.name;
    }
  }
  return { receiptId: saved.id, parsed, categories, sources, transfer };
}

/** De una cuenta a otra de la misma persona: el mismo CUIL de los dos lados o, si no se leyeron, el mismo nombre */
function isOwnTransfer(t: { to: string | null; toCuit: string | null; from: string | null; fromCuit: string | null }) {
  const to = validCuit(t.toCuit);
  const from = validCuit(t.fromCuit);
  if (to && from) return to === from;
  const name = (v: string | null) => normalize(v ?? "").replace(/[^a-z0-9ñ]+/g, " ").trim();
  return !!name(t.to) && name(t.to) === name(t.from);
}

/**
 * Guarda el ticket sin leerlo y devuelve su id y lo que leería la IA (la foto achicada o, del PDF,
 * su texto o su primera página). ReceiptError si el archivo no se puede abrir.
 */
export async function storeReceipt(userId: string, file: Buffer, kind: ReceiptKind): Promise<{ id: string; file: ReceiptFile }> {
  if (kind === "pdf") {
    const r = await savePdfReceipt(userId, file);
    return { id: r.id, file: r.forAi };
  }
  const r = await saveReceipt(userId, file);
  return { id: r.id, file: { kind: "image", data: r.jpeg } };
}

/** Si el texto nombra una categoría ("esto es de regalos"): por su nombre o una de sus palabras clave */
function namesCategory(cats: { name: string; keywords: string[] }[], text: string) {
  const t = ` ${normalize(text).replace(/[^a-z0-9ñ]+/g, " ")} `;
  return cats.some((c) => [c.name, ...c.keywords].some((w) => w && t.includes(` ${normalize(w)} `)));
}
