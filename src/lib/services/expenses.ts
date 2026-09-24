import "server-only";
import { db } from "@/lib/db";
import { dateToISO, isoToDate, monthRange, type CurrencyCode, type PaymentMethodCode } from "@/lib/format";
import type { ExpenseInput } from "@/lib/validators";

// Los campos nuevos son opcionales para quien llama (el bot todavía no los manda)
type ExpenseData = Omit<ExpenseInput, "installments" | "paymentSourceId"> & {
  installments?: number;
  paymentSourceId?: string;
};
import { assertCategoryUsable, CategoryError } from "@/lib/services/categories";
import { assertUsable, PaymentSourceError } from "@/lib/services/payment-sources";
import type { Prisma, Source } from "@/generated/prisma/client";

// Lógica de gastos, compartida por la web y el bot de WhatsApp.
// Regla de oro: TODAS las funciones reciben el userId y filtran por él,
// así nadie puede ver ni tocar gastos de otra persona.

export class ExpenseError extends Error {}

export type ExpenseFilters = {
  month?: string; // "2026-09"
  from?: string; // "YYYY-MM-DD" (incluido)
  to?: string; // "YYYY-MM-DD" (incluido)
  categoryId?: string;
  currency?: CurrencyCode;
  paymentMethod?: PaymentMethodCode;
  paymentSourceId?: string;
};

// Los componentes de pantalla no pueden recibir el tipo Decimal de Prisma,
// así que devolvemos un objeto simple con el monto como número (DTO).
export type ExpenseDTO = {
  id: string;
  amount: number;
  currency: CurrencyCode;
  paymentMethod: PaymentMethodCode;
  description: string | null;
  date: string; // "YYYY-MM-DD"
  source: Source;
  category: { id: string; name: string; emoji: string | null; icon: string | null };
  paymentSource: { id: string; name: string } | null;
  installments: number;
  installmentNumber: number;
  purchaseId: string | null;
};

const expenseSelect = {
  id: true,
  amount: true,
  currency: true,
  paymentMethod: true,
  description: true,
  date: true,
  source: true,
  installments: true,
  installmentNumber: true,
  purchaseId: true,
  category: { select: { id: true, name: true, emoji: true, icon: true } },
  paymentSource: { select: { id: true, name: true } },
} satisfies Prisma.ExpenseSelect;

function toDTO(e: Prisma.ExpenseGetPayload<{ select: typeof expenseSelect }>): ExpenseDTO {
  return { ...e, amount: e.amount.toNumber(), date: dateToISO(e.date) };
}

export async function listExpenses(userId: string, filters: ExpenseFilters = {}, limit?: number) {
  const where: Prisma.ExpenseWhereInput = { userId };
  if (filters.month) {
    const { from, to } = monthRange(filters.month);
    where.date = { gte: from, lt: to };
  }
  if (filters.from || filters.to) {
    where.date = {
      ...(filters.from ? { gte: isoToDate(filters.from) } : {}),
      ...(filters.to ? { lte: isoToDate(filters.to) } : {}),
    };
  }
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.currency) where.currency = filters.currency;
  if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;
  if (filters.paymentSourceId) where.paymentSourceId = filters.paymentSourceId;

  const rows = await db.expense.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: expenseSelect,
    take: limit,
  });
  return rows.map(toDTO);
}

/** Totales por moneda (ARS y USD nunca se suman entre sí) */
export function totalsByCurrency(expenses: ExpenseDTO[]) {
  const totals: Record<CurrencyCode, number> = { ARS: 0, USD: 0 };
  for (const e of expenses) totals[e.currency] += e.amount;
  return totals;
}

async function assertCategoryAllowed(userId: string, categoryId: string) {
  try {
    await assertCategoryUsable(userId, categoryId);
  } catch (e) {
    if (e instanceof CategoryError) throw new ExpenseError(e.message);
    throw e;
  }
}

async function assertSourceAllowed(userId: string, input: ExpenseData) {
  if (!input.paymentSourceId) return;
  try {
    await assertUsable(userId, input.paymentSourceId, input.paymentMethod);
  } catch (e) {
    if (e instanceof PaymentSourceError) throw new ExpenseError(e.message);
    throw e;
  }
}

/** Suma meses a una fecha "YYYY-MM-DD" quedándose en el último día si el mes es más corto */
function addMonths(iso: string, months: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1 + months, Math.min(d, lastDay)));
}

/**
 * Crea el gasto. Si son varias cuotas, crea un gasto por cuota (mismo purchaseId),
 * uno por mes: así cada mes muestra lo que realmente se paga ese mes.
 * El monto que llega es el TOTAL de la compra.
 */
export async function createExpense(userId: string, input: ExpenseData, source: Source = "WEB") {
  await assertCategoryAllowed(userId, input.categoryId);
  await assertSourceAllowed(userId, input);

  const installments = Math.max(1, Math.min(input.installments ?? 1, 36));
  if (installments === 1) {
    const row = await db.expense.create({
      data: { ...input, installments: 1, date: isoToDate(input.date), userId, source },
      select: expenseSelect,
    });
    return toDTO(row);
  }

  // Repartimos en centavos para que la suma de las cuotas dé exactamente el total
  const totalCents = Math.round(input.amount * 100);
  const baseCents = Math.floor(totalCents / installments);
  const purchaseId = crypto.randomUUID();

  const rows = Array.from({ length: installments }, (_, i) => ({
    ...input,
    // La última cuota se lleva los centavos que sobraron del reparto
    amount: (i === installments - 1 ? totalCents - baseCents * (installments - 1) : baseCents) / 100,
    date: addMonths(input.date, i),
    installments,
    installmentNumber: i + 1,
    purchaseId,
    userId,
    source,
  }));
  await db.expense.createMany({ data: rows });

  const first = await db.expense.findFirstOrThrow({
    where: { purchaseId, installmentNumber: 1 },
    select: expenseSelect,
  });
  return toDTO(first);
}

export async function updateExpense(userId: string, id: string, input: ExpenseData) {
  await assertCategoryAllowed(userId, input.categoryId);
  await assertSourceAllowed(userId, input);
  // updateMany con userId en el filtro: si el gasto no es tuyo, no actualiza nada
  // Al editar no se tocan las cuotas: se cambia solo ese movimiento
  const { count } = await db.expense.updateMany({
    where: { id, userId },
    data: {
      amount: input.amount,
      currency: input.currency,
      paymentMethod: input.paymentMethod,
      categoryId: input.categoryId,
      description: input.description,
      paymentSourceId: input.paymentSourceId ?? null,
      date: isoToDate(input.date),
    },
  });
  if (count === 0) throw new ExpenseError("Gasto no encontrado");
}

/**
 * Borra un gasto. Con scope "purchase" borra todas las cuotas de esa compra.
 * Devuelve cuántos gastos se borraron.
 */
export async function deleteExpense(userId: string, id: string, scope: "one" | "purchase" = "one") {
  const expense = await db.expense.findFirst({ where: { id, userId }, select: { purchaseId: true } });
  if (!expense) throw new ExpenseError("Gasto no encontrado");

  const where =
    scope === "purchase" && expense.purchaseId ? { userId, purchaseId: expense.purchaseId } : { id, userId };
  const { count } = await db.expense.deleteMany({ where });
  if (count === 0) throw new ExpenseError("Gasto no encontrado");
  return count;
}

/** Un gasto del usuario, o null si no existe o es de otra persona */
export async function getExpense(userId: string, id: string) {
  const row = await db.expense.findFirst({ where: { id, userId }, select: expenseSelect });
  return row ? toDTO(row) : null;
}

/** Medio de pago que más usa el usuario (para cuando el mensaje no lo aclara) */
export async function mostUsedPaymentMethod(userId: string) {
  const [top] = await db.expense.groupBy({
    by: ["paymentMethod"],
    where: { userId },
    _count: { paymentMethod: true },
    orderBy: { _count: { paymentMethod: "desc" } },
    take: 1,
  });
  return top?.paymentMethod ?? "DEBIT";
}
