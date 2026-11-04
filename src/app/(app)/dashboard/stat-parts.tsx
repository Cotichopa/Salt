import { ArrowDownIcon, ArrowUpIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardDescription, CardHeader } from "@/components/ui/card";

// Los números de arriba del Inicio, en sus tres formas: el total con su comparación, una tarjeta por
// número (compu y tablet) y el total con los demás en filas, en una sola tarjeta (celular).

export type Stat = { label: string; value: string; help?: string; valueClassName?: string };

/** "4% menos que octubre" (gastar más es malo: sube en rojo, baja en verde; siempre con flecha y texto) */
export function Comparison({ pct, label }: { pct: number | null; label: string }) {
  if (pct === null) return null;
  if (pct === 0) return <p className="text-sm text-muted-foreground">Igual {label.replace("vs.", "que")}</p>;
  return (
    <p className={cn("flex flex-wrap items-center gap-1 text-sm", pct > 0 ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400")}>
      {pct > 0 ? <ArrowUpIcon className="size-4" /> : <ArrowDownIcon className="size-4" />}
      {Math.abs(pct)}% {pct > 0 ? "más" : "menos"}
      <span className="text-muted-foreground">{label}</span>
    </p>
  );
}

/**
 * El total, arriba de una tarjeta. `data-hero`: con el estilo "Con color" se llena del color principal,
 * pero solo esta franja (un gráfico abajo se seguiría viendo sobre la tarjeta).
 */
export function TotalHeader({ label, value, pct, comparisonLabel, large }: { label: string; value: string; pct: number | null; comparisonLabel: string; large?: boolean }) {
  return (
    <div data-hero className="flex flex-col gap-1 bg-card p-4 text-card-foreground">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={cn("font-semibold", large ? "text-4xl" : "text-3xl")}>{value}</div>
      <Comparison pct={pct} label={comparisonLabel} />
    </div>
  );
}

export function StatCard({ stat, className }: { stat: Stat; className?: string }) {
  return (
    <Card size="sm" className={className}>
      <CardHeader>
        <CardDescription>{stat.label}</CardDescription>
        <div className={cn("text-2xl font-semibold lg:text-3xl xl:text-2xl 2xl:text-3xl", stat.valueClassName)}>{stat.value}</div>
        {stat.help && <p className="line-clamp-2 text-sm text-muted-foreground">{stat.help}</p>}
      </CardHeader>
    </Card>
  );
}

/** Celular: el total grande y los demás números en filas, todo en una tarjeta */
export function StatList({ total, stats }: { total: { label: string; value: string; pct: number | null; comparisonLabel: string }; stats: Stat[] }) {
  return (
    <Card className="gap-0 py-0 sm:hidden">
      <TotalHeader {...total} />
      <ul className="flex flex-col px-4">
        {stats.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-3 border-t py-2.5">
            <div className="min-w-0">
              <div className="text-sm">{s.label}</div>
              {s.help && <div className="truncate text-xs text-muted-foreground">{s.help}</div>}
            </div>
            <div className={cn("shrink-0 text-base font-semibold tabular-nums", s.valueClassName)}>{s.value}</div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
