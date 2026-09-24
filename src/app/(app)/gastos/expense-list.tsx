"use client";

import { useMemo, useState } from "react";
import { MessageCircleIcon } from "lucide-react";
import { formatDay, formatMoney, isoToDate, paymentMethodLabels, type CurrencyCode } from "@/lib/format";
import type { ExpenseDTO } from "@/lib/services/expenses";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CategoryIcon } from "@/components/category-icon";
import { ExpenseForm, type CategoryOption, type SourceOption } from "./expense-form";
import { DeleteExpenseButton } from "./delete-expense-button";

// Lista de gastos: en celular agrupada por día, en pantalla grande una tabla.
// Tocar un gasto (en cualquiera de las dos) abre la ventana para editarlo o eliminarlo.

type Props = {
  expenses: ExpenseDTO[];
  categories: CategoryOption[];
  sources: SourceOption[];
  today: string;
  emptyMessage: string;
};

export function ExpenseList({ expenses, categories, sources, today, emptyMessage }: Props) {
  const [editing, setEditing] = useState<ExpenseDTO | null>(null);

  // Agrupamos por día, con el subtotal de cada uno
  const days = useMemo(() => {
    const map = new Map<string, ExpenseDTO[]>();
    for (const e of expenses) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return [...map.entries()].map(([date, items]) => ({
      date,
      items,
      subtotals: items.reduce(
        (acc, e) => ({ ...acc, [e.currency]: (acc[e.currency] ?? 0) + e.amount }),
        {} as Partial<Record<CurrencyCode, number>>,
      ),
    }));
  }, [expenses]);

  if (expenses.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">{emptyMessage}</CardContent>
      </Card>
    );
  }

  return (
    <>
      {/* Celular: lista agrupada por día */}
      <div className="flex flex-col gap-4 lg:hidden">
        {days.map((day) => (
          <Card key={day.date}>
            <CardContent className="flex flex-col">
              <div className="flex items-baseline justify-between gap-2 border-b pb-2">
                <span className="font-medium capitalize">{dayLabel(day.date, today)}</span>
                <span className="text-sm text-muted-foreground tabular-nums">
                  {(Object.entries(day.subtotals) as [CurrencyCode, number][])
                    .map(([c, v]) => formatMoney(v, c))
                    .join(" · ")}
                </span>
              </div>
              {day.items.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => setEditing(e)}
                  className="flex w-full items-center gap-3 border-b py-3 text-left last:border-0 hover:bg-muted/50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      <CategoryIcon icon={e.category.icon} emoji={e.category.emoji} size="sm" />
                      <span className="truncate">{e.category.name}</span>
                      {e.source === "WHATSAPP" && (
                        <MessageCircleIcon className="size-3.5 shrink-0 text-green-600" aria-label="Cargado por WhatsApp" />
                      )}
                    </div>
                    <div className="truncate text-sm text-muted-foreground">{detailLine(e)}</div>
                  </div>
                  <span className="font-medium whitespace-nowrap tabular-nums">{formatMoney(e.amount, e.currency)}</span>
                </button>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pantalla grande: tabla */}
      <Card className="hidden lg:block">
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fecha</TableHead>
                <TableHead>Categoría</TableHead>
                <TableHead>Descripción</TableHead>
                <TableHead>Medio</TableHead>
                <TableHead className="text-right">Monto</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {expenses.map((e) => (
                <TableRow
                  key={e.id}
                  tabIndex={0}
                  role="button"
                  onClick={() => setEditing(e)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setEditing(e);
                    }
                  }}
                  className="cursor-pointer"
                >
                  <TableCell className="whitespace-nowrap text-muted-foreground">{formatDay(isoToDate(e.date))}</TableCell>
                  <TableCell className="font-medium whitespace-nowrap">
                    <span className="flex items-center gap-2">
                      <CategoryIcon icon={e.category.icon} emoji={e.category.emoji} size="sm" />
                      {e.category.name}
                      {e.source === "WHATSAPP" && (
                        <MessageCircleIcon className="size-3.5 text-green-600" aria-label="Cargado por WhatsApp" />
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-64 truncate text-muted-foreground">
                    {[e.description, e.installments > 1 ? `Cuota ${e.installmentNumber}/${e.installments}` : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {paymentMethodLabels[e.paymentMethod]}
                    {e.paymentSource && <span className="text-muted-foreground"> · {e.paymentSource.name}</span>}
                  </TableCell>
                  <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                    {formatMoney(e.amount, e.currency)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar gasto</DialogTitle>
          </DialogHeader>
          {editing && (
            <>
              <ExpenseForm
                categories={categories}
                sources={sources}
                expense={editing}
                today={today}
                onDone={() => setEditing(null)}
              />
              <div className="flex justify-end border-t pt-4">
                <DeleteExpenseButton
                  id={editing.id}
                  installments={editing.installments}
                  summary={`${editing.category.name} por ${formatMoney(editing.amount, editing.currency)} del ${formatDay(isoToDate(editing.date))}`}
                  onDeleted={() => setEditing(null)}
                />
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Línea de detalle: descripción · medio · tarjeta · cuota */
function detailLine(e: ExpenseDTO) {
  return [
    e.description,
    paymentMethodLabels[e.paymentMethod],
    e.paymentSource?.name,
    e.installments > 1 ? `Cuota ${e.installmentNumber}/${e.installments}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** "Hoy", "Ayer" o "lun 22/09" */
function dayLabel(date: string, today: string) {
  if (date === today) return "Hoy";
  const yesterday = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  if (date === yesterday) return "Ayer";
  return formatDay(isoToDate(date));
}
