import "server-only";
import { db } from "@/lib/db";
import {
  dateToISO,
  dollarTypeFor,
  isoToDate,
  monthRange,
  type CurrencyCode,
  type DollarTypeCode,
  type PaymentMethodCode,
} from "@/lib/format";
import type { ExpenseInput } from "@/lib/validators";
import { getRate, RateUnavailableError, tryGetRate } from "@/lib/services/exchange-rates";
import { rememberMerchant } from "@/lib/services/merchants";

// Los campos nuevos son opcionales para quien llama (el bot todavía no los manda)
type ExpenseData = Omit<ExpenseInput, "installments" | "paymentSourceId" | "dollarType" | "rate"> & {
  installments?: number;
  paymentSourceId?: string;
  dollarType?: DollarTypeCode;
  rate?: number;
  recurringId?: string; // lo cargó un gasto fijo (ver recurring.ts)
  rateOptional?: boolean; // en dólares: si no hay cotización, se guarda sin pesos (se convierte después)
  receiptId?: string; // foto del ticket (la mandó a Chop): en cuotas, todas la comparten
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
  dollarType: DollarTypeCode | null; // solo en USD: a qué dólar se pagó
  rate: number | null; // cotización usada
  amountArs: number | null; // el gasto en pesos (null en gastos viejos sin convertir)
  amountUsd: number | null; // el gasto en dólares
  recurringId: string | null; // lo cargó solo un gasto fijo
  receiptId: string | null; // tiene foto del ticket (se ve en /api/tickets/<id>)
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
  dollarType: true,
  rate: true,
  amountArs: true,
  amountUsd: true,
  recurringId: true,
  receiptId: true,
  category: { select: { id: true, name: true, emoji: true, icon: true } },
  paymentSource: { select: { id: true, name: true } },
} satisfies Prisma.ExpenseSelect;

function toDTO(e: Prisma.ExpenseGetPayload<{ select: typeof expenseSelect }>): ExpenseDTO {
  return {
    ...e,
    amount: e.amount.toNumber(),
    date: dateToISO(e.date),
    rate: e.rate?.toNumber() ?? null,
    amountArs: e.amountArs?.toNumber() ?? null,
    amountUsd: e.amountUsd?.toNumber() ?? null,
  };
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

/** Totales por moneda, sin convertir (los usa el resumen de Chop) */
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

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Con qué cotización se convierte el gasto:
 * - USD: con crédito, el oficial; si no, el dólar elegido (o el MEP, si no se eligió, como pasa
 *   con Chop). Con su cotización de ese día, o la que se cargó a mano.
 * - ARS: el MEP del día, solo para poder mostrar el gasto en dólares.
 * Desde la web (con dólar elegido) no se guarda un USD sin cotización: se pide a mano.
 */
async function conversionFor(input: ExpenseData) {
  if (input.currency === "ARS") {
    const mep = await tryGetRate("MEP", input.date);
    return { dollarType: null, rate: null, mep: mep?.sell ?? null };
  }
  const dollarType = dollarTypeFor(input.paymentMethod, input.dollarType);
  if (input.rate) return { dollarType, rate: input.rate, mep: null };
  try {
    const rate =
      input.dollarType && !input.rateOptional ? await getRate(dollarType, input.date) : await tryGetRate(dollarType, input.date);
    return { dollarType, rate: rate?.sell ?? null, mep: null };
  } catch (e) {
    if (e instanceof RateUnavailableError) throw new ExpenseError(e.message);
    throw e;
  }
}

export type Conversion = Awaited<ReturnType<typeof conversionFor>>;

/** Las columnas de conversión para un monto (cada cuota usa la cotización del día de la compra) */
export function convertAmount(amount: number, currency: CurrencyCode, c: Conversion) {
  return {
    dollarType: c.dollarType,
    rate: c.rate,
    amountArs: currency === "ARS" ? amount : c.rate ? round2(amount * c.rate) : null,
    amountUsd: currency === "USD" ? amount : c.mep ? round2(amount / c.mep) : null,
  };
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
export async function createExpense(userId: string, { rateOptional, ...input }: ExpenseData, source: Source = "WEB") {
  await assertCategoryAllowed(userId, input.categoryId);
  await assertSourceAllowed(userId, input);

  const installments = Math.max(1, Math.min(input.installments ?? 1, 36));
  const conversion = await conversionFor({ ...input, rateOptional });
  // Con foto de ticket: el comercio (su CUIT) queda anotado en esta categoría para el próximo ticket
  const remember = () => input.receiptId && rememberMerchant(userId, input.receiptId, input.categoryId, input.description);
  if (installments === 1) {
    const row = await db.expense.create({
      data: {
        ...input,
        ...convertAmount(input.amount, input.currency, conversion),
        installments: 1,
        date: isoToDate(input.date),
        userId,
        source,
      },
      select: expenseSelect,
    });
    await remember();
    return toDTO(row);
  }

  // Repartimos en centavos para que la suma de las cuotas dé exactamente el total
  const totalCents = Math.round(input.amount * 100);
  const baseCents = Math.floor(totalCents / installments);
  const purchaseId = crypto.randomUUID();

  const rows = Array.from({ length: installments }, (_, i) => {
    // La última cuota se lleva los centavos que sobraron del reparto
    const amount = (i === installments - 1 ? totalCents - baseCents * (installments - 1) : baseCents) / 100;
    return {
      ...input,
      ...convertAmount(amount, input.currency, conversion),
      amount,
      date: addMonths(input.date, i),
      installments,
      installmentNumber: i + 1,
      purchaseId,
      userId,
      source,
    };
  });
  await db.expense.createMany({ data: rows });
  await remember();

  const first = await db.expense.findFirstOrThrow({
    where: { purchaseId, installmentNumber: 1 },
    select: expenseSelect,
  });
  return toDTO(first);
}

export async function updateExpense(userId: string, id: string, input: ExpenseData) {
  await assertCategoryAllowed(userId, input.categoryId);
  await assertSourceAllowed(userId, input);
  const current = await db.expense.findFirst({
    where: { id, userId },
    select: { amount: true, currency: true, date: true, dollarType: true, rate: true, categoryId: true, receiptId: true },
  });
  if (!current) throw new ExpenseError("Gasto no encontrado");

  // La conversión se recalcula solo si cambió algo que la afecta: si no, queda la del día que se cargó
  const dollarType =
    input.currency === "USD" ? dollarTypeFor(input.paymentMethod, input.dollarType ?? current.dollarType) : undefined;
  const changed =
    current.amount.toNumber() !== input.amount ||
    current.currency !== input.currency ||
    dateToISO(current.date) !== input.date ||
    (input.currency === "USD" && (current.dollarType !== dollarType || (input.rate ?? null) !== (current.rate?.toNumber() ?? null)));
  const conversion = changed
    ? convertAmount(input.amount, input.currency, await conversionFor({ ...input, dollarType }))
    : {};

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
      ...conversion,
    },
  });
  if (count === 0) throw new ExpenseError("Gasto no encontrado");
  // Si vino de un ticket y se le cambió la categoría, el comercio pasa a la nueva
  if (current.receiptId && current.categoryId !== input.categoryId) {
    await rememberMerchant(userId, current.receiptId, input.categoryId);
  }
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
