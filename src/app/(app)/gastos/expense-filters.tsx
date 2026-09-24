"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon, DownloadIcon, SearchIcon, XIcon } from "lucide-react";
import { currencyLabels, formatMonth, paymentMethodLabels } from "@/lib/format";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { CategoryOption, SourceOption } from "./expense-form";

// Los filtros viven en la URL (?mes=2026-09&categoria=...&q=super&pagina=2). Así, si recargás
// la página o compartís el link, se mantienen. Cambiar un filtro = cambiar la URL, y el
// servidor devuelve la lista nueva. Con algo escrito en el buscador se busca en todo el historial.

const ALL = "all";

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

export function ExpenseFilters({
  categories,
  sources,
  month,
  maxMonth,
}: {
  categories: CategoryOption[];
  sources: SourceOption[];
  month: string;
  maxMonth: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  function setParam(key: string, value: string | null) {
    const next = new URLSearchParams(params);
    if (!value || value === ALL) next.delete(key);
    else next.set(key, value);
    next.delete("pagina"); // con otro filtro, volvemos a la primera página
    router.replace(`${pathname}?${next.toString()}`);
  }

  // Buscador: esperamos a que dejes de escribir un momento antes de buscar (no una búsqueda por letra)
  const [text, setText] = useState(params.get("q") ?? "");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  function search(value: string) {
    setText(value);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setParam("q", value.trim() || null), 400);
  }
  const searching = !!params.get("q");

  // Exportar baja todo lo filtrado (todas las páginas)
  const exportParams = new URLSearchParams(params);
  exportParams.delete("pagina");

  const selects = [
    {
      key: "categoria",
      placeholder: "Categoría",
      items: [{ value: ALL, label: "Todas las categorías" }, ...categories.map((c) => ({ value: c.id, label: c.name }))],
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
    {
      key: "tarjeta",
      placeholder: "Tarjeta",
      items: [
        { value: ALL, label: "Todas las tarjetas" },
        ...sources.map((s) => ({ value: s.id, label: s.name })),
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={text}
            onChange={(e) => search(e.target.value)}
            placeholder="Buscar: super, 15.000, 24/09, septiembre..."
            className="h-10 pr-9 pl-9"
            aria-label="Buscar gastos en todo el historial"
          />
          {text && (
            <button
              type="button"
              onClick={() => search("")}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground hover:text-foreground"
              aria-label="Borrar búsqueda"
            >
              <XIcon className="size-4" />
            </button>
          )}
        </div>
        <a
          href={`/gastos/exportar?${exportParams.toString()}`}
          download
          className={buttonVariants({ variant: "outline", className: "h-10" })}
        >
          <DownloadIcon />
          <span className="hidden sm:inline">Exportar</span>
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {searching ? (
          // Buscando: el mes no aplica, se busca en todo el historial
          <span className="flex h-9 min-w-36 items-center rounded-lg border px-3 text-sm font-medium">
            Todo el historial
          </span>
        ) : (
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              aria-label="Mes anterior"
              onClick={() => setParam("mes", shiftMonth(month, -1))}
            >
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
        )}
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
    </div>
  );
}
