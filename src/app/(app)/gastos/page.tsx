import type { Metadata } from "next";
import { MessageCircleIcon } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { formatDay, formatMoney, isoToDate, paymentMethodLabels, todayISO, type CurrencyCode, type PaymentMethodCode } from "@/lib/format";
import { listCategories, listExpenses, totalsByCurrency, type ExpenseFilters as Filters } from "@/lib/services/expenses";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExpenseDialog } from "./expense-dialog";
import { ExpenseFilters } from "./expense-filters";
import { DeleteExpenseButton } from "./delete-expense-button";

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
  };

  const [categories, expenses] = await Promise.all([listCategories(user.id), listExpenses(user.id, filters)]);
  const totals = totalsByCurrency(expenses);
  const categoryOptions = categories.map(({ id, name, emoji }) => ({ id, name, emoji }));

  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Gastos</h1>
        <ExpenseDialog categories={categoryOptions} today={today} />
      </div>

      <ExpenseFilters categories={categoryOptions} month={month} maxMonth={currentMonth} />

      <div className="grid grid-cols-2 gap-4">
        {(["ARS", "USD"] as const).map((c) => (
          <Card key={c} size="sm">
            <CardHeader>
              <CardDescription>Total en {c === "ARS" ? "pesos" : "dólares"}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{formatMoney(totals[c], c)}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent>
          {expenses.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No hay gastos con estos filtros.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Categoría</TableHead>
                  <TableHead className="hidden md:table-cell">Medio</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead className="w-20" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {expenses.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">{formatDay(isoToDate(e.date))}</TableCell>
                    <TableCell className="max-w-48 whitespace-normal">
                      <div className="flex items-center gap-1 font-medium">
                        {e.category.emoji} {e.category.name}
                        {e.source === "WHATSAPP" && (
                          <MessageCircleIcon className="size-3.5 text-green-600" aria-label="Cargado por WhatsApp" />
                        )}
                      </div>
                      {e.description && <div className="truncate text-sm text-muted-foreground">{e.description}</div>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">{paymentMethodLabels[e.paymentMethod]}</TableCell>
                    <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                      {formatMoney(e.amount, e.currency)}
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end">
                        <ExpenseDialog categories={categoryOptions} expense={e} today={today} />
                        <DeleteExpenseButton
                          id={e.id}
                          summary={`${e.category.name} por ${formatMoney(e.amount, e.currency)} del ${formatDay(isoToDate(e.date))}`}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
