"use client";

import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { formatMoney, type CurrencyCode } from "@/lib/format";
import type { CategoryStats } from "@/lib/services/category-stats";

// Historial de una categoría: una barra por semana, mes o año.
// Una sola serie → un solo color y sin leyenda (el título de la tarjeta dice qué es).
// La barra del período en curso va más clara porque todavía no terminó.

const compact = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });
const config = { total: { label: "Total", color: "var(--chart-1)" } } satisfies ChartConfig;

type Point = CategoryStats["history"][number];

function HistoryTooltip({ active, payload, currency }: Partial<TooltipContentProps<number, string>> & { currency: CurrencyCode }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload as Point;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
      <div className="text-muted-foreground">
        {point.label}
        {point.current && " (en curso)"}
      </div>
      <div className="font-medium tabular-nums">{formatMoney(point.total, currency)}</div>
    </div>
  );
}

export function HistoryChart({ data, currency }: { data: Point[]; currency: CurrencyCode }) {
  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={8} />
        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => compact.format(v)} />
        <ChartTooltip cursor={{ fill: "var(--muted)" }} content={<HistoryTooltip currency={currency} />} />
        <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} maxBarSize={24}>
          {data.map((d) => (
            <Cell key={d.label} fillOpacity={d.current ? 0.45 : 1} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
