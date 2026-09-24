"use client";

import { useMemo, useState } from "react";
import { DownloadIcon, SearchIcon } from "lucide-react";
import { expensesToCsv } from "@/lib/csv";
import { searchExpenses } from "@/lib/expense-search";
import { formatMoney, type CurrencyCode } from "@/lib/format";
import type { ExpenseDTO } from "@/lib/services/expenses";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ExpenseList } from "./expense-list";
import type { CategoryOption, SourceOption } from "./expense-form";

// Gastos de la pantalla de una categoría: buscador instantáneo (acá mismo, sin ir al
// servidor: son los gastos de un período), total, exportar y la lista.
// La pantalla de Gastos arma lo mismo pero buscando y paginando en el servidor.

type Props = { expenses: ExpenseDTO[]; categories: CategoryOption[]; sources: SourceOption[]; today: string };

export function ExpensesView({ expenses, categories, sources, today }: Props) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => searchExpenses(expenses, query), [expenses, query]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar: descripción, monto, fecha (24/09)..."
            className="h-10 pl-9"
            aria-label="Buscar gastos"
          />
        </div>
        <Button variant="outline" onClick={() => downloadCsv(filtered)} disabled={filtered.length === 0}>
          <DownloadIcon />
          Exportar
        </Button>
      </div>

      <TotalsLine count={filtered.length} totals={totalsOf(filtered)} />

      <ExpenseList
        expenses={filtered}
        categories={categories}
        sources={sources}
        today={today}
        emptyMessage={query ? `No encontré gastos con "${query}".` : "No hay gastos en este período."}
      />
    </div>
  );
}

function totalsOf(expenses: ExpenseDTO[]) {
  const totals: Record<CurrencyCode, number> = { ARS: 0, USD: 0 };
  for (const e of expenses) totals[e.currency] += e.amount;
  return totals;
}

/** "71 gastos · $ 2.600.000 · USD 45": solo las monedas que aparecen */
export function TotalsLine({ count, totals }: { count: number; totals: Record<CurrencyCode, number> }) {
  return (
    <p className="text-sm text-muted-foreground">
      <span className="font-medium text-foreground">
        {count} {count === 1 ? "gasto" : "gastos"}
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
  );
}

/** Descarga los gastos como CSV (se abre con Excel) */
function downloadCsv(expenses: ExpenseDTO[]) {
  const blob = new Blob([expensesToCsv(expenses)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `gastos-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
