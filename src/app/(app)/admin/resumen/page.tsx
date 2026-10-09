import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleMinusIcon,
  EyeIcon,
  MessageCircleIcon,
  MonitorIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { requireSuperadmin } from "@/lib/dal";
import { formatMoney, formatMonth, todayISO } from "@/lib/format";
import { shiftMonth } from "@/lib/services/card-statements";
import { accessOverview, compareByCategory, peopleOverview, systemStatus, type Alert, type Check } from "@/lib/services/overview";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Editable } from "@/components/read-only";
import { CompareChart } from "./compare-chart";
import { CloseSessionsButton, UnlockButton } from "./access-actions";

export const metadata: Metadata = { title: "Resumen · Salt" };

// Panel del superadmin: cómo viene cada persona, comparación por categoría, accesos y el estado
// del servidor. Para ver el detalle de alguien, «Ver cuenta» (solo lectura).

const relative = new Intl.RelativeTimeFormat("es-AR", { numeric: "auto" });

/** "hace 5 minutos", "ayer", "hace 3 semanas" (o "nunca") */
function ago(date: Date | null | undefined) {
  if (!date) return "nunca";
  const minutes = Math.round((date.getTime() - Date.now()) / 60_000);
  if (minutes > -60) return relative.format(Math.min(minutes, -1), "minute");
  const hours = Math.round(minutes / 60);
  if (hours > -24) return relative.format(hours, "hour");
  const days = Math.round(hours / 24);
  if (days > -14) return relative.format(days, "day");
  if (days > -60) return relative.format(Math.round(days / 7), "week");
  return relative.format(Math.round(days / 30), "month");
}

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

function CheckLine({ check }: { check: Check }) {
  const Icon = check.ok === null ? CircleMinusIcon : check.ok ? CircleCheckIcon : CircleAlertIcon;
  return (
    <li className="flex items-start gap-3 py-2">
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          check.ok === null ? "text-muted-foreground" : check.ok ? "text-green-700 dark:text-green-500" : "text-red-700 dark:text-red-400",
        )}
        aria-label={check.ok === null ? "Sin configurar" : check.ok ? "Bien" : "Problema"}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium">{check.label}</p>
        <p className="text-sm text-muted-foreground">{check.detail}</p>
      </div>
    </li>
  );
}

export default async function OverviewPage({ searchParams }: PageProps<"/admin/resumen">) {
  const me = await requireSuperadmin();
  const params = await searchParams;
  const currentMonth = todayISO().slice(0, 7);
  const month =
    typeof params.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.mes) && params.mes <= currentMonth
      ? params.mes
      : currentMonth;
  const [people, compare, access, system] = await Promise.all([
    peopleOverview(month),
    compareByCategory(month),
    accessOverview(),
    systemStatus(),
  ]);
  const isCurrent = month === currentMonth;
  const navButton = buttonVariants({ variant: "outline", size: "icon" });

  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Resumen</h1>
        <div className="flex items-center gap-1">
          <Link href={`/admin/resumen?mes=${shiftMonth(month, -1)}`} className={navButton} aria-label="Mes anterior">
            <ChevronLeftIcon />
          </Link>
          <span className="min-w-36 text-center text-sm font-medium">{formatMonth(month)}</span>
          {isCurrent ? (
            <span className={cn(navButton, "pointer-events-none opacity-50")} aria-hidden>
              <ChevronRightIcon />
            </span>
          ) : (
            <Link href={`/admin/resumen?mes=${shiftMonth(month, 1)}`} className={navButton} aria-label="Mes siguiente">
              <ChevronRightIcon />
            </Link>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Personas</CardTitle>
          <CardDescription>
            Lo gastado en pesos{isCurrent ? ", contra los mismos días del mes pasado" : ", contra el mes anterior"}. Las
            alertas son de hoy.
          </CardDescription>
        </CardHeader>
        <CardContent>
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
              {people.map((p) => {
                const delta = p.previous > 0 ? (p.total - p.previous) / p.previous : null;
                return (
                  <TableRow key={p.id} className={p.active ? undefined : "opacity-50"}>
                    <TableCell className="font-medium">
                      {p.name} {!p.active && <Badge variant="outline">inactiva</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="font-medium tabular-nums">{formatMoney(p.total, "ARS")}</div>
                      {delta !== null && Math.round(delta * 100) !== 0 && (
                        <div className="flex items-center justify-end gap-0.5 text-xs text-muted-foreground">
                          {delta > 0 ? <ArrowUpIcon className="size-3" /> : <ArrowDownIcon className="size-3" />}
                          {Math.abs(Math.round(delta * 100))}% {delta > 0 ? "más" : "menos"}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {p.lastExpense ? (
                        <span className="flex items-center gap-1.5">
                          {p.lastExpense.source === "WHATSAPP" ? (
                            <MessageCircleIcon className="size-3.5 text-green-600" aria-label="Por WhatsApp" />
                          ) : (
                            <MonitorIcon className="size-3.5" aria-label="Por la web" />
                          )}
                          {ago(p.lastExpense.createdAt)}
                        </span>
                      ) : (
                        "nunca"
                      )}
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
                    <TableCell className="text-right">{p.id !== me.id && <ViewAccountButton userId={p.id} />}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
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

      <Card>
        <CardHeader>
          <CardTitle>Accesos</CardTitle>
          <CardDescription>
            Cuándo usó cada persona la web y Chop, sus accesos con huella y si el login está bloqueado por contraseñas mal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Persona</TableHead>
                <TableHead>Web</TableHead>
                <TableHead>Chop</TableHead>
                <TableHead>Huella</TableHead>
                <TableHead>Login</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {access.map((a) => (
                <TableRow key={a.id} className={a.active ? undefined : "opacity-50"}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{ago(a.lastWebAt)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{ago(a.lastChopAt)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {a.passkeys === 0 ? "—" : `${a.passkeys} ${a.passkeys === 1 ? "dispositivo" : "dispositivos"}`}
                  </TableCell>
                  <TableCell className="text-sm">
                    {a.blockedMinutes > 0 ? (
                      <span className="flex items-center gap-1.5 text-red-700 dark:text-red-400">
                        <CircleAlertIcon className="size-3.5 shrink-0" />
                        Bloqueado ({a.blockedMinutes} min)
                      </span>
                    ) : a.recentFails > 0 ? (
                      <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                        <TriangleAlertIcon className="size-3.5 shrink-0" />
                        {a.recentFails} {a.recentFails === 1 ? "contraseña mal" : "contraseñas mal"}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Bien</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Editable>
                      <div className="flex flex-wrap justify-end gap-2">
                        {(a.blockedMinutes > 0 || a.recentFails > 0) && <UnlockButton userId={a.id} name={a.name} />}
                        {a.id !== me.id && <CloseSessionsButton userId={a.id} name={a.name} />}
                      </div>
                    </Editable>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sistema</CardTitle>
          <CardDescription>El servidor donde corre Salt, ahora.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-x-8 sm:grid-cols-2">
          <ul className="flex flex-col divide-y">
            {system.checks.map((c) => (
              <CheckLine key={c.label} check={c} />
            ))}
          </ul>
          <dl className="flex flex-col divide-y">
            {system.info.map((i) => (
              <div key={i.label} className="py-2">
                <dt className="text-sm font-medium">{i.label}</dt>
                <dd className="text-sm text-muted-foreground">{i.detail}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
