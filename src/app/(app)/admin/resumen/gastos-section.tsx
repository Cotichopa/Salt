import { ArrowDownIcon, ArrowUpIcon, CircleAlertIcon, EyeIcon, MessageCircleIcon, MonitorIcon, TriangleAlertIcon } from "lucide-react";
import { ago, formatMoney, formatMonth, todayISO } from "@/lib/format";
import { compareByCategory, peopleOverview, type Alert } from "@/lib/services/overview";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CompareChart } from "./compare-chart";

// Pestaña Gastos: cómo viene cada persona en el mes y la comparación por categoría

function ViewAccountButton({ userId }: { userId: string }) {
  return (
    <form action="/api/ver-como" method="post">
      <input type="hidden" name="userId" value={userId} />
      <Button type="submit" size="sm" variant="outline">
        <EyeIcon />
        Ver cuenta
      </Button>
    </form>
  );
}

// Estados con ícono y texto, nunca solo color
function AlertLine({ alert }: { alert: Alert }) {
  const Icon = alert.level === "serious" ? CircleAlertIcon : TriangleAlertIcon;
  return (
    <li
      className={cn(
        "flex items-start gap-1.5",
        alert.level === "serious" ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400",
      )}
    >
      <Icon className="mt-0.5 size-3.5 shrink-0" />
      {alert.text}
    </li>
  );
}

type Person = Awaited<ReturnType<typeof peopleOverview>>[number];

function Delta({ person }: { person: Person }) {
  const delta = person.previous > 0 ? (person.total - person.previous) / person.previous : null;
  if (delta === null || Math.round(delta * 100) === 0) return null;
  return (
    <div className="flex items-center justify-end gap-0.5 text-xs text-muted-foreground">
      {delta > 0 ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />}
      {Math.abs(Math.round(delta * 100))}% {delta > 0 ? "más" : "menos"}
    </div>
  );
}

function LastExpense({ person }: { person: Person }) {
  if (!person.lastExpense) return <>nunca</>;
  return (
    <span className="flex items-center gap-1.5">
      {person.lastExpense.source === "WHATSAPP" ? (
        <MessageCircleIcon className="size-3.5 text-green-600" aria-label="Por WhatsApp" />
      ) : (
        <MonitorIcon className="size-3.5" aria-label="Por la web" />
      )}
      {ago(person.lastExpense.createdAt)}
    </span>
  );
}

export async function GastosSection({ month, meId }: { month: string; meId: string }) {
  const [people, compare] = await Promise.all([peopleOverview(month), compareByCategory(month)]);
  const isCurrent = month === todayISO().slice(0, 7);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Personas</CardTitle>
          <CardDescription>
            Lo gastado en pesos{isCurrent ? ", contra los mismos días del mes pasado" : ", contra el mes anterior"}. Las alertas son de hoy.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* En el celular, una tarjeta por persona: la tabla no entra */}
          <ul className="flex flex-col divide-y md:hidden">
            {people.map((p) => (
              <li key={p.id} className={cn("flex flex-col gap-2 py-3 first:pt-0 last:pb-0", !p.active && "opacity-50")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {p.name} {!p.active && <Badge variant="outline">inactiva</Badge>}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <LastExpense person={p} />
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium tabular-nums">{formatMoney(p.total, "ARS")}</div>
                    <Delta person={p} />
                  </div>
                </div>
                {p.alerts.length > 0 && (
                  <ul className="flex flex-col gap-0.5 text-sm">
                    {p.alerts.map((a) => (
                      <AlertLine key={a.text} alert={a} />
                    ))}
                  </ul>
                )}
                {p.id !== meId && <ViewAccountButton userId={p.id} />}
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Persona</TableHead>
                  <TableHead className="text-right">Gastó</TableHead>
                  <TableHead>Último gasto</TableHead>
                  <TableHead>Alertas</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {people.map((p) => (
                  <TableRow key={p.id} className={p.active ? undefined : "opacity-50"}>
                    <TableCell className="font-medium">
                      {p.name} {!p.active && <Badge variant="outline">inactiva</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="font-medium tabular-nums">{formatMoney(p.total, "ARS")}</div>
                      <Delta person={p} />
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <LastExpense person={p} />
                    </TableCell>
                    <TableCell className="text-sm">
                      {p.alerts.length > 0 ? (
                        <ul className="flex flex-col gap-0.5 whitespace-normal">
                          {p.alerts.map((a) => (
                            <AlertLine key={a.text} alert={a} />
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">{p.id !== meId && <ViewAccountButton userId={p.id} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Comparar por categoría</CardTitle>
          <CardDescription>
            Cuánto gastó cada persona en {formatMonth(month).toLowerCase()}, en pesos. Las categorías se juntan por nombre.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CompareChart people={compare.people} categories={compare.categories} />
        </CardContent>
      </Card>
    </div>
  );
}
