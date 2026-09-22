"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis, type TooltipContentProps } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { formatMoney, paymentMethodLabels, type CurrencyCode } from "@/lib/format";
import type { Dashboard } from "@/lib/services/stats";

// Gráficos del dashboard (Recharts, a través del componente "chart" de shadcn).
// Reglas de diseño: barras finas (máx. 24px) con punta redondeada, grilla tenue,
// un solo color cuando hay una sola serie, y tooltip al pasar el mouse.

const compact = new Intl.NumberFormat("es-AR", { notation: "compact", maximumFractionDigits: 1 });
const monthShort = new Intl.DateTimeFormat("es-AR", { month: "short", timeZone: "UTC" });

function monthLabel(month: string) {
  return monthShort.format(new Date(`${month}-01T00:00:00Z`)).replace(".", "");
}

// Recuadro que aparece al pasar el mouse sobre una barra
function MoneyTooltip({
  active,
  payload,
  label,
  currency,
  formatLabel,
}: Partial<TooltipContentProps<number, string>> & { currency: CurrencyCode; formatLabel: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
      <div className="text-muted-foreground">{formatLabel(String(label))}</div>
      <div className="font-medium tabular-nums">{formatMoney(Number(payload[0].value), currency)}</div>
    </div>
  );
}

const singleSeries = { total: { label: "Total", color: "var(--chart-1)" } } satisfies ChartConfig;

export function DailyChart({ data, currency, month }: { data: Dashboard["byDay"]; currency: CurrencyCode; month: string }) {
  return (
    <ChartContainer config={singleSeries} className="aspect-auto h-56 w-full">
      <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12} />
        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => compact.format(v)} />
        <ChartTooltip
          cursor={{ fill: "var(--muted)" }}
          content={<MoneyTooltip currency={currency} formatLabel={(d) => `${d}/${month.slice(5)}`} />}
        />
        <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} maxBarSize={24} />
      </BarChart>
    </ChartContainer>
  );
}

export function CategoryChart({ data, currency }: { data: Dashboard["byCategory"]; currency: CurrencyCode }) {
  // Barras horizontales ordenadas de mayor a menor: con nombres largos se leen mejor que una torta
  return (
    <ChartContainer config={singleSeries} className="aspect-auto w-full" style={{ height: data.length * 36 + 8 }}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 96, left: 0, bottom: 0 }}>
        <XAxis type="number" hide />
        <YAxis type="category" dataKey="name" tickLine={false} axisLine={false} width={148} />
        <ChartTooltip cursor={{ fill: "var(--muted)" }} content={<MoneyTooltip currency={currency} formatLabel={(l) => l} />} />
        <Bar dataKey="total" fill="var(--color-total)" radius={[0, 4, 4, 0]} maxBarSize={20}>
          <LabelList
            dataKey="total"
            position="right"
            className="fill-foreground"
            formatter={(v) => formatMoney(Number(v), currency)}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

export function MonthlyChart({ data, currency }: { data: Dashboard["lastMonths"]; currency: CurrencyCode }) {
  // "Énfasis": el mes elegido en color y los anteriores en gris, como contexto
  return (
    <ChartContainer config={singleSeries} className="aspect-auto h-56 w-full">
      <BarChart data={data} margin={{ top: 24, right: 4, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} tickFormatter={monthLabel} />
        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => compact.format(v)} />
        <ChartTooltip cursor={{ fill: "var(--muted)" }} content={<MoneyTooltip currency={currency} formatLabel={monthLabel} />} />
        <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={24}>
          {data.map((d) => (
            <Cell key={d.month} fill={d.selected ? "var(--chart-1)" : "var(--chart-5)"} />
          ))}
          <LabelList
            dataKey="total"
            position="top"
            className="fill-foreground"
            content={({ x, y, width, index }) => {
              const d = index === undefined ? undefined : data[index];
              if (!d?.selected) return null; // solo rotulamos el mes elegido
              return (
                <text x={Number(x) + Number(width) / 2} y={Number(y) - 6} textAnchor="middle" className="fill-foreground text-xs">
                  {formatMoney(d.total, currency)}
                </text>
              );
            }}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}

// Colores fijos por medio de pago: el débito siempre es azul aunque cambien los filtros
const methodColors = {
  DEBIT: "var(--chart-1)",
  CREDIT: "var(--chart-2)",
  CASH: "var(--chart-3)",
  TRANSFER: "var(--chart-4)",
} as const;

export function PaymentMethodBar({ data, currency }: { data: Dashboard["byMethod"]; currency: CurrencyCode }) {
  const total = data.reduce((s, d) => s + d.total, 0);
  const used = data.filter((d) => d.total > 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Una sola barra dividida en partes; el hueco de 2px separa los segmentos */}
      <div className="flex h-5 gap-0.5 overflow-hidden rounded-md">
        {used.map((d) => (
          <div
            key={d.method}
            style={{ width: `${(d.total / total) * 100}%`, background: methodColors[d.method] }}
            title={`${paymentMethodLabels[d.method]}: ${formatMoney(d.total, currency)}`}
          />
        ))}
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {data.map((d) => (
          <li key={d.method} className="flex items-center gap-2 text-sm">
            <span className="size-3 shrink-0 rounded-sm" style={{ background: methodColors[d.method] }} />
            <span className="flex-1">{paymentMethodLabels[d.method]}</span>
            <span className="font-medium tabular-nums">{formatMoney(d.total, currency)}</span>
            <span className="w-10 text-right text-muted-foreground tabular-nums">
              {total > 0 ? Math.round((d.total / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
