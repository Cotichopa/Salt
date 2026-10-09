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
 * Guarda el ticket y lo lee con la IA. `parsed` es null si la IA no respondió. Si se leyó un CUIT
 * válido, queda con el ticket, y si el comercio ya es conocido su categoría reemplaza a la que eligió
 * la IA, salvo que el texto que vino con el ticket nombre otra ("esto es de regalos").
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

  const cuit = validCuit(result?.cuit);
  if (cuit && parsed) {
    await setReceiptCuit(userId, saved.id, cuit);
    const known = await merchantCategory(userId, cuit);
    if (known && parsed.intent === "cargar" && !(caption && namesCategory(categories, caption))) {
      for (const e of parsed.expenses) e.categoryName = known.name;
    }
  }
  return { receiptId: saved.id, parsed, categories, sources };
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
