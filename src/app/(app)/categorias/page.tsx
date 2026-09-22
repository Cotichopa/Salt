import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { listCategoriesWithUsage } from "@/lib/services/categories";
import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryDialog } from "./category-dialog";
import { DeleteCategoryButton } from "./delete-category-button";

export const metadata: Metadata = { title: "Categorías · Salt" };

type Row = Awaited<ReturnType<typeof listCategoriesWithUsage>>[number];

function CategoryInfo({ c }: { c: Row }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <div className="font-medium">
        {c.emoji} {c.name}
        <span className="ml-2 text-sm font-normal text-muted-foreground">
          {c.expenseCount} {c.expenseCount === 1 ? "gasto" : "gastos"}
        </span>
      </div>
      {c.keywords.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {c.keywords.map((k) => (
            <Badge key={k} variant="secondary" className="font-normal">
              {k}
            </Badge>
          ))}
        </div>
      )}
    </div>
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
            <div key={c.id} className="flex items-center gap-2 py-3">
              <CategoryInfo c={c} />
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
          <CardDescription>Las comparten todas las cuentas y no se pueden modificar.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {base.map((c) => (
            <div key={c.id} className="py-3">
              <CategoryInfo c={c} />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
