import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { todayISO, type CurrencyCode, type PaymentMethodCode } from "@/lib/format";
import { listCategories } from "@/lib/services/categories";
import { listPaymentSources } from "@/lib/services/payment-sources";
import { listExpenses, type ExpenseFilters as Filters } from "@/lib/services/expenses";
import { ExpenseDialog } from "./expense-dialog";
import { ExpenseFilters } from "./expense-filters";
import { ExpensesView } from "./expenses-view";

export const metadata: Metadata = { title: "Gastos · Salt" };

// Lee un parámetro de la URL y lo acepta solo si está en la lista de valores válidos
function pick<T extends string>(value: string | string[] | undefined, allowed: readonly T[]): T | undefined {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
}

export default async function ExpensesPage({ searchParams }: PageProps<"/gastos">) {
  const user = await requireUser();
  const params = await searchParams;
  const today = todayISO();
  const currentMonth = today.slice(0, 7);

  const month = typeof params.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.mes) ? params.mes : currentMonth;
  const filters: Filters = {
    month,
    categoryId: typeof params.categoria === "string" ? params.categoria : undefined,
    currency: pick<CurrencyCode>(params.moneda, ["ARS", "USD"]),
    paymentMethod: pick<PaymentMethodCode>(params.medio, ["CASH", "DEBIT", "CREDIT", "TRANSFER"]),
    paymentSourceId: typeof params.tarjeta === "string" ? params.tarjeta : undefined,
  };

  const [categories, sources, expenses] = await Promise.all([
    listCategories(user.id),
    listPaymentSources(user.id),
    listExpenses(user.id, filters),
  ]);
  const categoryOptions = categories.map(({ id, name, emoji, icon }) => ({ id, name, emoji, icon }));

  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Gastos</h1>
        <ExpenseDialog categories={categoryOptions} sources={sources} today={today} />
      </div>

      <ExpenseFilters categories={categoryOptions} sources={sources} month={month} maxMonth={currentMonth} />

      <ExpensesView expenses={expenses} categories={categoryOptions} sources={sources} today={today} />
    </div>
  );
}
