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

  const [current, previous, byCategoryRaw, byMethodRaw, bySourceRaw, byDayRaw, prevDayRaw, biggestRaw] =
    await Promise.all([
    sumBetween(userId, currency, from, to),
    sumBetween(userId, currency, prev.from, prevTo),
    db.expense.groupBy({ by: ["categoryId"], where, _sum: { amount: true } }),
    db.expense.groupBy({ by: ["paymentMethod"], where, _sum: { amount: true } }),
    db.expense.groupBy({ by: ["paymentSourceId"], where, _sum: { amount: true } }),
    db.expense.groupBy({ by: ["date"], where, _sum: { amount: true } }),
    db.expense.groupBy({
      by: ["date"],
      where: { userId, currency, date: { gte: prev.from, lt: prev.to } },
      _sum: { amount: true },
    }),
    db.expense.findFirst({
      where,
      orderBy: { amount: "desc" },
      select: {
        amount: true,
        description: true,
        date: true,
        category: { select: { name: true, emoji: true } },
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
      total: r._sum.amount?.toNumber() ?? 0,
    }))
    .sort((a, b) => b.total - a.total);

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

  // Acumulado día a día: cuánto llevás gastado al día N, este mes y el mes pasado
  const prevDayTotals = new Map<number, number>();
  for (const d of prevDayRaw) prevDayTotals.set(d.date.getUTCDate(), d._sum.amount?.toNumber() ?? 0);
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
    weekdayTotals[(jsDay + 6) % 7] += d._sum.amount?.toNumber() ?? 0;
  }
  const byWeekday = weekdayNames.map((name, i) => ({ name, total: weekdayTotals[i] }));

  // Proyección: si seguís gastando al ritmo de estos días, cuánto terminarías gastando
  const totalDays = daysInMonth(month);
  const projection = isCurrentMonth && elapsedDays > 0 ? (current.total / elapsedDays) * totalDays : null;

  const biggest = biggestRaw
    ? {
        amount: biggestRaw.amount.toNumber(),
        description: biggestRaw.description,
        date: dateToISO(biggestRaw.date),
        category: `${biggestRaw.category.emoji ?? ""} ${biggestRaw.category.name}`.trim(),
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
