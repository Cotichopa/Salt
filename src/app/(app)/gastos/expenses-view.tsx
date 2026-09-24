"use client";

import { useMemo, useState } from "react";
import { DownloadIcon, MessageCircleIcon, SearchIcon } from "lucide-react";
import { formatDay, formatMoney, isoToDate, paymentMethodLabels, type CurrencyCode } from "@/lib/format";
import { normalize } from "@/lib/text";
import type { ExpenseDTO } from "@/lib/services/expenses";
import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/components/category-icon";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ExpenseForm, type CategoryOption, type SourceOption } from "./expense-form";
import { DeleteExpenseButton } from "./delete-expense-button";

// Vista de gastos: en celular una lista agrupada por día, en pantalla grande una tabla.
// Tocar un gasto (en cualquiera de las dos) abre la ventana para editarlo o eliminarlo.

type Props = { expenses: ExpenseDTO[]; categories: CategoryOption[]; sources: SourceOption[]; today: string };

export function ExpensesView({ expenses, categories, sources, today }: Props) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ExpenseDTO | null>(null);

  // El buscador filtra acá mismo, sin ir al servidor: la respuesta es instantánea
  const filtered = useMemo(() => {
    const q = normalize(query);
    if (!q) return expenses;
    return expenses.filter((e) =>
      [e.description, e.category.name, paymentMethodLabels[e.paymentMethod], e.paymentSource?.name].some(
        (t) => t && normalize(t).includes(q),
      ),
    );
  }, [expenses, query]);

  const totals = useMemo(() => {
    const acc: Record<CurrencyCode, number> = { ARS: 0, USD: 0 };
    for (const e of filtered) acc[e.currency] += e.amount;
    return acc;
  }, [filtered]);

  // Agrupamos por día, con el subtotal de cada uno
  const days = useMemo(() => {
    const map = new Map<string, ExpenseDTO[]>();
    for (const e of filtered) map.set(e.date, [...(map.get(e.date) ?? []), e]);
    return [...map.entries()].map(([date, items]) => ({
      date,
      items,
      subtotals: items.reduce(
        (acc, e) => ({ ...acc, [e.currency]: (acc[e.currency] ?? 0) + e.amount }),
        {} as Partial<Record<CurrencyCode, number>>,
      ),
    }));
  }, [filtered]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por descripción, categoría o medio de pago"
            className="h-10 pl-9"
            aria-label="Buscar gastos"
          />
        </div>
        <Button variant="outline" onClick={() => exportCsv(filtered)} disabled={filtered.length === 0}>
          <DownloadIcon />
          Exportar
        </Button>
      </div>

      {/* Totales en una línea: solo las monedas que aparecen */}
      <p className="text-sm text-muted-foreground">
        <span className="font-medium text-foreground">
          {filtered.length} {filtered.length === 1 ? "gasto" : "gastos"}
        </span>
        {(["ARS", "USD"] as const)
          .filter((c) => totals[c] > 0)
          .map((c) => (
            <span key={c}>
              {" · "}
              <span className="font-medium text-foreground tabular-nums">{formatMoney(totals[c], c)}</span>
            </span>
          ))}
      </p>

      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            {query ? `No encontré gastos con "${query}".` : "No hay gastos con estos filtros."}
          </CardContent>
        </Card>
      ) : (
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
                      <span className="font-medium whitespace-nowrap tabular-nums">
                        {formatMoney(e.amount, e.currency)}
                      </span>
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
                  {filtered.map((e) => (
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
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {formatDay(isoToDate(e.date))}
                      </TableCell>
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
        </>
      )}

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
    </div>
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

/** Descarga los gastos filtrados como CSV (se abre con Excel) */
function exportCsv(expenses: ExpenseDTO[]) {
  const rows = [
    ["Fecha", "Categoría", "Descripción", "Monto", "Moneda", "Medio de pago", "Tarjeta o billetera", "Cuota", "Origen"],
    ...expenses.map((e) => [
      e.date,
      e.category.name,
      e.description ?? "",
      // Excel en español espera la coma como separador decimal
      String(e.amount).replace(".", ","),
      e.currency,
      paymentMethodLabels[e.paymentMethod],
      e.paymentSource?.name ?? "",
      e.installments > 1 ? `${e.installmentNumber}/${e.installments}` : "",
      e.source === "WHATSAPP" ? "WhatsApp" : "Web",
    ]),
  ];
  const csv = rows.map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\n");
  // El BOM le avisa a Excel que el archivo está en UTF-8 (si no, rompe los acentos)
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `gastos-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
