import "server-only";
import { db } from "@/lib/db";
import { dateToISO, isoToDate, monthRange, type CurrencyCode, type PaymentMethodCode } from "@/lib/format";
import type { ExpenseInput } from "@/lib/validators";
import { assertCategoryUsable, CategoryError } from "@/lib/services/categories";
import type { Prisma, Source } from "@/generated/prisma/client";

// Lógica de gastos, compartida por la web y el bot de WhatsApp.
// Regla de oro: TODAS las funciones reciben el userId y filtran por él,
// así nadie puede ver ni tocar gastos de otra persona.

export class ExpenseError extends Error {}

export type ExpenseFilters = {
  month?: string; // "2026-09"
  categoryId?: string;
  currency?: CurrencyCode;
  paymentMethod?: PaymentMethodCode;
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
  category: { id: string; name: string; emoji: string | null };
};

const expenseSelect = {
  id: true,
  amount: true,
  currency: true,
  paymentMethod: true,
  description: true,
  date: true,
  source: true,
  category: { select: { id: true, name: true, emoji: true } },
} satisfies Prisma.ExpenseSelect;

function toDTO(e: Prisma.ExpenseGetPayload<{ select: typeof expenseSelect }>): ExpenseDTO {
  return { ...e, amount: e.amount.toNumber(), date: dateToISO(e.date) };
}

export async function listExpenses(userId: string, filters: ExpenseFilters = {}) {
  const where: Prisma.ExpenseWhereInput = { userId };
  if (filters.month) {
    const { from, to } = monthRange(filters.month);
    where.date = { gte: from, lt: to };
  }
  if (filters.categoryId) where.categoryId = filters.categoryId;
  if (filters.currency) where.currency = filters.currency;
  if (filters.paymentMethod) where.paymentMethod = filters.paymentMethod;

  const rows = await db.expense.findMany({
    where,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    select: expenseSelect,
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

export async function createExpense(userId: string, input: ExpenseInput, source: Source = "WEB") {
  await assertCategoryAllowed(userId, input.categoryId);
  const row = await db.expense.create({
    data: { ...input, date: isoToDate(input.date), userId, source },
    select: expenseSelect,
  });
  return toDTO(row);
}

export async function updateExpense(userId: string, id: string, input: ExpenseInput) {
  await assertCategoryAllowed(userId, input.categoryId);
  // updateMany con userId en el filtro: si el gasto no es tuyo, no actualiza nada
  const { count } = await db.expense.updateMany({
    where: { id, userId },
    data: { ...input, date: isoToDate(input.date) },
  });
  if (count === 0) throw new ExpenseError("Gasto no encontrado");
}

export async function deleteExpense(userId: string, id: string) {
  const { count } = await db.expense.deleteMany({ where: { id, userId } });
  if (count === 0) throw new ExpenseError("Gasto no encontrado");
}
