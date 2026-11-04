import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";
import { requireAccount } from "@/lib/dal";
import { formatMoney } from "@/lib/format";
import { listCategoriesWithUsage } from "@/lib/services/categories";
import { listDefaultCategories } from "@/lib/services/default-categories";
import { saveDefaultCategoryAction } from "@/lib/actions/superadmin";
import { budgetLevel } from "@/lib/services/budgets";
import { cn } from "@/lib/utils";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryIcon } from "@/components/category-icon";
import { BudgetBar } from "@/components/budget-bar";
import { CategoryDialog } from "./category-dialog";
import { DeleteCategoryButton } from "./delete-category-button";
import { DeleteDefaultCategoryButton } from "./delete-default-category-button";
import { Editable } from "@/components/read-only";

export const metadata: Metadata = { title: "Categorías · Salt" };

type Row = Awaited<ReturnType<typeof listCategoriesWithUsage>>[number];

/** Fila tocable: lleva a la pantalla de la categoría (/categorias/<id>) */
function CategoryLink({ c }: { c: Row }) {
  const level = c.budget ? budgetLevel(c.monthTotal, c.budget) : null;
  const count = `${c.monthCount} ${c.monthCount === 1 ? "gasto" : "gastos"}`;
  return (
    <Link
      href={`/categorias/${c.id}`}
      className="-mx-2 flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/60"
    >
      <CategoryIcon icon={c.icon} emoji={c.emoji} />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{c.name}</div>
        {c.budget && level ? (
          // Con presupuesto: barrita + cuánto queda (o cuánto se pasó) + cuántos gastos van este mes
          <div className="mt-1 flex flex-col gap-1">
            <BudgetBar spent={c.monthTotal} amount={c.budget} level={level} className="h-1.5 max-w-48" />
            <span className="text-xs text-muted-foreground">
              <span
                className={cn(
                  level === "exceeded" && "font-medium text-red-700 dark:text-red-400",
                  level === "warning" && "font-medium text-amber-700 dark:text-amber-400",
                )}
              >
                {level === "exceeded"
                  ? `Te pasaste por ${formatMoney(c.monthTotal - c.budget, "ARS")}`
                  : `Quedan ${formatMoney(c.budget - c.monthTotal, "ARS")}`}
              </span>
              {` · ${count}`}
            </span>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">{count}</div>
        )}
      </div>
      <div className="text-right">
        <div className={c.monthTotal > 0 ? "font-medium tabular-nums" : "text-muted-foreground tabular-nums"}>
          {formatMoney(c.monthTotal, "ARS")}
        </div>
        <div className="text-xs text-muted-foreground">
          {c.budget ? `de ${formatMoney(c.budget, "ARS")}` : "este mes"}
        </div>
      </div>
      <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
    </Link>
  );
}

export default async function CategoriesPage() {
  const user = await requireAccount();
  const categories = await listCategoriesWithUsage(user.id);
  // Las iniciales son solo del superadmin. En "ver como", user es la cuenta que se mira: no aparecen
  const defaults = user.role === "SUPERADMIN" && !user.readOnly ? await listDefaultCategories() : null;

  return (
    <div className="flex flex-col gap-6 py-2">
      <h1 className="text-2xl font-semibold">Categorías</h1>

      <Card>
        <CardHeader>
          <CardTitle>Mis categorías</CardTitle>
          <CardDescription>Solo las ves y usás vos: podés editarlas y borrarlas sin afectar a nadie más.</CardDescription>
          <CardAction>
            <Editable>
              <CategoryDialog />
            </Editable>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {categories.length === 0 && (
            <p className="py-4 text-center text-muted-foreground">No tenés categorías. Creá una para empezar a cargar gastos.</p>
          )}
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-1 py-1">
              <CategoryLink c={c} />
              <Editable>
                <CategoryDialog category={c} />
                <DeleteCategoryButton
                  category={c}
                  expenseCount={c.expenseCount}
                  others={categories.filter((o) => o.id !== c.id)}
                />
              </Editable>
            </div>
          ))}
        </CardContent>
      </Card>

      {defaults && (
        <Card>
          <CardHeader>
            <CardTitle>Categorías iniciales</CardTitle>
            <CardDescription>
              Las que recibe cada cuenta nueva. Cambiarlas no toca las cuentas que ya existen. Esto lo ves solo vos.
            </CardDescription>
            <CardAction>
              <CategoryDialog action={saveDefaultCategoryAction} />
            </CardAction>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {defaults.map((c) => (
              <div key={c.id} className="flex items-center gap-3 py-2">
                <CategoryIcon icon={c.icon} emoji={c.emoji} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  {c.keywords.length > 0 && <p className="truncate text-xs text-muted-foreground">{c.keywords.join(", ")}</p>}
                </div>
                <CategoryDialog category={c} action={saveDefaultCategoryAction} />
                <DeleteDefaultCategoryButton id={c.id} name={c.name} />
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
