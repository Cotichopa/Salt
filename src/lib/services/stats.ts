import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { resolveCategoryIcon } from "@/lib/category-icon-data";
import { dateToISO, monthRange, todayISO, type CurrencyCode, type PaymentMethodCode } from "@/lib/format";

// Números del dashboard. Las sumas las hace PostgreSQL con groupBy (agrupar y sumar
// en la base es mucho más rápido que traer todos los gastos y sumarlos acá).

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

function daysInMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

// Se suman TODOS los gastos, en la moneda en que se quiere ver: cada gasto guarda su valor en
// pesos y en dólares (convertido con la cotización de su día, ver services/expenses.ts)
type Sum = { _sum: { amountArs: Prisma.Decimal | null; amountUsd: Prisma.Decimal | null } };
const SUM = { amountArs: true, amountUsd: true } as const;

async function sumBetween(userId: string, currency: CurrencyCode, from: Date, to: Date) {
  const r = await db.expense.aggregate({
    where: { userId, date: { gte: from, lt: to } },
    _sum: SUM,
    _count: true,
  });
  return { total: pick(r, currency), count: r._count };
}

/** El total de un grupo en la moneda elegida */
function pick(r: Sum, currency: CurrencyCode) {
  return (currency === "ARS" ? r._sum.amountArs : r._sum.amountUsd)?.toNumber() ?? 0;
}

export async function getDashboard(userId: string, month: string, currency: CurrencyCode) {
  const today = todayISO();
  const isCurrentMonth = month === today.slice(0, 7);
  const { from, to } = monthRange(month);
  const where = { userId, date: { gte: from, lt: to } };

  // Si es el mes en curso comparamos contra los mismos días del mes pasado
  // (del 1 al día de hoy); si es un mes cerrado, contra el mes anterior completo.
  const prevMonth = shiftMonth(month, -1);
  const prev = monthRange(prevMonth);
  const elapsedDays = isCurrentMonth ? Number(today.slice(8, 10)) : daysInMonth(month);
  const prevTo = isCurrentMonth
    ? new Date(Math.min(prev.from.getTime() + elapsedDays * 86_400_000, prev.to.getTime()))
    : prev.to;

  const [current, previous, byCategoryRaw, byMethodRaw, bySourceRaw, byDayRaw, prevDayRaw, biggestRaw] =
    await Promise.all([
    sumBetween(userId, currency, from, to),
    sumBetween(userId, currency, prev.from, prevTo),
    db.expense.groupBy({ by: ["categoryId"], where, _sum: SUM }),
    db.expense.groupBy({ by: ["paymentMethod"], where, _sum: SUM }),
    db.expense.groupBy({ by: ["paymentSourceId"], where, _sum: SUM }),
    db.expense.groupBy({ by: ["date"], where, _sum: SUM }),
    db.expense.groupBy({
      by: ["date"],
      where: { userId, date: { gte: prev.from, lt: prev.to } },
      _sum: SUM,
    }),
    db.expense.findFirst({
      where,
      orderBy: { [currency === "ARS" ? "amountArs" : "amountUsd"]: { sort: "desc", nulls: "last" } },
      select: {
        amountArs: true,
        amountUsd: true,
        description: true,
        date: true,
        category: { select: { name: true } },
      },
    }),
    ]);

  // Tarjetas y billeteras usadas este mes, de mayor a menor
  const sourceIds = bySourceRaw.map((r) => r.paymentSourceId).filter((id): id is string => id !== null);
  const sourceNames = await db.paymentSource.findMany({
    where: { id: { in: sourceIds } },
    select: { id: true, name: true },
  });
  const sourceById = new Map(sourceNames.map((s) => [s.id, s.name]));
  const bySource = bySourceRaw
    .map((r) => ({
      name: r.paymentSourceId ? (sourceById.get(r.paymentSourceId) ?? "?") : "Sin especificar",
      total: pick(r, currency),
    }))
    .sort((a, b) => b.total - a.total);

  // Categorías: sumar y ordenar de mayor a menor, con nombre e ícono
  const categories = await db.category.findMany({
    where: { id: { in: byCategoryRaw.map((c) => c.categoryId) } },
    select: { id: true, name: true, emoji: true, icon: true },
  });
  const catById = new Map(categories.map((c) => [c.id, c]));
  const byCategory = byCategoryRaw
    .map((c) => {
      const cat = catById.get(c.categoryId);
      return {
        id: c.categoryId as string | null,
        name: cat?.name ?? "?",
        icon: resolveCategoryIcon(cat?.icon, cat?.emoji) as string | null,
        total: pick(c, currency),
      };
    })
    .sort((a, b) => b.total - a.total);

  const methodOrder: PaymentMethodCode[] = ["DEBIT", "CREDIT", "CASH", "TRANSFER"];
  const byMethod = methodOrder.map((m) => {
    const row = byMethodRaw.find((r) => r.paymentMethod === m);
    return { method: m, total: row ? pick(row, currency) : 0 };
  });

  // Un punto por cada día del mes (los días sin gastos quedan en 0, no desaparecen)
  const dayTotals = new Map(byDayRaw.map((d) => [dateToISO(d.date), pick(d, currency)]));
  const byDay = Array.from({ length: daysInMonth(month) }, (_, i) => {
    const iso = `${month}-${String(i + 1).padStart(2, "0")}`;
    return { day: i + 1, total: dayTotals.get(iso) ?? 0, future: iso > today };
  });

  // Acumulado día a día: cuánto llevás gastado al día N, este mes y el mes pasado
  const prevDayTotals = new Map<number, number>();
  for (const d of prevDayRaw) prevDayTotals.set(d.date.getUTCDate(), pick(d, currency));
  let runNow = 0;
  let runPrev = 0;
  const prevDays = daysInMonth(prevMonth);
  const cumulative = byDay.map((d) => {
    runNow += d.total;
    runPrev += prevDayTotals.get(d.day) ?? 0;
    return {
      day: d.day,
      actual: d.future ? null : runNow, // no dibujamos los días que todavía no pasaron
      anterior: d.day <= prevDays ? runPrev : null,
    };
  });

  // Gasto por día de la semana (lunes a domingo)
  const weekdayNames = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
  const weekdayTotals = new Array(7).fill(0);
  for (const d of byDayRaw) {
    const jsDay = d.date.getUTCDay(); // 0 = domingo
    weekdayTotals[(jsDay + 6) % 7] += pick(d, currency);
  }
  const byWeekday = weekdayNames.map((name, i) => ({ name, total: weekdayTotals[i] }));

  // Proyección: si seguís gastando al ritmo de estos días, cuánto terminarías gastando
  const totalDays = daysInMonth(month);
  const projection = isCurrentMonth && elapsedDays > 0 ? (current.total / elapsedDays) * totalDays : null;

  const biggest = biggestRaw
    ? {
        amount: (currency === "ARS" ? biggestRaw.amountArs : biggestRaw.amountUsd)?.toNumber() ?? 0,
        description: biggestRaw.description,
        date: dateToISO(biggestRaw.date),
        category: biggestRaw.category.name,
      }
    : null;

  return {
    total: current.total,
    count: current.count,
    dailyAverage: elapsedDays > 0 ? current.total / elapsedDays : 0,
    previousTotal: previous.total,
    comparisonLabel: isCurrentMonth ? "vs. mismos días del mes pasado" : "vs. mes anterior",
    byCategory,
    byMethod,
    bySource,
    byDay,
    cumulative,
    byWeekday,
    projection,
    averageTicket: current.count > 0 ? current.total / current.count : 0,
    biggest,
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
