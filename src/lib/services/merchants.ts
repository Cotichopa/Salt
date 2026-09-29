import "server-only";
import { db } from "@/lib/db";

// Comercios conocidos por su CUIT (tabla merchants): a qué categoría van sus tickets.
// Chop lee el CUIT de la foto del ticket (ai-parser.ts → parseReceipt) y lo guarda con la foto.
// Al guardar un gasto con esa foto, o al cambiarle la categoría después (web o Chop), se anota
// "este CUIT va en esta categoría"; el próximo ticket de ese comercio viene con esa categoría.

const WEIGHTS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];

/**
 * "30-68731043-4" → "30687310434", solo si es un CUIT válido: 11 dígitos y el último (verificador)
 * coincide con la cuenta de AFIP. Así no se guarda un número mal leído o inventado por la IA.
 */
export function validCuit(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length !== 11) return null;
  const sum = WEIGHTS.reduce((acc, w, i) => acc + w * Number(digits[i]), 0);
  let check = 11 - (sum % 11);
  if (check === 11) check = 0;
  if (check === 10) check = 9;
  return check === Number(digits[10]) ? digits : null;
}

/** Guarda el CUIT que se leyó en la foto (para anotar el comercio cuando se guarde el gasto) */
export async function setReceiptCuit(userId: string, receiptId: string, cuit: string) {
  await db.receipt.updateMany({ where: { id: receiptId, userId }, data: { cuit } });
}

/** La categoría de ese comercio, si ya se cargó un ticket suyo */
export async function merchantCategory(userId: string, cuit: string) {
  const merchant = await db.merchant.findUnique({
    where: { userId_cuit: { userId, cuit } },
    select: { category: { select: { id: true, name: true } } },
  });
  return merchant?.category ?? null;
}

/**
 * Anota (o actualiza) la categoría del comercio del ticket. No hace nada si la foto no tiene CUIT.
 * Vale la última: si se cambia la categoría, el próximo ticket viene con la nueva.
 */
export async function rememberMerchant(userId: string, receiptId: string, categoryId: string, name?: string | null) {
  const receipt = await db.receipt.findFirst({ where: { id: receiptId, userId }, select: { cuit: true } });
  if (!receipt?.cuit) return;
  const data = { categoryId, ...(name ? { name: name.slice(0, 100) } : {}) };
  await db.merchant.upsert({
    where: { userId_cuit: { userId, cuit: receipt.cuit } },
    create: { userId, cuit: receipt.cuit, ...data },
    update: data,
  });
}

/**
 * El comercio de la foto del ticket, para contarlo al confirmar: su CUIT y la categoría en que
 * está anotado (null si es la primera vez). null si no se leyó el CUIT.
 */
export async function receiptMerchant(userId: string, receiptId: string) {
  const receipt = await db.receipt.findFirst({ where: { id: receiptId, userId }, select: { cuit: true } });
  if (!receipt?.cuit) return null;
  const merchant = await db.merchant.findUnique({
    where: { userId_cuit: { userId, cuit: receipt.cuit } },
    select: { category: { select: { id: true, name: true, emoji: true } } },
  });
  return { cuit: receipt.cuit, category: merchant?.category ?? null };
}

/** Los comercios anotados en una categoría (pantalla de la categoría) */
export function listMerchants(userId: string, categoryId: string) {
  return db.merchant.findMany({
    where: { userId, categoryId },
    orderBy: [{ name: "asc" }, { cuit: "asc" }],
    select: { id: true, cuit: true, name: true },
  });
}

export class MerchantError extends Error {}

/** Pasa el comercio a otra categoría: sus próximos tickets vienen con esa */
export async function moveMerchant(userId: string, id: string, categoryId: string) {
  const category = await db.category.findFirst({ where: { id: categoryId, userId }, select: { id: true } });
  if (!category) throw new MerchantError("Esa categoría no existe");
  const { count } = await db.merchant.updateMany({ where: { id, userId }, data: { categoryId } });
  if (count === 0) throw new MerchantError("Ese comercio ya no está");
}

/** Olvida el comercio: su próximo ticket se categoriza como uno nuevo (y se vuelve a anotar al guardarlo) */
export async function forgetMerchant(userId: string, id: string) {
  await db.merchant.deleteMany({ where: { id, userId } });
}
