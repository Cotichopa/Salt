import Link from "next/link";
import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { formatMoney, type CurrencyCode } from "@/lib/format";
import type { YearOverview } from "@/lib/services/stats";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryIcon } from "@/components/category-icon";
import { cn } from "@/lib/utils";
import { YearChart } from "./charts";

// Inicio → "Año": indicadores del año, el gráfico de cada mes por categoría y la tabla con todo.

// En la tabla, los números sin "$" ni centavos (la moneda va en el título): así entran los 12 meses
const plain = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });

export function YearView({ data, currency }: { data: YearOverview; currency: CurrencyCode }) {
  const delta = data.previousTotal > 0 ? (data.total - data.previousTotal) / data.previousTotal : null;
  const pct = delta !== null ? Math.round(delta * 100) : null;
  const hasUpcoming = data.months.some((m) => m.future && m.total > 0);

  if (data.count === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground">No hay gastos en {data.year}.</CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card size="sm">
          <CardHeader>
            <CardDescription>Total del año</CardDescription>
            <div className="text-2xl font-semibold lg:text-3xl">{formatMoney(Math.round(data.total), currency)}</div>
            {pct === 0 && <p className="text-sm text-muted-foreground">Igual {data.comparisonLabel.replace("vs.", "que")}</p>}
            {pct !== null && pct !== 0 && (
              // Gastar más es malo: sube en rojo, baja en verde (siempre con flecha y texto, no solo color)
              <p className={cn("flex flex-wrap items-center gap-1 text-sm", pct > 0 ? "text-red-700 dark:text-red-400" : "text-green-800 dark:text-green-500")}>
                {pct > 0 ? <ArrowUpIcon className="size-4" /> : <ArrowDownIcon className="size-4" />}
                {Math.abs(pct)}% {pct > 0 ? "más" : "menos"}
                <span className="text-muted-foreground">{data.comparisonLabel}</span>
              </p>
            )}
          </CardHeader>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription>Promedio por mes</CardDescription>
            <div className="text-2xl font-semibold lg:text-3xl">{formatMoney(Math.round(data.monthlyAverage), currency)}</div>
            <p className="text-sm text-muted-foreground">
              {data.since && `Desde ${data.since} · `}
              {data.count} {data.count === 1 ? "gasto cargado" : "gastos cargados"}
            </p>
          </CardHeader>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription>El mes más caro</CardDescription>
            <div className="text-2xl font-semibold capitalize lg:text-3xl">{data.priciest?.long ?? "—"}</div>
            {data.priciest && <p className="text-sm text-muted-foreground">{formatMoney(Math.round(data.priciest.total), currency)}</p>}
          </CardHeader>
        </Card>

        <Card size="sm">
          <CardHeader>
            <CardDescription>La que más creció</CardDescription>
            <div className="truncate text-2xl font-semibold lg:text-3xl">{data.grown?.name ?? "—"}</div>
            <p className="text-sm text-muted-foreground">
              {data.grown
                ? `${formatMoney(Math.round(data.grown.diff), currency)} más ${data.comparisonLabel.replace("vs. ", "que ")}`
                : `Ninguna gastó más ${data.comparisonLabel.replace("vs. ", "que ")}`}
            </p>
          </CardHeader>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Mes a mes</CardTitle>
          <CardDescription>Cuánto gastaste cada mes, por categoría. Pasá el mouse por una barra para ver el detalle.</CardDescription>
        </CardHeader>
        <CardContent>
          <YearChart data={data} currency={currency} />
        </CardContent>
      </Card>

      {/* La tabla con todos los números: en el celular se desliza de costado */}
      <Card>
        <CardHeader>
          <CardTitle>Por categoría</CardTitle>
          <CardDescription>
            {currency === "ARS" ? "En pesos" : "En dólares"}. Tocá una categoría para ver su detalle.
            {hasUpcoming && " En gris, las cuotas de los meses que todavía no llegaron (no entran en el total)."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-max text-xs 2xl:text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="sticky left-0 bg-card py-2 pr-3 text-left font-normal">Categoría</th>
                  {data.months.map((m) => (
                    <th key={m.month} className="px-1.5 py-2 text-right font-normal">
                      {m.short}
                    </th>
                  ))}
                  <th className="py-2 pl-3 text-right font-medium text-foreground">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.categories.map((c) => (
                  <tr key={c.id} className="border-b">
                    <td className="sticky left-0 bg-card py-1.5 pr-3">
                      <Link href={`/categorias/${c.id}`} className="flex items-center gap-2 hover:underline">
                        {/* El ícono solo en pantallas muy anchas: así los 12 meses entran sin deslizar */}
                        <CategoryIcon icon={c.icon} size="sm" className="max-2xl:hidden" />
                        <span className="max-w-32 truncate">{c.name}</span>
                      </Link>
                    </td>
                    {c.months.map((v, i) => (
                      <td
                        key={i}
                        className={cn("px-1.5 py-1.5 text-right tabular-nums", data.months[i].future && "text-muted-foreground")}
                      >
                        {v > 0 ? plain.format(v) : data.months[i].future ? "" : "—"}
                      </td>
                    ))}
                    <td className="py-1.5 pl-3 text-right font-medium tabular-nums">{c.total > 0 ? plain.format(c.total) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-medium">
                  <td className="sticky left-0 bg-card py-2 pr-3">Total</td>
                  {data.months.map((m) => (
                    <td key={m.month} className={cn("px-1.5 py-2 text-right tabular-nums", m.future && "text-muted-foreground")}>
                      {m.total > 0 ? plain.format(m.total) : m.future ? "" : "—"}
                    </td>
                  ))}
                  <td className="py-2 pl-3 text-right tabular-nums">{plain.format(data.total)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
