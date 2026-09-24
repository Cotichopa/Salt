import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

// Paginado con números: ‹ 1 … 4 5 6 … 12 ›. Cada número es un link (la página va en la URL),
// así funcionan el botón "atrás" del navegador y recargar la página.

/** Qué números mostrar: siempre la primera, la última y las vecinas de la actual */
function pageItems(page: number, pageCount: number): (number | "…")[] {
  const pages = new Set([1, pageCount, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pageCount));
  const sorted = [...pages].sort((a, b) => a - b);
  const items: (number | "…")[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) items.push(p - sorted[i - 1] === 2 ? p - 1 : "…"); // 1 … 3 → 1 2 3
    items.push(p);
  });
  return items;
}

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  href,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  href: (page: number) => string;
}) {
  if (pageCount <= 1) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const arrow = buttonVariants({ variant: "outline", size: "icon" });

  return (
    <nav aria-label="Páginas" className="flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Mostrando {from}–{to} de {total}
      </p>
      <div className="flex items-center gap-1">
        {page > 1 ? (
          <Link href={href(page - 1)} className={arrow} aria-label="Página anterior">
            <ChevronLeftIcon />
          </Link>
        ) : (
          <span className={cn(arrow, "pointer-events-none opacity-50")} aria-hidden>
            <ChevronLeftIcon />
          </span>
        )}
        {pageItems(page, pageCount).map((item, i) =>
          item === "…" ? (
            <span key={`gap-${i}`} className="w-6 text-center text-muted-foreground" aria-hidden>
              …
            </span>
          ) : (
            <Link
              key={item}
              href={href(item)}
              aria-current={item === page ? "page" : undefined}
              aria-label={`Página ${item}`}
              className={cn(
                buttonVariants({ variant: item === page ? "default" : "ghost", size: "icon" }),
                "tabular-nums",
              )}
            >
              {item}
            </Link>
          ),
        )}
        {page < pageCount ? (
          <Link href={href(page + 1)} className={arrow} aria-label="Página siguiente">
            <ChevronRightIcon />
          </Link>
        ) : (
          <span className={cn(arrow, "pointer-events-none opacity-50")} aria-hidden>
            <ChevronRightIcon />
          </span>
        )}
      </div>
    </nav>
  );
}
