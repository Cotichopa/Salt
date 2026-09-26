import "server-only";
import { db } from "@/lib/db";
import { dateToISO, isoToDate, todayISO, type DollarTypeCode } from "@/lib/format";

// Cotizaciones del dólar. Se guardan en la tabla exchange_rates y se completan solas:
// - la de hoy, desde DolarApi (se refresca si tiene más de una hora, porque cambia en el día);
// - las de días pasados, desde el historial de ArgentinaDatos (se baja entero una sola vez).
// Usamos el precio de VENTA: es a cuánto comprás los dólares.

export class RateUnavailableError extends Error {}

// Cómo llama cada API a cada tipo de dólar
const CASA: Record<DollarTypeCode, string> = {
  MEP: "bolsa",
  BLUE: "blue",
  OFICIAL: "oficial",
  TARJETA: "tarjeta",
  CRIPTO: "cripto",
};

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const TIMEOUT = 5000; // si la API tarda más, seguimos con lo que haya en la tabla

type Rate = { sell: number; date: string };

async function fetchJson(url: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT), cache: "no-store" });
  if (!res.ok) throw new Error(`${url} respondió ${res.status}`);
  return res.json();
}

/** Cotización de hoy desde DolarApi */
async function fetchToday(type: DollarTypeCode) {
  const d: { compra: number; venta: number } = await fetchJson(`https://dolarapi.com/v1/dolares/${CASA[type]}`);
  const date = isoToDate(todayISO());
  await db.exchangeRate.upsert({
    where: { type_date: { type, date } },
    update: { buy: d.compra, sell: d.venta },
    create: { type, date, buy: d.compra, sell: d.venta },
  });
}

/** Todo el historial de ese dólar desde ArgentinaDatos (miles de días en un solo pedido) */
async function fetchHistory(type: DollarTypeCode) {
  const rows: { compra: number | null; venta: number | null; fecha: string }[] = await fetchJson(
    `https://api.argentinadatos.com/v1/cotizaciones/dolares/${CASA[type]}`,
  );
  await db.exchangeRate.createMany({
    data: rows
      .filter((r) => r.venta)
      .map((r) => ({ type, date: isoToDate(r.fecha), buy: r.compra ?? r.venta!, sell: r.venta! })),
    skipDuplicates: true, // los días que ya teníamos no se tocan
  });
}

/** El último día con cotización hasta esa fecha (los fines de semana y feriados no cotiza) */
async function latestUpTo(type: DollarTypeCode, iso: string) {
  return db.exchangeRate.findFirst({
    where: { type, date: { lte: isoToDate(iso) } },
    orderBy: { date: "desc" },
  });
}

/**
 * Cotización (venta) de ese dólar en esa fecha. Si ese día no hubo cotización, usa la del
 * último día hábil anterior. Lanza RateUnavailableError si no hay ninguna y no se pudo bajar.
 */
export async function getRate(type: DollarTypeCode, iso: string): Promise<Rate> {
  const today = todayISO();
  const date = iso > today ? today : iso; // las cuotas futuras usan la de hoy
  const toRate = (r: { sell: { toNumber(): number }; date: Date }) => ({ sell: r.sell.toNumber(), date: dateToISO(r.date) });

  let row = await latestUpTo(type, date);
  // Hoy: tiene que ser de hoy y reciente. Un día pasado: alcanza con una de esa semana
  // (si cayó sábado, vale la del viernes), así no bajamos el historial de nuevo por nada.
  const missing =
    date === today
      ? !row || dateToISO(row.date) !== date || Date.now() - row.updatedAt.getTime() > HOUR
      : !row || isoToDate(date).getTime() - row.date.getTime() > 7 * DAY;

  if (missing) {
    try {
      if (date === today) await fetchToday(type);
      else await fetchHistory(type);
      row = await latestUpTo(type, date);
    } catch (e) {
      // Sin internet o la API caída: seguimos con lo último que tengamos guardado
      console.warn(`[cotizaciones] no pude actualizar ${type}:`, e instanceof Error ? e.message : e);
    }
  }
  if (!row) throw new RateUnavailableError("No pude conseguir la cotización del dólar: cargala a mano.");
  return toRate(row);
}

/** Igual que getRate, pero devuelve null en vez de fallar (para lo que es opcional) */
export async function tryGetRate(type: DollarTypeCode, iso: string) {
  try {
    return await getRate(type, iso);
  } catch (e) {
    if (e instanceof RateUnavailableError) return null;
    throw e;
  }
}
