import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { cn } from "@/lib/utils";
import { formatMoney, todayISO, type CurrencyCode } from "@/lib/format";
import { getCategory, listCategoriesWithUsage } from "@/lib/services/categories";
import { getCategoryStats, type CategoryPeriod } from "@/lib/services/category-stats";
import { listExpenses } from "@/lib/services/expenses";
import { listPaymentSources } from "@/lib/services/payment-sources";
import { getBudget } from "@/lib/services/budgets";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryIcon } from "@/components/category-icon";
import { ChartDataTable } from "@/components/chart-data-table";
import { ExpensesView } from "../../gastos/expenses-view";
import { CategoryDialog } from "../category-dialog";
import { DeleteCategoryButton } from "../delete-category-button";
import { HistoryChart } from "./history-chart";
import { BudgetCard } from "./budget-card";

// Pantalla de una categoría (/categorias/<id>): cuánto va esta semana, este mes y este año,
// el presupuesto mensual, un gráfico con el historial y los gastos del período elegido.
// El período y la moneda van en la URL (?periodo=semana&moneda=ARS), igual que en el inicio.

const PERIODS = {
  semana: { tile: "Esta semana", previous: "Semana pasada", list: "esta semana", history: "Últimas 12 semanas" },
  mes: { tile: "Este mes", previous: "Mes pasado", list: "este mes", history: "Últimos 12 meses" },
  anio: { tile: "Este año", previous: "Año pasado", list: "este año", history: "Año por año" },
} satisfies Record<CategoryPeriod, Record<string, string>>;

export async function generateMetadata({ params }: PageProps<"/categorias/[id]">): Promise<Metadata> {
  const user = await requireUser();
  const category = await getCategory(user.id, (await params).id);
  return { title: `${category?.name ?? "Categoría"} · Salt` };
}

export default async function CategoryPage({ params, searchParams }: PageProps<"/categorias/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const query = await searchParams;
  const period: CategoryPeriod = query.periodo === "semana" || query.periodo === "anio" ? query.periodo : "mes";
  const currency: CurrencyCode = query.moneda === "USD" ? "USD" : "ARS";

  // Solo categorías base o propias: si el id es de otra cuenta, es como si no existiera
  const categories = await listCategoriesWithUsage(user.id);
  const category = categories.find((c) => c.id === id);
  if (!category) notFound();
  const isOwn = category.userId === user.id;

  const today = todayISO();
  const stats = await getCategoryStats(user.id, id, currency, period);
  const [expenses, sources, budget] = await Promise.all([
    listExpenses(user.id, { categoryId: id, currency, from: stats.periodStart, to: today }),
    listPaymentSources(user.id),
    getBudget(user.id, id),
  ]);
  const categoryOptions = categories.map(({ id, name, emoji, icon }) => ({ id, name, emoji, icon }));
  const href = (p: CategoryPeriod, c: CurrencyCode) => `/categorias/${id}?periodo=${p}&moneda=${c}`;

  return (
    <div className="flex flex-col gap-4 py-2">
      <Link href="/categorias" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeftIcon className="size-4" />
        Categorías
      </Link>

      {/* Encabezado: ícono, nombre y (si es propia) editar / eliminar */}
      <div className="flex items-center gap-3">
        <CategoryIcon icon={category.icon} emoji={category.emoji} size="lg" />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-semibold">{category.name}</h1>
          <p className="text-sm text-muted-foreground">{isOwn ? "Categoría propia" : "Categoría base"}</p>
        </div>
        {isOwn && (
          <div className="flex items-center gap-1">
            <CategoryDialog category={category} />
            <DeleteCategoryButton
              category={category}
              expenseCount={category.expenseCount}
              others={categories.filter((o) => o.id !== id)}
              redirectTo="/categorias"
            />
          </div>
        )}
      </div>

      {category.keywords.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
          <span className="mr-1">Chop la reconoce por</span>
          {category.keywords.map((k) => (
            <Badge key={k} variant="secondary" className="font-normal">
              {k}
            </Badge>
          ))}
        </div>
      )}

      {/* Pesos / Dólares: solo si hay gastos en dólares en esta categoría */}
      {(stats.hasUsd || currency === "USD") && (
        <div className="flex w-fit rounded-lg border p-0.5">
          {(["ARS", "USD"] as const).map((c) => (
            <Link
              key={c}
              href={href(period, c)}
              aria-current={c === currency ? "true" : undefined}
              className={cn(
                "rounded-md px-3 py-1 text-sm",
                c === currency ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {c === "ARS" ? "Pesos" : "Dólares"}
            </Link>
          ))}
        </div>
      )}

      {/* Semana / mes / año: cada tarjeta también elige qué período ver abajo */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        {stats.summary.map((s) => {
          const selected = s.period === period;
          return (
            <Link key={s.period} href={href(s.period, currency)} aria-current={selected ? "true" : undefined} className="group">
              <Card
                size="sm"
                className={cn("h-full transition-colors", selected ? "ring-2 ring-foreground" : "group-hover:bg-muted/50")}
              >
                <CardHeader>
                  <CardDescription>{PERIODS[s.period].tile}</CardDescription>
                  <div className="text-base font-semibold tabular-nums sm:text-2xl lg:text-3xl">
                    {formatMoney(s.current.total, currency)}
                  </div>
                  <p className="text-xs text-muted-foreground sm:text-sm">
                    {s.current.count} {s.current.count === 1 ? "gasto" : "gastos"}
                    <span className="hidden sm:inline">
                      {" · "}
                      {PERIODS[s.period].previous}: {formatMoney(s.previous.total, currency)}
                    </span>
                  </p>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>

      {/* El presupuesto es en pesos: con "Dólares" elegido no lo mostramos */}
      {currency === "ARS" && <BudgetCard budget={budget} categoryId={id} categoryName={category.name} today={today} />}

      <Card>
        <CardHeader>
          <CardTitle>Historial</CardTitle>
          <CardDescription>{PERIODS[period].history}. La barra más clara es el período en curso.</CardDescription>
        </CardHeader>
        <CardContent>
          <HistoryChart data={stats.history} currency={currency} />
          <ChartDataTable currency={currency} rows={stats.history.map((h) => ({ label: h.label, total: h.total }))} />
        </CardContent>
      </Card>

      <h2 className="mt-2 text-lg font-semibold">Gastos de {PERIODS[period].list}</h2>
      <ExpensesView expenses={expenses} categories={categoryOptions} sources={sources} today={today} />
    </div>
  );
}
