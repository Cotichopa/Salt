import Link from "next/link";
import { formatMoney, type CurrencyCode } from "@/lib/format";
import type { YearOverview } from "@/lib/services/stats";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryIcon } from "@/components/category-icon";
import { cn } from "@/lib/utils";
import { YearChart } from "./charts";
import { Comparison, StatCard, StatList, TotalHeader, type Stat } from "./stat-parts";

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

  const total = { label: "Total del año", value: formatMoney(Math.round(data.total), currency), pct, comparisonLabel: data.comparisonLabel };
  const stats: Stat[] = [
    {
      label: "Promedio por mes",
      value: formatMoney(Math.round(data.monthlyAverage), currency),
      help: `${data.since ? `Desde ${data.since} · ` : ""}${data.count} ${data.count === 1 ? "gasto cargado" : "gastos cargados"}`,
    },
    {
      label: "El mes más caro",
      value: data.priciest?.long ?? "—",
      valueClassName: "capitalize",
      help: data.priciest ? formatMoney(Math.round(data.priciest.total), currency) : undefined,
    },
    {
      label: "La que más creció",
      value: data.grown?.name ?? "—",
      valueClassName: "truncate",
      help: data.grown
        ? `${formatMoney(Math.round(data.grown.diff), currency)} más ${data.comparisonLabel.replace("vs. ", "que ")}`
        : `Ninguna gastó más ${data.comparisonLabel.replace("vs. ", "que ")}`,
    },
  ];

  return (
    <>
      {/* Celular y tablet */}
      <div className="flex flex-col gap-4 xl:hidden">
        <StatList total={total} stats={stats} />
        <div className="hidden gap-4 sm:grid sm:grid-cols-2 lg:grid-cols-4">
          <Card size="sm" data-hero>
            <CardHeader>
              <CardDescription>{total.label}</CardDescription>
              <div className="text-2xl font-semibold lg:text-3xl">{total.value}</div>
              <Comparison pct={pct} label={data.comparisonLabel} />
            </CardHeader>
          </Card>
          {stats.map((s) => (
            <StatCard key={s.label} stat={s} />
          ))}
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
      </div>

      {/* Compu: las dos columnas arrancan y terminan a la misma altura */}
      <div className="hidden grid-cols-[minmax(0,5fr)_minmax(0,3fr)] items-stretch gap-4 xl:grid">
        <Card className="gap-0 py-0">
          <TotalHeader {...total} large />
          <div className="flex flex-1 flex-col gap-2 border-t p-4">
            <p className="text-sm text-muted-foreground">Mes a mes, por categoría. Pasá el mouse por una barra para ver el detalle.</p>
            <YearChart data={data} currency={currency} fill />
          </div>
        </Card>
        <div className="grid min-w-0 auto-rows-fr gap-4">
          {stats.map((s) => (
            <StatCard key={s.label} stat={s} className="justify-center" />
          ))}
        </div>
      </div>

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
                        <CategoryIcon color={c.color} icon={c.icon} size="sm" className="max-2xl:hidden" />
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
