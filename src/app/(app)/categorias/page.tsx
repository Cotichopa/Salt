import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { formatMoney } from "@/lib/format";
import { listCategoriesWithUsage } from "@/lib/services/categories";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryIcon } from "@/components/category-icon";
import { CategoryDialog } from "./category-dialog";
import { DeleteCategoryButton } from "./delete-category-button";

export const metadata: Metadata = { title: "Categorías · Salt" };

type Row = Awaited<ReturnType<typeof listCategoriesWithUsage>>[number];

/** Fila tocable: lleva a la pantalla de la categoría (/categorias/<id>) */
function CategoryLink({ c }: { c: Row }) {
  return (
    <Link
      href={`/categorias/${c.id}`}
      className="-mx-2 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60"
    >
      <CategoryIcon icon={c.icon} emoji={c.emoji} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{c.name}</div>
        <div className="text-sm text-muted-foreground">
          {c.expenseCount} {c.expenseCount === 1 ? "gasto" : "gastos"}
        </div>
      </div>
      <div className="text-right">
        <div className={c.monthTotal > 0 ? "font-medium tabular-nums" : "text-muted-foreground tabular-nums"}>
          {formatMoney(c.monthTotal, "ARS")}
        </div>
        <div className="text-xs text-muted-foreground">este mes</div>
      </div>
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export default async function CategoriesPage() {
  const user = await requireUser();
  const categories = await listCategoriesWithUsage(user.id);
  const own = categories.filter((c) => c.userId === user.id);
  const base = categories.filter((c) => c.userId === null);

  return (
    <div className="flex flex-col gap-6 py-2">
      <h1 className="text-2xl font-semibold">Categorías</h1>

      <Card>
        <CardHeader>
          <CardTitle>Mis categorías</CardTitle>
          <CardDescription>Solo las ves y usás vos.</CardDescription>
          <CardAction>
            <CategoryDialog />
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {own.length === 0 && (
            <p className="py-4 text-center text-muted-foreground">Todavía no creaste ninguna categoría propia.</p>
          )}
          {own.map((c) => (
            <div key={c.id} className="flex items-center gap-1 py-1">
              <CategoryLink c={c} />
              <CategoryDialog category={c} />
              <DeleteCategoryButton
                category={c}
                expenseCount={c.expenseCount}
                others={categories.filter((o) => o.id !== c.id)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Categorías base</CardTitle>
          <CardDescription>Todas las cuentas tienen estas mismas categorías, pero cada una ve solo sus propios gastos.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {base.map((c) => (
            <div key={c.id} className="py-1">
              <CategoryLink c={c} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
