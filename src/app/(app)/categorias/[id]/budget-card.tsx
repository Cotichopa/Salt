import { CircleAlertIcon, TriangleAlertIcon } from "lucide-react";
import { formatMoney } from "@/lib/format";
import type { BudgetStatus } from "@/lib/services/budgets";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BudgetBar } from "@/components/budget-bar";
import { BudgetDialog } from "./budget-dialog";

// Tarjeta "Presupuesto mensual" de la pantalla de una categoría

function daysInMonth(iso: string) {
  const [y, m] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function BudgetCard({
  budget,
  categoryId,
  categoryName,
  today,
}: {
  budget: BudgetStatus | null;
  categoryId: string;
  categoryName: string;
  today: string;
}) {
  if (!budget) {
    return (
      <Card size="sm">
        <CardHeader>
          <CardTitle>Presupuesto mensual</CardTitle>
          <CardDescription>Poné un tope por mes y te aviso cuando llegues al 80 % y cuando te pases.</CardDescription>
          <CardAction>
            <BudgetDialog categoryId={categoryId} categoryName={categoryName} />
          </CardAction>
        </CardHeader>
      </Card>
    );
  }

  // Proyección: si seguís al ritmo de estos días, ¿cuánto gastarías en todo el mes?
  // Recién desde el día 7, antes es muy poca información para adivinar.
  const day = Number(today.slice(8, 10));
  const projected = (budget.spent / day) * daysInMonth(today);
  const showProjection = budget.level !== "exceeded" && day >= 7 && projected > budget.amount;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Presupuesto mensual</CardTitle>
        <CardDescription>
          <span className="font-medium text-foreground tabular-nums">{formatMoney(budget.spent, "ARS")}</span> de{" "}
          <span className="tabular-nums">{formatMoney(budget.amount, "ARS")}</span> este mes
        </CardDescription>
        <CardAction>
          <BudgetDialog categoryId={categoryId} categoryName={categoryName} amount={budget.amount} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <BudgetBar spent={budget.spent} amount={budget.amount} level={budget.level} />
        {budget.level === "exceeded" ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-red-700 dark:text-red-400">
            <CircleAlertIcon className="size-4 shrink-0" />
            Te pasaste por {formatMoney(-budget.remaining, "ARS")}
          </p>
        ) : budget.level === "warning" ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-amber-700 dark:text-amber-400">
            <TriangleAlertIcon className="size-4 shrink-0" />
            Queda poco: {formatMoney(budget.remaining, "ARS")} ({Math.round(budget.ratio * 100)} % usado)
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Te quedan {formatMoney(budget.remaining, "ARS")} ({Math.round(budget.ratio * 100)} % usado)
          </p>
        )}
        {showProjection && (
          <p className="text-sm text-muted-foreground">
            A este ritmo terminarías el mes en {formatMoney(Math.round(projected), "ARS")}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
