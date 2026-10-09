import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon, HashIcon } from "lucide-react";
import { requireAccount } from "@/lib/dal";
import { formatDay, formatMoney, isoToDate, todayISO } from "@/lib/format";
import { listCategories } from "@/lib/services/categories";
import { listExpenses } from "@/lib/services/expenses";
import { listPaymentSources } from "@/lib/services/payment-sources";
import { getTag } from "@/lib/services/tags";
import { totalInPesos } from "@/lib/expense-totals";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryIcon } from "@/components/category-icon";
import { Editable } from "@/components/read-only";
import { ExpensesView } from "../../gastos/expenses-view";
import { DeleteTagButton, RenameTagButton } from "./tag-actions";

export async function generateMetadata({ params }: PageProps<"/etiquetas/[id]">): Promise<Metadata> {
  const user = await requireAccount();
  const tag = await getTag(user.id, (await params).id);
  return { title: `#${tag?.name ?? "Etiqueta"} · Salt` };
}

// Una etiqueta: cuánto costó todo (en pesos), por categoría, y todos sus gastos (de cualquier fecha)
export default async function TagPage({ params }: PageProps<"/etiquetas/[id]">) {
  const user = await requireAccount();
  const { id } = await params;
  // Solo etiquetas propias: si el id es de otra cuenta, es como si no existiera
  const tag = await getTag(user.id, id);
  if (!tag) notFound();

  const [expenses, categories, sources] = await Promise.all([
    listExpenses(user.id, { tagId: id }),
    listCategories(user.id),
    listPaymentSources(user.id),
  ]);
  const categoryOptions = categories.map(({ id, name, emoji, icon }) => ({ id, name, emoji, icon }));
  const totals = totalInPesos(expenses);

  // Por categoría, de mayor a menor (en pesos; los USD viejos sin convertir no suman)
  const byCategory = new Map<string, { category: (typeof expenses)[number]["category"]; total: number }>();
  for (const e of expenses) {
    const row = byCategory.get(e.category.id) ?? { category: e.category, total: 0 };
    row.total += e.currency === "ARS" ? e.amount : (e.amountArs ?? 0);
    byCategory.set(e.category.id, row);
  }
  const categoriesSorted = [...byCategory.values()].sort((a, b) => b.total - a.total);
  const max = categoriesSorted[0]?.total ?? 0;
  // La lista viene del más nuevo al más viejo
  const first = expenses.at(-1)?.date;
  const last = expenses[0]?.date;

  return (
    <div className="flex flex-col gap-4 py-2">
      <Link href="/etiquetas" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeftIcon className="size-4" />
        Etiquetas
      </Link>

      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-muted/40">
          <HashIcon className="size-5" />
        </span>
        <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold">{tag.name}</h1>
        <div className="flex items-center gap-1">
          <Editable>
            <RenameTagButton tag={tag} />
            <DeleteTagButton tag={tag} count={expenses.length} />
          </Editable>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Total</CardDescription>
            <div className="text-2xl font-semibold lg:text-3xl">{formatMoney(Math.round(totals.ars), "ARS")}</div>
            {totals.usd > 0 && <p className="text-sm text-muted-foreground">+ {formatMoney(totals.usd, "USD")} sin convertir</p>}
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Gastos</CardDescription>
            <div className="text-2xl font-semibold lg:text-3xl">{expenses.length}</div>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Fechas</CardDescription>
            <div className="text-2xl font-semibold lg:text-3xl">
              {first && last ? (first === last ? formatDay(isoToDate(first)) : `${formatDay(isoToDate(first))} – ${formatDay(isoToDate(last))}`) : "—"}
            </div>
          </CardHeader>
        </Card>
      </div>

      {categoriesSorted.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Por categoría</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {categoriesSorted.map(({ category, total }) => (
                <li key={category.id} className="flex items-center gap-3 text-sm">
                  <CategoryIcon icon={category.icon} emoji={category.emoji} size="sm" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex justify-between gap-2">
                      <span className="truncate">{category.name}</span>
                      <span className="font-medium tabular-nums">{formatMoney(Math.round(total), "ARS")}</span>
                    </div>
                    {/* Una sola serie: un solo color, medida contra la categoría más grande */}
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-(--chart-1)" style={{ width: `${max > 0 ? (total / max) * 100 : 0}%` }} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <ExpensesView expenses={expenses} categories={categoryOptions} sources={sources} today={todayISO()} />
    </div>
  );
}
