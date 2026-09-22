"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Label,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  Sector,
  XAxis,
  YAxis,
  type PieSectorDataItem,
  type TooltipContentProps,
} from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
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

// ---------- Torta de categorías con forma activa ----------
// Al pasar el mouse (o tocar en el celular) la porción se agranda y el centro
// muestra el detalle. Mostramos las 6 categorías más grandes y el resto en "Otras".

const SLICE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-6)",
  "var(--chart-7)",
];

function ActiveSlice(props: PieSectorDataItem) {
  const { outerRadius = 0, ...rest } = props;
  return (
    <g>
      <Sector {...rest} outerRadius={outerRadius + 6} />
      <Sector {...rest} innerRadius={outerRadius + 10} outerRadius={outerRadius + 12} />
    </g>
  );
}

export function CategoryPie({ data, currency }: { data: Dashboard["byCategory"]; currency: CurrencyCode }) {
  const [active, setActive] = useState(0);

  const slices = useMemo(() => {
    const top = data.slice(0, 6).map((d, i) => ({ ...d, fill: SLICE_COLORS[i] }));
    const restTotal = data.slice(6).reduce((sum, d) => sum + d.total, 0);
    return restTotal > 0 ? [...top, { name: "Otras", total: restTotal, fill: "var(--chart-5)" }] : top;
  }, [data]);

  const total = slices.reduce((sum, d) => sum + d.total, 0);
  const current = slices[Math.min(active, slices.length - 1)];
  const share = total > 0 ? Math.round((current.total / total) * 100) : 0;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-2">
      <ChartContainer config={singleSeries} className="aspect-square h-56 shrink-0">
        <PieChart>
          <ChartTooltip defaultIndex={0} content={() => null} />
          <Pie
            data={slices}
            dataKey="total"
            nameKey="name"
            innerRadius={58}
            outerRadius={84}
            paddingAngle={2}
            stroke="var(--card)"
            strokeWidth={2}
            activeShape={ActiveSlice}
            onMouseEnter={(_, index) => setActive(index)}
            onClick={(_, index) => setActive(index)}
          >
            <Label
              position="center"
              content={() => (
                <>
                  <text x="50%" y="46%" textAnchor="middle" className="fill-muted-foreground text-xs">
                    {current.name}
                  </text>
                  <text x="50%" y="58%" textAnchor="middle" className="fill-foreground text-base font-semibold">
                    {formatMoney(current.total, currency)}
                  </text>
                  <text x="50%" y="70%" textAnchor="middle" className="fill-muted-foreground text-xs">
                    {share}% del mes
                  </text>
                </>
              )}
            />
          </Pie>
        </PieChart>
      </ChartContainer>

      {/* La referencia también hace de tabla: nombre, monto y porcentaje de cada porción */}
      <ul className="flex w-full flex-col gap-1.5 text-sm">
        {slices.map((s, i) => (
          <li key={s.name}>
            <button
              type="button"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              aria-current={i === active}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-muted aria-[current=true]:bg-muted"
            >
              <span className="size-3 shrink-0 rounded-sm" style={{ background: s.fill }} />
              <span className="flex-1 truncate">{s.name}</span>
              <span className="font-medium tabular-nums">{formatMoney(s.total, currency)}</span>
              <span className="w-10 text-right text-muted-foreground tabular-nums">
                {total > 0 ? Math.round((s.total / total) * 100) : 0}%
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------- Acumulado del mes vs. mes pasado ----------

export function CumulativeChart({
  data,
  currency,
  month,
}: {
  data: Dashboard["cumulative"];
  currency: CurrencyCode;
  month: string;
}) {
  const config = {
    actual: { label: "Este mes", color: "var(--chart-1)" },
    anterior: { label: "Mes pasado", color: "var(--chart-5)" },
  } satisfies ChartConfig;

  return (
    <ChartContainer config={config} className="aspect-auto h-56 w-full">
      <LineChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="day" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={12} />
        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => compact.format(v)} />
        <ChartTooltip
          content={<CompareTooltip currency={currency} formatLabel={(d) => `${d}/${month.slice(5)}`} />}
        />
        <Line
          dataKey="anterior"
          type="monotone"
          stroke="var(--color-anterior)"
          strokeWidth={2}
          dot={false}
          connectNulls
        />
        <Line dataKey="actual" type="monotone" stroke="var(--color-actual)" strokeWidth={2} dot={false} />
        <ChartLegend content={<ChartLegendContent />} />
      </LineChart>
    </ChartContainer>
  );
}

// Tooltip con las dos series y la diferencia entre ellas
function CompareTooltip({
  active,
  payload,
  label,
  currency,
  formatLabel,
}: Partial<TooltipContentProps<number, string>> & { currency: CurrencyCode; formatLabel: (l: string) => string }) {
  if (!active || !payload?.length) return null;
  const now = payload.find((p) => p.dataKey === "actual")?.value;
  const before = payload.find((p) => p.dataKey === "anterior")?.value;
  const diff = typeof now === "number" && typeof before === "number" ? now - before : null;

  return (
    <div className="rounded-lg border bg-background px-3 py-2 text-xs shadow-md">
      <div className="text-muted-foreground">Día {formatLabel(String(label))}</div>
      {typeof now === "number" && (
        <div className="font-medium tabular-nums">Este mes: {formatMoney(now, currency)}</div>
      )}
      {typeof before === "number" && (
        <div className="text-muted-foreground tabular-nums">Mes pasado: {formatMoney(before, currency)}</div>
      )}
      {diff !== null && (
        <div className={cn("tabular-nums", diff > 0 ? "text-red-600 dark:text-red-400" : "text-green-700 dark:text-green-500")}>
          {diff > 0 ? "+" : "−"}
          {formatMoney(Math.abs(diff), currency)}
        </div>
      )}
    </div>
  );
}

// ---------- Gasto por día de la semana ----------

export function WeekdayChart({ data, currency }: { data: Dashboard["byWeekday"]; currency: CurrencyCode }) {
  const max = Math.max(...data.map((d) => d.total));
  return (
    <ChartContainer config={singleSeries} className="aspect-auto h-44 w-full">
      <BarChart data={data} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="name" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => compact.format(v)} />
        <ChartTooltip cursor={{ fill: "var(--muted)" }} content={<MoneyTooltip currency={currency} formatLabel={(l) => l} />} />
        <Bar dataKey="total" radius={[4, 4, 0, 0]} maxBarSize={28}>
          {data.map((d) => (
            // El día más caro en color, el resto en gris: se ve de una cuál es
            <Cell key={d.name} fill={d.total === max && max > 0 ? "var(--chart-1)" : "var(--chart-5)"} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
