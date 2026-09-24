import "server-only";
import { searchExpenses } from "@/lib/expense-search";
import type { CurrencyCode, PaymentMethodCode } from "@/lib/format";
import { listExpenses, type ExpenseFilters } from "@/lib/services/expenses";

// Lee los filtros de la URL de Gastos y devuelve los gastos que los cumplen. Lo usan la página
// (que después pagina de a 15) y el botón Exportar (que baja todo), así devuelven lo mismo.
// Con algo escrito en el buscador (?q=) se busca en todo el historial, sin importar el mes.

export const PAGE_SIZE = 15;

type SearchParams = Record<string, string | string[] | undefined>;

const str = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

// Acepta el valor solo si está en la lista de valores válidos
function pick<T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function readExpenseParams(params: SearchParams, today: string) {
  const currentMonth = today.slice(0, 7);
  const mes = str(params.mes);
  const month = mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(mes) ? mes : currentMonth;
  const query = (str(params.q) ?? "").trim().slice(0, 100);
  const page = Math.max(1, Math.floor(Number(str(params.pagina)) || 1));

  const filters: ExpenseFilters = {
    month: query ? undefined : month, // buscando: todo el historial
    categoryId: str(params.categoria),
    currency: pick<CurrencyCode>(str(params.moneda), ["ARS", "USD"]),
    paymentMethod: pick<PaymentMethodCode>(str(params.medio), ["CASH", "DEBIT", "CREDIT", "TRANSFER"]),
    paymentSourceId: str(params.tarjeta),
  };
  return { month, currentMonth, query, page, filters };
}

/** Todos los gastos que cumplen los filtros y la búsqueda, del más nuevo al más viejo */
export async function findExpenses(userId: string, params: SearchParams, today: string) {
  const { filters, query } = readExpenseParams(params, today);
  const expenses = await listExpenses(userId, filters);
  // La búsqueda (montos, fechas, errores de tipeo) se hace acá: son pocos miles de gastos como mucho
  return query ? searchExpenses(expenses, query) : expenses;
}
