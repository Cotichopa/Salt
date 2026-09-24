import "server-only";
import { db } from "@/lib/db";
import { dateToISO, todayISO, type CurrencyCode } from "@/lib/format";

// Números de la pantalla de una categoría: cuánto va esta semana, este mes y este año,
// y un historial para el gráfico. Traemos solo fecha y monto de los gastos de esa
// categoría y sumamos acá: son pocos datos y así el cálculo queda fácil de leer.

export type CategoryPeriod = "semana" | "mes" | "anio";

const DAY = 86_400_000;
const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Lunes de la semana de esa fecha (las semanas van de lunes a domingo) */
function weekStart(iso: string) {
  const ms = toMs(iso);
  const weekday = (new Date(ms).getUTCDay() + 6) % 7; // 0 = lunes
  return toIso(ms - weekday * DAY);
}
const monthStart = (iso: string) => `${iso.slice(0, 7)}-01`;
const yearStart = (iso: string) => `${iso.slice(0, 4)}-01-01`;

/** Mueve "YYYY-MM-01" n meses (n negativo = para atrás) */
function shiftMonthStart(iso: string, n: number) {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
}

const startOf = { semana: weekStart, mes: monthStart, anio: yearStart };

/** Dónde empieza el período anterior a uno que arranca en `start` */
const previousStart = {
  semana: (start: string) => toIso(toMs(start) - 7 * DAY),
  mes: (start: string) => shiftMonthStart(start, -1),
  anio: (start: string) => `${Number(start.slice(0, 4)) - 1}-01-01`,
};

const monthShort = new Intl.DateTimeFormat("es-AR", { month: "short", timeZone: "UTC" });

/** Etiqueta corta para el eje del gráfico */
function bucketLabel(period: CategoryPeriod, start: string) {
  if (period === "anio") return start.slice(0, 4);
  if (period === "mes") {
    const name = monthShort.format(new Date(toMs(start))).replace(".", "");
    return start.slice(5, 7) === "01" ? `${name} ${start.slice(2, 4)}` : name; // en enero mostramos el año
  }
  return `${start.slice(8, 10)}/${start.slice(5, 7)}`; // semana: día en que empieza
}

export async function getCategoryStats(userId: string, categoryId: string, currency: CurrencyCode, period: CategoryPeriod) {
  const today = todayISO();

  const rows = await db.expense.findMany({
    where: { userId, categoryId },
    select: { date: true, amount: true, currency: true },
  });
  const hasUsd = rows.some((r) => r.currency === "USD");
  const expenses = rows
    .filter((r) => r.currency === currency)
    .map((r) => ({ date: dateToISO(r.date), amount: r.amount.toNumber() }));

  /** Suma y cantidad de gastos entre dos fechas (from incluida, to excluida) */
  const sum = (from: string, to: string) => {
    let total = 0;
    let count = 0;
    for (const e of expenses) {
      if (e.date >= from && e.date < to) {
        total += e.amount;
        count++;
      }
    }
    return { total, count };
  };

  // Los tres resúmenes: el período en curso y el anterior completo, para comparar
  const tomorrow = toIso(toMs(today) + DAY);
  const summary = (["semana", "mes", "anio"] as const).map((p) => {
    const start = startOf[p](today);
    const prevStart = previousStart[p](start);
    return { period: p, start, current: sum(start, tomorrow), previous: sum(prevStart, start) };
  });

  // Historial: 12 semanas, 12 meses, o todos los años desde el primer gasto
  const currentStart = startOf[period](today);
  const starts: string[] = [];
  if (period === "anio") {
    const firstYear = expenses.reduce((y, e) => Math.min(y, Number(e.date.slice(0, 4))), Number(today.slice(0, 4)));
    for (let y = firstYear; y <= Number(today.slice(0, 4)); y++) starts.push(`${y}-01-01`);
  } else {
    let s = currentStart;
    for (let i = 0; i < 12; i++) {
      starts.unshift(s);
      s = previousStart[period](s);
    }
  }
  const history = starts.map((start, i) => ({
    label: bucketLabel(period, start),
    total: sum(start, starts[i + 1] ?? tomorrow).total,
    current: start === currentStart, // el período en curso todavía no terminó
  }));

  return { summary, history, hasUsd, periodStart: currentStart, today };
}

export type CategoryStats = Awaited<ReturnType<typeof getCategoryStats>>;
