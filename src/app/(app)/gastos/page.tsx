import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { todayISO } from "@/lib/format";
import { listCategories } from "@/lib/services/categories";
import { listPaymentSources } from "@/lib/services/payment-sources";
import { totalsByCurrency } from "@/lib/services/expenses";
import { Pagination } from "@/components/pagination";
import { ExpenseDialog } from "./expense-dialog";
import { ExpenseFilters } from "./expense-filters";
import { ExpenseList } from "./expense-list";
import { TotalsLine } from "./expenses-view";
import { findExpenses, PAGE_SIZE, readExpenseParams } from "./query";

export const metadata: Metadata = { title: "Gastos · Salt" };

export default async function ExpensesPage({ searchParams }: PageProps<"/gastos">) {
  const user = await requireUser();
  const params = await searchParams;
  const today = todayISO();
  const { month, currentMonth, query, page: askedPage } = readExpenseParams(params, today);

  const [categories, sources, expenses] = await Promise.all([
    listCategories(user.id),
    listPaymentSources(user.id),
    findExpenses(user.id, params, today),
  ]);
  const categoryOptions = categories.map(({ id, name, emoji, icon }) => ({ id, name, emoji, icon }));

  // Paginado: el total y la cantidad son de TODO lo filtrado; la lista, solo de esta página
  const pageCount = Math.max(1, Math.ceil(expenses.length / PAGE_SIZE));
  const page = Math.min(askedPage, pageCount); // si pedís la página 9 y hay 3, te mostramos la 3
  const pageItems = expenses.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // Link a otra página conservando los filtros y la búsqueda
  const pageHref = (p: number) => {
    const next = new URLSearchParams(
      Object.entries(params).filter((e): e is [string, string] => typeof e[1] === "string"),
    );
    if (p === 1) next.delete("pagina");
    else next.set("pagina", String(p));
    return `/gastos?${next.toString()}`;
  };

  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Gastos</h1>
        <ExpenseDialog categories={categoryOptions} sources={sources} today={today} />
      </div>

      <ExpenseFilters categories={categoryOptions} sources={sources} month={month} maxMonth={currentMonth} />

      <TotalsLine count={expenses.length} totals={totalsByCurrency(expenses)} />

      <ExpenseList
        expenses={pageItems}
        categories={categoryOptions}
        sources={sources}
        today={today}
        emptyMessage={query ? `No encontré gastos con "${query}".` : "No hay gastos con estos filtros."}
      />

      <Pagination page={page} pageCount={pageCount} total={expenses.length} pageSize={PAGE_SIZE} href={pageHref} />
    </div>
  );
}
