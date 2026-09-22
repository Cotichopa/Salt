// Utilidades de montos, fechas y etiquetas. Las usan la web y (más adelante) el bot de WhatsApp.

export const TIME_ZONE = "America/Argentina/Buenos_Aires";

export const currencyLabels = { ARS: "Pesos", USD: "Dólares" } as const;

export const paymentMethodLabels = {
  CASH: "Efectivo",
  DEBIT: "Débito",
  CREDIT: "Crédito",
  TRANSFER: "Transferencia",
} as const;

export type CurrencyCode = keyof typeof currencyLabels;
export type PaymentMethodCode = keyof typeof paymentMethodLabels;

/**
 * Convierte un monto escrito "a la argentina" a número.
 * "15000" · "15.000" · "15.000,50" · "15000,5" · "$ 1.500" · "12.5" → número (o null si no se entiende)
 */
export function parseAmount(input: string): number | null {
  let s = input.trim().replace(/[$\s]/g, "");
  if (!s) return null;
  if (s.includes(",")) {
    // Con coma: los puntos son separadores de miles y la coma es el decimal
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "15.000" o "1.500.000": puntos de miles
    s = s.replace(/\./g, "");
  }
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function formatMoney(amount: number | string, currency: CurrencyCode) {
  const n = Number(amount);
  const hasCents = Math.round(n * 100) % 100 !== 0;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency,
    currencyDisplay: currency === "USD" ? "code" : "narrowSymbol",
    // $ 15.000 sin centavos, pero $ 15.000,50 (no $ 15.000,5) cuando los hay
    minimumFractionDigits: hasCents ? 2 : 0,
    maximumFractionDigits: 2,
  }).format(n);
}

// ---------- Fechas ----------
// En la base la fecha del gasto es solo un día (sin hora). Prisma la entrega como un Date
// a las 00:00 UTC, así que siempre la convertimos y mostramos en UTC para no correr el día.

/** Fecha de hoy en Argentina como "YYYY-MM-DD" */
export function todayISO() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
}

/** "YYYY-MM-DD" → Date para guardar en la base */
export function isoToDate(iso: string) {
  return new Date(`${iso}T00:00:00Z`);
}

/** Date de la base → "YYYY-MM-DD" */
export function dateToISO(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** Date de la base → "lun 22/09" */
export function formatDay(date: Date) {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "UTC",
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

/** "2026-09" → primer día del mes y primer día del mes siguiente (para filtrar) */
export function monthRange(month: string) {
  const [y, m] = month.split("-").map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
}

/** "2026-09" → "Septiembre de 2026" */
export function formatMonth(month: string) {
  const { from } = monthRange(month);
  const text = new Intl.DateTimeFormat("es-AR", { timeZone: "UTC", month: "long", year: "numeric" }).format(from);
  return text.charAt(0).toUpperCase() + text.slice(1);
}
