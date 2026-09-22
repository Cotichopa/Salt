import "server-only";
import { db } from "@/lib/db";
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

async function sumBetween(userId: string, currency: CurrencyCode, from: Date, to: Date) {
  const r = await db.expense.aggregate({
    where: { userId, currency, date: { gte: from, lt: to } },
    _sum: { amount: true },
    _count: true,
  });
  return { total: r._sum.amount?.toNumber() ?? 0, count: r._count };
}

export async function getDashboard(userId: string, month: string, currency: CurrencyCode) {
  const today = todayISO();
  const isCurrentMonth = month === today.slice(0, 7);
  const { from, to } = monthRange(month);
  const where = { userId, currency, date: { gte: from, lt: to } };

  // Si es el mes en curso comparamos contra los mismos días del mes pasado
  // (del 1 al día de hoy); si es un mes cerrado, contra el mes anterior completo.
  const prevMonth = shiftMonth(month, -1);
  const prev = monthRange(prevMonth);
  const elapsedDays = isCurrentMonth ? Number(today.slice(8, 10)) : daysInMonth(month);
  const prevTo = isCurrentMonth
    ? new Date(Math.min(prev.from.getTime() + elapsedDays * 86_400_000, prev.to.getTime()))
    : prev.to;

  const sixMonthsFrom = monthRange(shiftMonth(month, -5)).from;

  const [current, previous, byCategoryRaw, byMethodRaw, byDayRaw, lastMonthsRaw] = await Promise.all([
    sumBetween(userId, currency, from, to),
    sumBetween(userId, currency, prev.from, prevTo),
    db.expense.groupBy({ by: ["categoryId"], where, _sum: { amount: true } }),
    db.expense.groupBy({ by: ["paymentMethod"], where, _sum: { amount: true } }),
    db.expense.groupBy({ by: ["date"], where, _sum: { amount: true } }),
    db.expense.groupBy({
      by: ["date"],
      where: { userId, currency, date: { gte: sixMonthsFrom, lt: to } },
      _sum: { amount: true },
    }),
  ]);

  // Categorías: sumar y ordenar de mayor a menor, con nombre y emoji
  const categories = await db.category.findMany({
    where: { id: { in: byCategoryRaw.map((c) => c.categoryId) } },
    select: { id: true, name: true, emoji: true },
  });
  const catById = new Map(categories.map((c) => [c.id, c]));
  const byCategory = byCategoryRaw
    .map((c) => {
      const cat = catById.get(c.categoryId);
      return { name: `${cat?.emoji ?? ""} ${cat?.name ?? "?"}`.trim(), total: c._sum.amount?.toNumber() ?? 0 };
    })
    .sort((a, b) => b.total - a.total);

  const methodOrder: PaymentMethodCode[] = ["DEBIT", "CREDIT", "CASH", "TRANSFER"];
  const byMethod = methodOrder.map((m) => ({
    method: m,
    total: byMethodRaw.find((r) => r.paymentMethod === m)?._sum.amount?.toNumber() ?? 0,
  }));

  // Un punto por cada día del mes (los días sin gastos quedan en 0, no desaparecen)
  const dayTotals = new Map(byDayRaw.map((d) => [dateToISO(d.date), d._sum.amount?.toNumber() ?? 0]));
  const byDay = Array.from({ length: daysInMonth(month) }, (_, i) => {
    const iso = `${month}-${String(i + 1).padStart(2, "0")}`;
    return { day: i + 1, total: dayTotals.get(iso) ?? 0, future: iso > today };
  });

  const monthTotals = new Map<string, number>();
  for (const d of lastMonthsRaw) {
    const key = dateToISO(d.date).slice(0, 7);
    monthTotals.set(key, (monthTotals.get(key) ?? 0) + (d._sum.amount?.toNumber() ?? 0));
  }
  const lastMonths = Array.from({ length: 6 }, (_, i) => {
    const key = shiftMonth(month, i - 5);
    return { month: key, total: monthTotals.get(key) ?? 0, selected: key === month };
  });

  return {
    total: current.total,
    count: current.count,
    dailyAverage: elapsedDays > 0 ? current.total / elapsedDays : 0,
    previousTotal: previous.total,
    comparisonLabel: isCurrentMonth ? "vs. mismos días del mes pasado" : "vs. mes anterior",
    byCategory,
    byMethod,
    byDay,
    lastMonths,
  };
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
