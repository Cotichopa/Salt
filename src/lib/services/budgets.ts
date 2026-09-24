import "server-only";
import { db } from "@/lib/db";
import { formatMoney, monthRange, todayISO } from "@/lib/format";
import { assertCategoryUsable, CategoryError } from "@/lib/services/categories";
import type { ExpenseDTO } from "@/lib/services/expenses";

// Presupuestos mensuales por categoría (siempre en pesos: los gastos en dólares no cuentan).
// Como el resto, todas las funciones reciben el userId: cada cuenta ve solo los suyos.

export class BudgetError extends Error {}

/** A partir de qué porcentaje avisamos que queda poco */
export const WARNING_AT = 0.8;

export type BudgetLevel = "ok" | "warning" | "exceeded";

export function budgetLevel(spent: number, amount: number): BudgetLevel {
  if (spent >= amount) return "exceeded";
  if (spent >= amount * WARNING_AT) return "warning";
  return "ok";
}

export type BudgetStatus = {
  categoryId: string;
  name: string;
  icon: string | null;
  emoji: string | null;
  amount: number;
  spent: number;
  remaining: number; // negativo si te pasaste
  ratio: number; // 0.5 = 50 %
  level: BudgetLevel;
};

/** Cuánto va gastado (en pesos) en esas categorías en un mes */
async function spentByCategory(userId: string, categoryIds: string[], month: string) {
  const { from, to } = monthRange(month);
  const rows = await db.expense.groupBy({
    by: ["categoryId"],
    where: { userId, currency: "ARS", categoryId: { in: categoryIds }, date: { gte: from, lt: to } },
    _sum: { amount: true },
  });
  return new Map(rows.map((r) => [r.categoryId, r._sum.amount?.toNumber() ?? 0]));
}

/** Todos los presupuestos del usuario con lo gastado en el mes, de más a menos usado */
export async function listBudgets(userId: string, month = todayISO().slice(0, 7)): Promise<BudgetStatus[]> {
  const budgets = await db.budget.findMany({
    where: { userId },
    select: { amount: true, category: { select: { id: true, name: true, icon: true, emoji: true } } },
  });
  if (budgets.length === 0) return [];
  const spent = await spentByCategory(
    userId,
    budgets.map((b) => b.category.id),
    month,
  );
  return budgets
    .map((b) => {
      const amount = b.amount.toNumber();
      const s = spent.get(b.category.id) ?? 0;
      return {
        categoryId: b.category.id,
        name: b.category.name,
        icon: b.category.icon,
        emoji: b.category.emoji,
        amount,
        spent: s,
        remaining: amount - s,
        ratio: s / amount,
        level: budgetLevel(s, amount),
      };
    })
    .sort((a, b) => b.ratio - a.ratio);
}

/** El presupuesto de una categoría con lo gastado este mes, o null si no tiene */
export async function getBudget(userId: string, categoryId: string) {
  const all = await listBudgets(userId);
  return all.find((b) => b.categoryId === categoryId) ?? null;
}

/** Crea o cambia el presupuesto de una categoría (base o propia) */
export async function setBudget(userId: string, categoryId: string, amount: number) {
  try {
    await assertCategoryUsable(userId, categoryId);
  } catch (e) {
    if (e instanceof CategoryError) throw new BudgetError(e.message);
    throw e;
  }
  // upsert = "si existe lo actualizo, si no lo creo"
  await db.budget.upsert({
    where: { userId_categoryId: { userId, categoryId } },
    update: { amount },
    create: { userId, categoryId, amount },
  });
}

export async function removeBudget(userId: string, categoryId: string) {
  await db.budget.deleteMany({ where: { userId, categoryId } });
}

export type BudgetAlert = BudgetStatus & { level: "warning" | "exceeded" };

/**
 * Después de cargar un gasto: ¿cruzó el 80 % o el 100 % del presupuesto?
 * Comparamos lo gastado antes y después de este gasto, así avisamos una sola vez
 * por umbral y no en cada gasto. Si es en cuotas, cuenta la cuota de este mes.
 */
export async function budgetAlertFor(userId: string, expense: ExpenseDTO): Promise<BudgetAlert | null> {
  const month = todayISO().slice(0, 7);
  if (expense.currency !== "ARS" || !expense.date.startsWith(month)) return null;

  const status = await getBudget(userId, expense.category.id);
  if (!status || status.level === "ok") return null;

  const before = budgetLevel(status.spent - expense.amount, status.amount);
  if (before === status.level) return null; // ya estaba en ese nivel: no repetimos el aviso
  return status as BudgetAlert;
}

/** Texto del aviso (lo usan la web y Chop) */
export function budgetAlertText(a: BudgetAlert) {
  return a.level === "exceeded"
    ? `Te pasaste del presupuesto de ${a.name}: llevás ${formatMoney(a.spent, "ARS")} de ${formatMoney(a.amount, "ARS")} este mes.`
    : `Ojo: ya usaste el ${Math.round(a.ratio * 100)} % del presupuesto de ${a.name}. Te quedan ${formatMoney(a.remaining, "ARS")} este mes.`;
}
