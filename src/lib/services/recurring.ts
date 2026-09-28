import "server-only";
import { db } from "@/lib/db";
import { dollarTypeFor, monthRange, todayISO, type CurrencyCode, type DollarTypeCode, type PaymentMethodCode } from "@/lib/format";
import type { RecurringInput } from "@/lib/validators";
import { assertCategoryUsable, CategoryError } from "@/lib/services/categories";
import { assertUsable, PaymentSourceError } from "@/lib/services/payment-sources";
import { createExpense, ExpenseError, getExpense, updateExpense } from "@/lib/services/expenses";
import { Prisma } from "@/generated/prisma/client";

// Gastos fijos: se cargan solos una vez por mes, el día elegido, al abrir Inicio o Gastos
// (loadDueRecurring). Cada fijo recuerda el último mes que ya cargó (lastMonth), así:
// - si pasaste dos meses sin abrir la app, al volver se cargan los dos;
// - si borrás el gasto que cargó, no lo vuelve a cargar.
// Y cada gasto cargado guarda su recurringId (único por día), para no duplicar nunca.

export class RecurringError extends Error {}

export type RecurringDTO = {
  id: string;
  description: string;
  amount: number;
  currency: CurrencyCode;
  dollarType: DollarTypeCode | null;
  paymentMethod: PaymentMethodCode;
  paymentSource: { id: string; name: string } | null;
  category: { id: string; name: string; emoji: string | null; icon: string | null };
  day: number;
  active: boolean;
  nextAmount: number | null; // monto nuevo que empieza a valer en nextAmountFrom
  nextAmountFrom: string | null;
  nextDate: string | null; // "YYYY-MM-DD" de la próxima carga (null si está pausado)
  loadedThisMonth: boolean; // el de este mes ya se cargó (o se salteó)
};

/** Lo que se cargó solo, para el aviso */
export type LoadedRecurring = { description: string; amount: number; currency: CurrencyCode; date: string };

// ---------- Meses ----------

/** "2026-09" → "2026-10" (delta = 1) */
export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** El día `day` de ese mes, o el último si el mes es más corto (el 31 en febrero → 28/29) */
export function dateInMonth(month: string, day: number) {
  const { to } = monthRange(month);
  const lastDay = new Date(to.getTime() - 86_400_000).getUTCDate();
  return `${month}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

/**
 * Desde qué mes se empieza a cargar (se guarda como lastMonth = el mes anterior):
 * si el día de este mes todavía no llegó, se carga este mes; si ya pasó, el próximo,
 * salvo que pidas cargar el de este mes también.
 */
function initialLastMonth(day: number, today: string, loadThisMonth: boolean) {
  const current = today.slice(0, 7);
  const alreadyPassed = dateInMonth(current, day) <= today;
  return alreadyPassed && !loadThisMonth ? current : shiftMonth(current, -1);
}

// ---------- Consultas ----------

const recurringSelect = {
  id: true,
  description: true,
  amount: true,
  currency: true,
  dollarType: true,
  paymentMethod: true,
  day: true,
  active: true,
  lastMonth: true,
  nextAmount: true,
  nextAmountFrom: true,
  paymentSource: { select: { id: true, name: true } },
  category: { select: { id: true, name: true, emoji: true, icon: true } },
} satisfies Prisma.RecurringExpenseSelect;

export async function listRecurring(userId: string, today = todayISO()): Promise<RecurringDTO[]> {
  const rows = await db.recurringExpense.findMany({
    where: { userId },
    orderBy: [{ active: "desc" }, { day: "asc" }, { description: "asc" }],
    select: recurringSelect,
  });
  const current = today.slice(0, 7);
  return rows.map(({ lastMonth, ...r }) => ({
    ...r,
    amount: r.amount.toNumber(),
    nextAmount: r.nextAmount?.toNumber() ?? null,
    nextDate: r.active ? dateInMonth(shiftMonth(lastMonth, 1), r.day) : null,
    loadedThisMonth: lastMonth >= current,
  }));
}

async function findOwn(userId: string, id: string) {
  const row = await db.recurringExpense.findFirst({ where: { id, userId } });
  if (!row) throw new RecurringError("Gasto fijo no encontrado");
  return row;
}

async function assertAllowed(userId: string, input: RecurringInput) {
  try {
    await assertCategoryUsable(userId, input.categoryId);
    if (input.paymentSourceId) await assertUsable(userId, input.paymentSourceId, input.paymentMethod);
  } catch (e) {
    if (e instanceof CategoryError || e instanceof PaymentSourceError) throw new RecurringError(e.message);
    throw e;
  }
}

/** Las columnas que se copian del formulario al fijo */
function fields(input: RecurringInput) {
  return {
    description: input.description,
    categoryId: input.categoryId,
    amount: input.amount,
    currency: input.currency,
    dollarType: input.currency === "USD" ? dollarTypeFor(input.paymentMethod, input.dollarType) : null,
    paymentMethod: input.paymentMethod,
    paymentSourceId: input.paymentSourceId ?? null,
    day: input.day,
  };
}

// ---------- Alta, cambios y baja ----------

export async function createRecurring(userId: string, input: RecurringInput, today = todayISO()) {
  await assertAllowed(userId, input);
  await db.recurringExpense.create({
    data: { ...fields(input), userId, lastMonth: initialLastMonth(input.day, today, input.loadThisMonth) },
  });
}

/**
 * Los cambios valen para los meses que vienen. El monto es la excepción: con `from = "this"`
 * también se corrige el gasto de este mes si ya se cargó; con `from = "next"` el de este mes
 * queda como está (y si todavía no se cargó, se carga con el monto viejo).
 * Si cambia la moneda, vale desde este mes (no tiene sentido cargar este mes en la moneda vieja).
 */
export async function updateRecurring(
  userId: string,
  id: string,
  input: RecurringInput,
  from: "this" | "next",
  today = todayISO(),
) {
  await assertAllowed(userId, input);
  const current = await findOwn(userId, id);
  const month = today.slice(0, 7);
  const currencyChanged = current.currency !== input.currency;
  const amountChanged = currencyChanged || current.amount.toNumber() !== input.amount;
  const loadedThisMonth = current.lastMonth >= month;

  const data: Prisma.RecurringExpenseUncheckedUpdateInput = fields(input);
  if (amountChanged) {
    if (from === "next" && !currencyChanged && !loadedThisMonth) {
      // Este mes todavía no se cargó: se carga con el monto de siempre y el nuevo, desde el próximo
      data.amount = current.amount;
      data.nextAmount = input.amount;
      data.nextAmountFrom = shiftMonth(month, 1);
    } else {
      data.nextAmount = null;
      data.nextAmountFrom = null;
    }
  }
  await db.recurringExpense.update({ where: { id }, data });

  // "Desde este mes": corregimos el gasto que ya cargó este mes (si no lo borraste)
  if (amountChanged && (from === "this" || currencyChanged) && loadedThisMonth) {
    const { from: start, to } = monthRange(month);
    const loaded = await db.expense.findFirst({
      where: { userId, recurringId: id, date: { gte: start, lt: to } },
      select: { id: true },
    });
    const expense = loaded && (await getExpense(userId, loaded.id));
    if (expense) {
      try {
        await updateExpense(userId, expense.id, {
          amount: input.amount,
          currency: input.currency,
          dollarType: input.currency === "USD" ? dollarTypeFor(input.paymentMethod, input.dollarType) : undefined,
          paymentMethod: expense.paymentMethod,
          categoryId: expense.category.id,
          paymentSourceId: expense.paymentSource?.id,
          description: expense.description,
          date: expense.date,
        });
      } catch (e) {
        if (e instanceof ExpenseError) throw new RecurringError(`El fijo se guardó, pero no pude corregir el gasto de este mes: ${e.message}`);
        throw e;
      }
    }
  }
}

/**
 * Pausar o reanudar. Al reanudar no se cargan los meses que estuvo pausado: arranca como si
 * lo crearas hoy (si el día de este mes ya pasó, desde el próximo).
 */
export async function setRecurringActive(userId: string, id: string, active: boolean, today = todayISO()) {
  const current = await findOwn(userId, id);
  const data: Prisma.RecurringExpenseUpdateInput = { active };
  if (active && !current.active) {
    const start = initialLastMonth(current.day, today, false);
    if (start > current.lastMonth) data.lastMonth = start;
  }
  await db.recurringExpense.update({ where: { id }, data });
}

/** Los gastos que ya cargó no se borran: quedan como cargados a mano */
export async function deleteRecurring(userId: string, id: string) {
  const { count } = await db.recurringExpense.deleteMany({ where: { id, userId } });
  if (count === 0) throw new RecurringError("Gasto fijo no encontrado");
}

// ---------- Carga automática ----------

/**
 * Carga los fijos que ya llegaron a su día y todavía no se cargaron. Devuelve lo que cargó
 * (vacío casi siempre). Si dos pestañas lo corren a la vez, el índice único (recurringId + día)
 * frena el duplicado y la segunda simplemente no lo cuenta.
 */
export async function loadDueRecurring(userId: string, today = todayISO()): Promise<LoadedRecurring[]> {
  const current = today.slice(0, 7);
  const due = await db.recurringExpense.findMany({
    where: { userId, active: true, lastMonth: { lt: current } },
    orderBy: { day: "asc" },
  });

  const loaded: LoadedRecurring[] = [];
  for (const r of due) {
    for (let month = shiftMonth(r.lastMonth, 1); month <= current; month = shiftMonth(month, 1)) {
      const date = dateInMonth(month, r.day);
      if (date > today) break; // el de este mes todavía no llegó

      // ¿Ya empieza a valer el monto nuevo?
      const promote = r.nextAmount !== null && r.nextAmountFrom !== null && month >= r.nextAmountFrom;
      const amount = (promote ? r.nextAmount! : r.amount).toNumber();
      try {
        await createExpense(userId, {
          amount,
          currency: r.currency,
          dollarType: r.dollarType ?? undefined,
          paymentMethod: r.paymentMethod,
          paymentSourceId: r.paymentSourceId ?? undefined,
          categoryId: r.categoryId,
          description: r.description,
          date,
          recurringId: r.id,
        });
        loaded.push({ description: r.description, amount, currency: r.currency, date });
      } catch (e) {
        // Ya lo cargó otra pestaña: no se cuenta, pero se da por cargado
        const duplicate = e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
        if (!duplicate) {
          // Por ejemplo, no se consiguió la cotización del dólar: se reintenta la próxima vez
          if (e instanceof ExpenseError) {
            console.warn(`[fijos] no se pudo cargar "${r.description}" del ${date}: ${e.message}`);
            break;
          }
          throw e;
        }
      }
      // Con lastMonth < month en el filtro, una pestaña atrasada no puede hacerlo retroceder
      await db.recurringExpense.updateMany({
        where: { id: r.id, lastMonth: { lt: month } },
        data: {
          lastMonth: month,
          ...(promote ? { amount: r.nextAmount!, nextAmount: null, nextAmountFrom: null } : {}),
        },
      });
      // Para los meses siguientes de esta misma vuelta, el monto nuevo ya es el de siempre
      if (promote) {
        r.amount = r.nextAmount!;
        r.nextAmount = null;
      }
    }
  }
  return loaded;
}
