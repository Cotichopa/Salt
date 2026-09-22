import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { requireUser } from "@/lib/dal";
import { formatMoney, formatMonth, todayISO, type CurrencyCode } from "@/lib/format";
import { listCategories } from "@/lib/services/categories";
import { getDashboard } from "@/lib/services/stats";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ExpenseDialog } from "../gastos/expense-dialog";
import { CategoryChart, DailyChart, MonthlyChart, PaymentMethodBar } from "./charts";

export const metadata: Metadata = { title: "Inicio · Salt" };

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 7);
}

// Tabla simple escondida debajo de cada gráfico: permite leer los valores exactos
// sin depender de los colores ni del mouse (accesibilidad)
function DataTable({ rows, currency }: { rows: { label: string; total: number }[]; currency: CurrencyCode }) {
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Ver datos</summary>
      <table className="mt-2 w-full">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b last:border-0">
              <td className="py-1">{r.label}</td>
              <td className="py-1 text-right tabular-nums">{formatMoney(r.total, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const user = await requireUser();
  const params = await searchParams;
  const today = todayISO();
  const currentMonth = today.slice(0, 7);
  const month =
    typeof params.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.mes) && params.mes <= currentMonth
      ? params.mes
      : currentMonth;
  const currency: CurrencyCode = params.moneda === "USD" ? "USD" : "ARS";

  const [data, categories] = await Promise.all([getDashboard(user.id, month, currency), listCategories(user.id)]);
  const href = (m: string, c: CurrencyCode) => `/dashboard?mes=${m}&moneda=${c}`;

  const delta = data.previousTotal > 0 ? (data.total - data.previousTotal) / data.previousTotal : null;

  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Hola, {user.name} 👋</h1>
        <ExpenseDialog categories={categories.map(({ id, name, emoji }) => ({ id, name, emoji }))} today={today} />
      </div>

      {/* Una sola fila de filtros que aplica a todo el dashboard */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Link href={href(shiftMonth(month, -1), currency)} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Mes anterior">
            <ChevronLeftIcon />
          </Link>
          <span className="min-w-36 text-center text-sm font-medium">{formatMonth(month)}</span>
          {month < currentMonth ? (
            <Link href={href(shiftMonth(month, 1), currency)} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Mes siguiente">
              <ChevronRightIcon />
            </Link>
          ) : (
            <span className={cn(buttonVariants({ variant: "outline", size: "icon" }), "pointer-events-none opacity-50")} aria-hidden>
              <ChevronRightIcon />
            </span>
          )}
        </div>
        <div className="flex rounded-lg border p-0.5">
          {(["ARS", "USD"] as const).map((c) => (
            <Link
              key={c}
              href={href(month, c)}
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
      </div>

      {/* Fila de indicadores */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Total del mes</CardDescription>
            <div className="text-3xl font-semibold">{formatMoney(data.total, currency)}</div>
            {delta !== null && Math.round(delta * 100) === 0 && (
              <p className="text-sm text-muted-foreground">Igual {data.comparisonLabel.replace("vs.", "que")}</p>
            )}
            {delta !== null && Math.round(delta * 100) !== 0 && (
              // Gastar más es malo: sube en rojo, baja en verde (siempre con flecha y texto, no solo color)
              <p className={cn("flex items-center gap-1 text-sm", delta > 0 ? "text-red-700 dark:text-red-400" : "text-green-800 dark:text-green-500")}>
                {delta > 0 ? <ArrowUpIcon className="size-4" /> : <ArrowDownIcon className="size-4" />}
                {Math.abs(Math.round(delta * 100))}% {delta > 0 ? "más" : "menos"}
                <span className="text-muted-foreground">{data.comparisonLabel}</span>
              </p>
            )}
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Promedio por día</CardDescription>
            <div className="text-3xl font-semibold">{formatMoney(Math.round(data.dailyAverage), currency)}</div>
          </CardHeader>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardDescription>Cantidad de gastos</CardDescription>
            <div className="text-3xl font-semibold">{data.count}</div>
          </CardHeader>
        </Card>
      </div>

      {data.count === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            No hay gastos en {currency === "ARS" ? "pesos" : "dólares"} este mes.{" "}
            <Link href="/gastos" className="text-foreground underline underline-offset-4">
              Cargá el primero
            </Link>
            .
          </CardContent>
        </Card>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Por categoría</CardTitle>
            </CardHeader>
            <CardContent>
              <CategoryChart data={data.byCategory} currency={currency} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Por medio de pago</CardTitle>
            </CardHeader>
            <CardContent>
              <PaymentMethodBar data={data.byMethod} currency={currency} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Gasto por día</CardTitle>
            </CardHeader>
            <CardContent>
              <DailyChart data={data.byDay} currency={currency} month={month} />
              <DataTable
                currency={currency}
                rows={data.byDay.filter((d) => d.total > 0).map((d) => ({ label: `${d.day}/${month.slice(5)}`, total: d.total }))}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Últimos 6 meses</CardTitle>
            </CardHeader>
            <CardContent>
              <MonthlyChart data={data.lastMonths} currency={currency} />
              <DataTable currency={currency} rows={data.lastMonths.map((m) => ({ label: formatMonth(m.month), total: m.total }))} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
