"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { currencyLabels, formatMonth, paymentMethodLabels } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CategoryOption } from "./expense-form";

// Los filtros viven en la URL (?mes=2026-09&categoria=...). Así, si recargás la página
// o compartís el link, se mantienen. Cambiar un filtro = cambiar la URL.

const ALL = "all";

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function ExpenseFilters({ categories, month, maxMonth }: { categories: CategoryOption[]; month: string; maxMonth: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    router.replace(`${pathname}?${next.toString()}`);
  }

  const selects = [
    {
      key: "categoria",
      placeholder: "Categoría",
      items: [{ value: ALL, label: "Todas las categorías" }, ...categories.map((c) => ({ value: c.id, label: `${c.emoji ?? ""} ${c.name}`.trim() }))],
    },
    {
      key: "moneda",
      placeholder: "Moneda",
      items: [{ value: ALL, label: "Todas las monedas" }, ...Object.entries(currencyLabels).map(([value, label]) => ({ value, label }))],
    },
    {
      key: "medio",
      placeholder: "Medio",
      items: [{ value: ALL, label: "Todos los medios" }, ...Object.entries(paymentMethodLabels).map(([value, label]) => ({ value, label }))],
    },
  ];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" aria-label="Mes anterior" onClick={() => setParam("mes", shiftMonth(month, -1))}>
          <ChevronLeftIcon />
        </Button>
        <span className="min-w-36 text-center text-sm font-medium">{formatMonth(month)}</span>
        <Button
          variant="outline"
          size="icon"
          aria-label="Mes siguiente"
          disabled={month >= maxMonth}
          onClick={() => setParam("mes", shiftMonth(month, 1))}
        >
          <ChevronRightIcon />
        </Button>
      </div>
      {selects.map((s) => (
        <Select key={s.key} items={s.items} value={params.get(s.key) ?? ALL} onValueChange={(v) => setParam(s.key, v as string)}>
          <SelectTrigger className="w-full sm:w-auto">
            <SelectValue placeholder={s.placeholder} />
          </SelectTrigger>
          <SelectContent>
            {s.items.map((i) => (
              <SelectItem key={i.value} value={i.value}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}
    </div>
  );
}
