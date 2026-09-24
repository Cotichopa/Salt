import { cn } from "@/lib/utils";

// Barra de progreso de un presupuesto. Normal va en el color del texto (como el resto
// de la app); ámbar desde el 80 % y roja al pasarse. El color nunca va solo: donde se
// usa siempre hay un texto que dice cuánto queda o cuánto te pasaste.

type Level = "ok" | "warning" | "exceeded";

const fill: Record<Level, string> = {
  ok: "bg-foreground",
  warning: "bg-amber-500",
  exceeded: "bg-red-600 dark:bg-red-500",
};

export function BudgetBar({
  spent,
  amount,
  level,
  className,
}: {
  spent: number;
  amount: number;
  level: Level;
  className?: string;
}) {
  const percent = Math.min(100, Math.round((spent / amount) * 100));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label="Presupuesto usado"
      className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div className={cn("h-full rounded-full transition-all", fill[level])} style={{ width: `${percent}%` }} />
    </div>
  );
}
