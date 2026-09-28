import "server-only";
import { db } from "@/lib/db";
import { dateToISO, isoToDate, todayISO } from "@/lib/format";
import { listExpenses } from "@/lib/services/expenses";
import { tryGetRate } from "@/lib/services/exchange-rates";

// Resumen de cada tarjeta de crédito. Cada resumen se nombra por el mes en que cierra
// ("2026-09" = el que cierra en septiembre) y junta los gastos con CRÉDITO de esa tarjeta
// desde el día siguiente al cierre anterior hasta su cierre. Las cuotas caen solas en el
// resumen que les toca, porque cada cuota ya se guarda con su fecha (una por mes).
//
// Las fechas salen del día fijo de la tarjeta (closingDay / dueDay), salvo que ese resumen
// tenga las fechas corregidas a mano (tabla card_statements).
//
// Los dólares se muestran aparte y se pasan a pesos al DÓLAR OFICIAL (el banco cobra al oficial del día)
// (que es cuando se paga): si todavía no venció, con el de hoy, como estimado.
//
// Cuando lo pagás, lo marcás como pagado (tabla card_payments): desde ahí se muestran los
// números reales del pago en vez del estimado. El pago NO es un gasto (los gastos de la
// tarjeta ya están cargados uno por uno: sería contarlos dos veces).

export class StatementError extends Error {}

type Card = { id: string; name: string; closingDay: number | null; dueDay: number | null };
type Override = { month: string; closingDate: Date; dueDate: Date };

// vencido = pasó el vencimiento y no se marcó como pagado
export type StatementStatus = "abierto" | "a pagar" | "vencido" | "pagado";

const round2 = (n: number) => Math.round(n * 100) / 100;

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

/** El día `day` de ese mes, o el último si el mes es más corto (el 31 en febrero cae el 28) */
function dayOfMonth(month: string, day: number) {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(Math.min(day, last)).padStart(2, "0")}`;
}

/** Cierre y vencimiento de un resumen: los corregidos a mano o, si no hay, los del día fijo */
function statementDates(card: Card, month: string, overrides: Override[]) {
  const fixed = overrides.find((o) => o.month === month);
  if (fixed) return { closing: dateToISO(fixed.closingDate), due: dateToISO(fixed.dueDate), corrected: true };

  const closing = dayOfMonth(month, card.closingDay!);
  // Vence el primer día `dueDay` después del cierre: el mismo mes o el siguiente
  const sameMonth = dayOfMonth(month, card.dueDay!);
  const due = sameMonth > closing ? sameMonth : dayOfMonth(shiftMonth(month, 1), card.dueDay!);
  return { closing, due, corrected: false };
}

const nextDay = (iso: string) => dateToISO(new Date(isoToDate(iso).getTime() + 86_400_000));

/** La tarjeta (solo si es del usuario) con las correcciones de fechas cerca de ese mes */
async function loadCard(userId: string, cardId: string, months: string[]) {
  const card = await db.paymentSource.findFirst({
    where: { id: cardId, userId, kind: "CARD" },
    select: { id: true, name: true, closingDay: true, dueDay: true },
  });
  if (!card) return null;
  const overrides = await db.cardStatement.findMany({
    where: { paymentSourceId: cardId, month: { in: months } },
    select: { month: true, closingDate: true, dueDate: true },
  });
  return { card, overrides };
}

/** El resumen que está abierto hoy: el primero que cierra hoy o después */
export async function currentStatementMonth(userId: string, cardId: string) {
  const today = todayISO();
  const month = today.slice(0, 7);
  const loaded = await loadCard(userId, cardId, [month, shiftMonth(month, 1)]);
  if (!loaded?.card.closingDay) return null;
  const { closing } = statementDates(loaded.card, month, loaded.overrides);
  return closing >= today ? month : shiftMonth(month, 1);
}

/**
 * El resumen que más importa hoy: el que ya cerró y todavía no venció (hay que pagarlo),
 * o si no hay ninguno, el que está abierto.
 */
export async function statementToShow(userId: string, cardId: string) {
  const open = await currentStatementMonth(userId, cardId);
  if (!open) return null;
  const previous = await getStatement(userId, cardId, shiftMonth(open, -1));
  return previous?.configured && previous.status === "a pagar" ? previous.month : open;
}

/** Todo lo de un resumen: fechas, estado, gastos, subtotales y los dólares en pesos */
export async function getStatement(userId: string, cardId: string, month: string) {
  const prev = shiftMonth(month, -1);
  const loaded = await loadCard(userId, cardId, [prev, month]);
  if (!loaded) return null;
  const { card, overrides } = loaded;
  if (!card.closingDay || !card.dueDay) return { card, configured: false as const };

  const today = todayISO();
  const { closing, due, corrected } = statementDates(card, month, overrides);
  const from = nextDay(statementDates(card, prev, overrides).closing);

  const [expenses, paid] = await Promise.all([
    listExpenses(userId, { paymentSourceId: cardId, paymentMethod: "CREDIT", from, to: closing }),
    db.cardPayment.findUnique({ where: { paymentSourceId_month: { paymentSourceId: cardId, month } } }),
  ]);
  let ars = 0;
  let usd = 0;
  for (const e of expenses) {
    if (e.currency === "ARS") ars += e.amount;
    else usd += e.amount;
  }

  const status: StatementStatus = paid ? "pagado" : today <= closing ? "abierto" : today <= due ? "a pagar" : "vencido";
  const payment = paid
    ? {
        paidOn: dateToISO(paid.paidOn),
        usdPaidIn: paid.usdPaidIn,
        rate: paid.rate?.toNumber() ?? null,
        totalArs: paid.totalArs.toNumber(),
        totalUsd: paid.totalUsd.toNumber(),
      }
    : null;

  // Los dólares en pesos: pagado en pesos → con el dólar del pago. Sin pagar → al dólar oficial
  // del vencimiento si ya pasó, o al de hoy (estimado). Pagado en dólares → no se convierten.
  let rate: { sell: number; date: string; estimated: boolean } | null = null;
  if (usd > 0 && payment) {
    if (payment.usdPaidIn === "ARS" && payment.rate) rate = { sell: payment.rate, date: payment.paidOn, estimated: false };
  } else if (usd > 0) {
    const found = await tryGetRate("OFICIAL", status === "vencido" ? due : today);
    if (found) rate = { ...found, estimated: status !== "vencido" };
  }
  const usdInPesos = rate ? round2(usd * rate.sell) : null;

  return {
    card,
    configured: true as const,
    month,
    from,
    closing,
    due,
    corrected,
    status,
    expenses,
    ars: round2(ars),
    usd: round2(usd),
    rate,
    usdInPesos,
    // Pagado: lo que realmente se pagó en pesos. Si no, lo que se estima pagar en pesos.
    total: payment ? payment.totalArs : round2(ars + (usdInPesos ?? 0)),
    payment,
  };
}

export type Statement = Extract<NonNullable<Awaited<ReturnType<typeof getStatement>>>, { configured: true }>;

/**
 * Las compras en cuotas de la tarjeta vistas desde un resumen: en qué cuota va cada una en ese
 * resumen ("3 de 6") y cuánto queda para los que vienen. Solo las que ya empezaron y todavía
 * tienen cuotas en este resumen o después (las terminadas antes no aparecen).
 */
export async function installmentPurchases(userId: string, cardId: string, from: string, closing: string) {
  const rows = await db.expense.findMany({
    where: { userId, paymentSourceId: cardId, paymentMethod: "CREDIT", installments: { gt: 1 }, purchaseId: { not: null } },
    orderBy: { installmentNumber: "asc" },
    select: {
      purchaseId: true,
      installmentNumber: true,
      installments: true,
      amount: true,
      currency: true,
      date: true,
      description: true,
      category: { select: { name: true, emoji: true, icon: true } },
    },
  });

  const byPurchase = new Map<string, typeof rows>();
  for (const r of rows) byPurchase.set(r.purchaseId!, [...(byPurchase.get(r.purchaseId!) ?? []), r]);

  const purchases = [...byPurchase.values()].flatMap((cuotas) => {
    const first = cuotas[0];
    const upToHere = cuotas.filter((c) => dateToISO(c.date) <= closing);
    const current = upToHere.at(-1); // la cuota que cae en este resumen (o la última ya pasada)
    const last = cuotas.at(-1)!;
    // Todavía no empezó, o terminó en un resumen anterior
    if (!current || dateToISO(last.date) < from) return [];
    const left = cuotas.filter((c) => dateToISO(c.date) > closing);
    return [
      {
        description: first.description,
        category: first.category,
        currency: first.currency,
        installment: current.installmentNumber,
        installments: first.installments,
        perInstallment: current.amount.toNumber(),
        leftCount: left.length,
        leftAmount: round2(left.reduce((sum, c) => sum + c.amount.toNumber(), 0)),
      },
    ];
  });
  purchases.sort((a, b) => b.leftCount - a.leftCount);

  const left = (c: "ARS" | "USD") => round2(purchases.filter((p) => p.currency === c).reduce((sum, p) => sum + p.leftAmount, 0));
  return { purchases, leftArs: left("ARS"), leftUsd: left("USD") };
}

async function assertOwnCard(userId: string, cardId: string) {
  const card = await db.paymentSource.findFirst({ where: { id: cardId, userId, kind: "CARD" }, select: { id: true } });
  if (!card) throw new StatementError("No encontré esa tarjeta");
}

/** Corrige las fechas de un resumen puntual (cuando el banco mueve el cierre) */
export async function setStatementDates(userId: string, cardId: string, month: string, closingDate: string, dueDate: string) {
  await assertOwnCard(userId, cardId);
  const data = { closingDate: isoToDate(closingDate), dueDate: isoToDate(dueDate) };
  await db.cardStatement.upsert({
    where: { paymentSourceId_month: { paymentSourceId: cardId, month } },
    update: data,
    create: { paymentSourceId: cardId, month, ...data },
  });
}

/** Vuelve un resumen a las fechas del día fijo de la tarjeta */
export async function resetStatementDates(userId: string, cardId: string, month: string) {
  await assertOwnCard(userId, cardId);
  await db.cardStatement.deleteMany({ where: { paymentSourceId: cardId, month } });
}

/**
 * Marca un resumen ya cerrado como pagado. `usdPaidIn`: si los dólares se pagaron en pesos
 * (con `rate`) o en dólares. `totalArs`: lo que se pagó en pesos, según el banco.
 */
export async function markStatementPaid(
  userId: string,
  cardId: string,
  month: string,
  data: { paidOn: string; usdPaidIn: "ARS" | "USD"; rate?: number; totalArs: number },
) {
  const statement = await getStatement(userId, cardId, month);
  if (!statement?.configured) throw new StatementError("No encontré ese resumen");
  if (statement.status === "abierto") throw new StatementError("Ese resumen todavía no cerró");
  if (data.paidOn < statement.closing) {
    const [, m, d] = statement.closing.split("-");
    throw new StatementError(`La fecha de pago no puede ser antes del cierre (${d}/${m})`);
  }

  const values = {
    paidOn: isoToDate(data.paidOn),
    usdPaidIn: data.usdPaidIn,
    rate: statement.usd > 0 && data.usdPaidIn === "ARS" ? (data.rate ?? null) : null,
    totalArs: data.totalArs,
    totalUsd: data.usdPaidIn === "USD" ? statement.usd : 0,
  };
  await db.cardPayment.upsert({
    where: { paymentSourceId_month: { paymentSourceId: cardId, month } },
    update: values,
    create: { paymentSourceId: cardId, month, ...values },
  });
}

/** Deshace el "pagado" (por si se marcó por error) */
export async function unmarkStatementPaid(userId: string, cardId: string, month: string) {
  await assertOwnCard(userId, cardId);
  await db.cardPayment.deleteMany({ where: { paymentSourceId: cardId, month } });
}
