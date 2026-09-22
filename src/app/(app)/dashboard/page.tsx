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
import { CategoryPie, CumulativeChart, DailyChart, PaymentMethodBar, WeekdayChart } from "./charts";

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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Total del mes</CardDescription>
            <div className="text-2xl font-semibold lg:text-3xl">{formatMoney(data.total, currency)}</div>
            {delta !== null && Math.round(delta * 100) === 0 && (
              <p className="text-sm text-muted-foreground">Igual {data.comparisonLabel.replace("vs.", "que")}</p>
            )}
            {delta !== null && Math.round(delta * 100) !== 0 && (
              // Gastar más es malo: sube en rojo, baja en verde (siempre con flecha y texto, no solo color)
              <p className={cn("flex flex-wrap items-center gap-1 text-sm", delta > 0 ? "text-red-700 dark:text-red-400" : "text-green-800 dark:text-green-500")}>
                {delta > 0 ? <ArrowUpIcon className="size-4" /> : <ArrowDownIcon className="size-4" />}
                {Math.abs(Math.round(delta * 100))}% {delta > 0 ? "más" : "menos"}
                <span className="text-muted-foreground">{data.comparisonLabel}</span>
              </p>
            )}
          </CardHeader>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription>{data.projection !== null ? "Proyección a fin de mes" : "Promedio por día"}</CardDescription>
            <div className="text-2xl font-semibold lg:text-3xl">
              {formatMoney(Math.round(data.projection ?? data.dailyAverage), currency)}
            </div>
            <p className="text-sm text-muted-foreground">
              {data.projection !== null ? `Si seguís a este ritmo · ${formatMoney(Math.round(data.dailyAverage), currency)} por día` : "Mes cerrado"}
            </p>
          </CardHeader>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription>Gasto promedio</CardDescription>
            <div className="text-2xl font-semibold lg:text-3xl">{formatMoney(Math.round(data.averageTicket), currency)}</div>
            <p className="text-sm text-muted-foreground">
              {data.count} {data.count === 1 ? "gasto cargado" : "gastos cargados"}
            </p>
          </CardHeader>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription>El más grande</CardDescription>
            <div className="text-2xl font-semibold lg:text-3xl">
              {data.biggest ? formatMoney(data.biggest.amount, currency) : "—"}
            </div>
            {data.biggest && (
              <p className="truncate text-sm text-muted-foreground">
                {data.biggest.category}
                {data.biggest.description ? ` · ${data.biggest.description}` : ""}
              </p>
            )}
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
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>En qué se fue</CardTitle>
              <CardDescription>Tocá una categoría para ver el detalle.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <CategoryPie data={data.byCategory} currency={currency} />
              <div className="flex flex-col gap-3 border-t pt-5">
                <p className="text-sm text-muted-foreground">Cómo lo pagaste</p>
                <PaymentMethodBar data={data.byMethod} currency={currency} />
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Cómo venís contra el mes pasado</CardTitle>
              <CardDescription>Suma acumulada día a día.</CardDescription>
            </CardHeader>
            <CardContent>
              <CumulativeChart data={data.cumulative} currency={currency} month={month} />
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
              <CardTitle>Por día de la semana</CardTitle>
            </CardHeader>
            <CardContent>
              <WeekdayChart data={data.byWeekday} currency={currency} />
              <DataTable currency={currency} rows={data.byWeekday.map((d) => ({ label: d.name, total: d.total }))} />
            </CardContent>
          </Card>

        </div>
      )}
    </div>
  );
}
