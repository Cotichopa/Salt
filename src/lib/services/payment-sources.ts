import "server-only";
import { db } from "@/lib/db";
import { normalize } from "@/lib/text";
import type { PaymentMethodCode } from "@/lib/format";
import type { PaymentSourceKind } from "@/generated/prisma/client";

// Tarjetas (Visa, Cabal...) y billeteras (Mercado Pago, MODO...) de cada usuario.
// Son propias de cada cuenta, igual que las categorías personalizadas.

export class PaymentSourceError extends Error {}

export const kindLabels = { CARD: "Tarjeta", WALLET: "Billetera" } as const;

/** Qué tipo de medio propio corresponde a cada forma de pago (efectivo no lleva) */
export function kindForMethod(method: PaymentMethodCode): PaymentSourceKind | null {
  if (method === "DEBIT" || method === "CREDIT") return "CARD";
  if (method === "TRANSFER") return "WALLET";
  return null;
}

// Lista con la que arranca cada cuenta nueva; después cada uno agrega o borra
const DEFAULTS: { name: string; kind: PaymentSourceKind }[] = [
  { name: "Visa", kind: "CARD" },
  { name: "Mastercard", kind: "CARD" },
  { name: "Cabal", kind: "CARD" },
  { name: "Naranja X", kind: "CARD" },
  { name: "Mercado Pago", kind: "WALLET" },
  { name: "MODO", kind: "WALLET" },
  { name: "Ualá", kind: "WALLET" },
  { name: "Cuenta DNI", kind: "WALLET" },
];

/** Crea la lista base para un usuario que todavía no tiene ninguna */
export async function ensureDefaults(userId: string) {
  const count = await db.paymentSource.count({ where: { userId } });
  if (count > 0) return;
  await db.paymentSource.createMany({ data: DEFAULTS.map((d) => ({ ...d, userId })) });
}

export function listPaymentSources(userId: string) {
  return db.paymentSource.findMany({
    where: { userId },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    select: { id: true, name: true, kind: true },
  });
}

/** Las que puede usar una forma de pago (tarjetas para débito/crédito, billeteras para transferencia) */
export async function listForMethod(userId: string, method: PaymentMethodCode) {
  const kind = kindForMethod(method);
  if (!kind) return [];
  return db.paymentSource.findMany({ where: { userId, kind }, orderBy: { name: "asc" }, select: { id: true, name: true, kind: true } });
}

/** Lanza error si la tarjeta/billetera no es del usuario o no corresponde a esa forma de pago */
export async function assertUsable(userId: string, id: string, method: PaymentMethodCode) {
  const kind = kindForMethod(method);
  const source = await db.paymentSource.findFirst({ where: { id, userId }, select: { kind: true } });
  if (!source) throw new PaymentSourceError("Tarjeta o billetera inválida");
  if (source.kind !== kind) {
    throw new PaymentSourceError(
      kind === "CARD" ? "Elegí una tarjeta, no una billetera" : "Elegí una billetera, no una tarjeta",
    );
  }
}

async function assertNameFree(userId: string, name: string, exceptId?: string) {
  const existing = await listPaymentSources(userId);
  const clash = existing.find((s) => s.id !== exceptId && normalize(s.name) === normalize(name));
  if (clash) throw new PaymentSourceError(`Ya tenés "${clash.name}"`);
}

export async function createPaymentSource(userId: string, name: string, kind: PaymentSourceKind) {
  await assertNameFree(userId, name);
  return db.paymentSource.create({ data: { userId, name, kind } });
}

export async function updatePaymentSource(userId: string, id: string, name: string, kind: PaymentSourceKind) {
  const own = await db.paymentSource.findFirst({ where: { id, userId } });
  if (!own) throw new PaymentSourceError("No encontré esa tarjeta o billetera");
  await assertNameFree(userId, name, id);
  return db.paymentSource.update({ where: { id }, data: { name, kind } });
}

/** Al borrarla, los gastos que la usaban quedan sin tarjeta (no se borran) */
export async function deletePaymentSource(userId: string, id: string) {
  const { count } = await db.paymentSource.deleteMany({ where: { id, userId } });
  if (count === 0) throw new PaymentSourceError("No encontré esa tarjeta o billetera");
}

/** Cuántos gastos usa cada una, para mostrarlo en la pantalla de administración */
export async function listWithUsage(userId: string) {
  const [sources, counts] = await Promise.all([
    listPaymentSources(userId),
    db.expense.groupBy({ by: ["paymentSourceId"], where: { userId }, _count: true }),
  ]);
  const byId = new Map(counts.map((c) => [c.paymentSourceId, c._count]));
  return sources.map((s) => ({ ...s, expenseCount: byId.get(s.id) ?? 0 }));
}
