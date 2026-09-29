import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { formatMoney, formatMonth, isoToDate, dateToISO, todayISO } from "@/lib/format";
import { listBudgets } from "@/lib/services/budgets";
import { getStatement, shiftMonth, statementToShow } from "@/lib/services/card-statements";

// Avisos de Chop: vencimiento de tarjetas y resúmenes de la semana y del mes pasados.
// Meta no deja que Chop escriba primero (salvo con plantillas pagas), así que los avisos se
// entregan cuando la persona le escribe. Cada aviso se entrega una sola vez: al entregarlo se
// guarda su clave en la tabla `notices` (ver schema.prisma).

export type NoticeSettings = { notifyCardDue: boolean; notifyWeekly: boolean; notifyMonthly: boolean };
export type NoticeSetting = keyof NoticeSettings;

const SETTINGS = { notifyCardDue: true, notifyWeekly: true, notifyMonthly: true } as const;

/** Qué avisos tiene prendidos la persona (se cambian desde "Cuenta") */
export async function getNoticeSettings(userId: string): Promise<NoticeSettings> {
  return db.user.findUniqueOrThrow({ where: { id: userId }, select: SETTINGS });
}

export async function setNoticeSetting(userId: string, setting: NoticeSetting, on: boolean) {
  await db.user.update({ where: { id: userId }, data: { [setting]: on } });
}

const DAY_MS = 86_400_000;
const addDays = (iso: string, days: number) => dateToISO(new Date(isoToDate(iso).getTime() + days * DAY_MS));
const daysBetween = (from: string, to: string) => Math.round((isoToDate(to).getTime() - isoToDate(from).getTime()) / DAY_MS);
const shortDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`; // "2026-10-07" → "07/10"
// En los resúmenes, sin centavos
const pesos = (n: number) => formatMoney(Math.round(n), "ARS");

/** Los avisos que todavía no se entregaron, ya marcados como entregados. Vacío si no hay ninguno. */
export async function pendingNotices(userId: string): Promise<string[]> {
  const settings = await db.user.findUnique({ where: { id: userId }, select: SETTINGS });
  if (!settings) return [];

  const candidates = [
    ...(settings.notifyCardDue ? await cardDueNotices(userId) : []),
    ...(settings.notifyWeekly ? [await weeklyNotice(userId)] : []),
    ...(settings.notifyMonthly ? [await monthlyNotice(userId)] : []),
  ].filter((n): n is Candidate => n !== null);

  const texts: string[] = [];
  for (const { key, text } of candidates) {
    if (await markDelivered(userId, key)) texts.push(text);
  }
  return texts;
}

type Candidate = { key: string; text: string };

/**
 * Guarda el aviso como entregado. false si ya estaba: así, si llegan dos mensajes juntos,
 * la base (clave única) decide cuál lo entrega y no sale repetido.
 */
async function markDelivered(userId: string, key: string) {
  try {
    await db.notice.create({ data: { userId, key } });
    return true;
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
    throw e;
  }
}

// ---------- Vencimiento de tarjetas ----------

/** Resúmenes a pagar que vencen en 3 días o menos: un aviso 3 días antes y otro el día anterior */
async function cardDueNotices(userId: string): Promise<Candidate[]> {
  const today = todayISO();
  const cards = await db.paymentSource.findMany({
    where: { userId, kind: "CARD", closingDay: { not: null }, dueDay: { not: null } },
    select: { id: true },
  });
  const notices: Candidate[] = [];
  for (const card of cards) {
    const month = await statementToShow(userId, card.id);
    const s = month ? await getStatement(userId, card.id, month) : null;
    if (!s?.configured || s.status !== "a pagar" || s.expenses.length === 0) continue;

    const days = daysBetween(today, s.due);
    if (days > 3) continue;
    const when = days === 0 ? "vence *hoy*" : days === 1 ? "vence *mañana*" : `vence en ${days} días`;
    // Si los dólares no se pudieron pasar a pesos, van aparte
    const usd = s.usd > 0 && s.usdInPesos === null ? ` + ${formatMoney(s.usd, "USD")}` : "";
    const approx = s.rate?.estimated ? " _(aprox., al dólar de hoy)_" : "";
    notices.push({
      key: `${days <= 1 ? "due1" : "due3"}:${card.id}:${s.month}`,
      text: `💳 La *${s.card.name}* ${when} (${shortDay(s.due)}): *${formatMoney(s.total, "ARS")}*${usd}${approx}.`,
    });
  }
  return notices;
}

// ---------- Resúmenes ----------

type Period = { from: string; to: string }; // "to" no se incluye

/** Total en pesos y las 3 categorías más grandes de un período */
async function periodSummary(userId: string, { from, to }: Period) {
  const where = { userId, date: { gte: isoToDate(from), lt: isoToDate(to) } };
  const [total, byCategory] = await Promise.all([
    db.expense.aggregate({ where, _sum: { amountArs: true }, _count: true }),
    db.expense.groupBy({
      by: ["categoryId"],
      where,
      _sum: { amountArs: true },
      orderBy: { _sum: { amountArs: "desc" } },
      take: 3,
    }),
  ]);
  const names = await db.category.findMany({
    where: { id: { in: byCategory.map((c) => c.categoryId) } },
    select: { id: true, name: true },
  });
  const top = byCategory
    .map((c) => ({ name: names.find((n) => n.id === c.categoryId)?.name ?? "?", amount: c._sum.amountArs?.toNumber() ?? 0 }))
    .filter((c) => c.amount > 0);
  return { total: total._sum.amountArs?.toNumber() ?? 0, count: total._count, top };
}

/** "12 % más que la semana anterior" (nada si el período anterior no tuvo gastos) */
function comparison(current: number, previous: number, previousLabel: string) {
  if (previous <= 0) return "";
  const change = Math.round(((current - previous) / previous) * 100);
  if (change === 0) return ` (igual que ${previousLabel})`;
  return ` (${Math.abs(change)} % ${change > 0 ? "más" : "menos"} que ${previousLabel})`;
}

const topText = (top: { name: string; amount: number }[]) =>
  top.length > 0 ? `\nLo que más: ${top.map((c) => `${c.name} ${pesos(c.amount)}`).join(" · ")}.` : "";

/** La semana pasada (lunes a domingo), comparada con la anterior. Solo si hubo gastos. */
async function weeklyNotice(userId: string): Promise<Candidate | null> {
  const today = todayISO();
  const weekday = (isoToDate(today).getUTCDay() + 6) % 7; // lunes = 0
  const thisMonday = addDays(today, -weekday);
  const week = { from: addDays(thisMonday, -7), to: thisMonday };
  const before = { from: addDays(thisMonday, -14), to: week.from };

  const [current, previous] = await Promise.all([periodSummary(userId, week), periodSummary(userId, before)]);
  if (current.count === 0) return null;
  return {
    key: `week:${week.from}`,
    text:
      `📅 *Tu semana* (${shortDay(week.from)} al ${shortDay(addDays(week.to, -1))}): gastaste ` +
      `*${pesos(current.total)}*${comparison(current.total, previous.total, "la anterior")}.` +
      topText(current.top),
  };
}

// Los avisos empezaron en septiembre de 2026: el primer resumen mensual es el de septiembre
// (llega en octubre), no uno de un mes que ya pasó hace rato (decisión de Felipe)
const FIRST_MONTHLY = "2026-09";

/** El mes pasado, comparado con el anterior, y cómo cerraron los presupuestos. Solo si hubo gastos. */
async function monthlyNotice(userId: string): Promise<Candidate | null> {
  const month = shiftMonth(todayISO().slice(0, 7), -1);
  if (month < FIRST_MONTHLY) return null;
  const prevMonth = shiftMonth(month, -1);
  const range = (m: string) => ({ from: `${m}-01`, to: `${shiftMonth(m, 1)}-01` });

  const [current, previous, budgets] = await Promise.all([
    periodSummary(userId, range(month)),
    periodSummary(userId, range(prevMonth)),
    listBudgets(userId, month),
  ]);
  if (current.count === 0) return null;

  const exceeded = budgets.filter((b) => b.level === "exceeded").map((b) => b.name);
  const budgetText =
    budgets.length === 0
      ? ""
      : exceeded.length === 0
        ? "\nCumpliste todos tus presupuestos 👏"
        : `\nTe pasaste del presupuesto de: ${exceeded.join(", ")}.`;
  const prevName = formatMonth(prevMonth).split(" ")[0].toLowerCase();
  return {
    key: `month:${month}`,
    text:
      `🗓️ *${formatMonth(month)}*: gastaste *${pesos(current.total)}*` +
      `${comparison(current.total, previous.total, prevName)}.` +
      topText(current.top) +
      budgetText,
  };
}
