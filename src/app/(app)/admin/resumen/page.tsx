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
import {
  accessOverview,
  chopUsage,
  compareByCategory,
  notUnderstood,
  peopleOverview,
  systemStatus,
  type Alert,
  type Check,
} from "@/lib/services/overview";
import { listDefaultCategories } from "@/lib/services/default-categories";
import { recentServerErrors } from "@/lib/server-errors";
import { saveDefaultCategoryAction } from "@/lib/actions/superadmin";
import { CategoryIcon } from "@/components/category-icon";
import { CategoryDialog } from "@/app/(app)/categorias/category-dialog";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Editable } from "@/components/read-only";
import { CompareChart } from "./compare-chart";
import { CloseSessionsButton, UnlockButton } from "./access-actions";
import { ClearErrorsButton, DeleteDefaultCategoryButton, ReviewedButton } from "./review-actions";

export const metadata: Metadata = { title: "Resumen · Salt" };

// Panel del superadmin: cómo viene cada persona, comparación por categoría, accesos y el estado
// del servidor. Para ver el detalle de alguien, «Ver cuenta» (solo lectura).

const relative = new Intl.RelativeTimeFormat("es-AR", { numeric: "auto" });

/** Los costos de la IA son de centavos de dólar: con 4 decimales ("US$ 0,0013") */
const usd = (n: number) => `US$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

const dateTime = (d: Date) =>
  d.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

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
  const [people, compare, access, system, chop, unclear, errors, defaults] = await Promise.all([
    peopleOverview(month),
    compareByCategory(month),
    accessOverview(),
    systemStatus(),
    chopUsage(month),
    notUnderstood(),
    recentServerErrors(),
    listDefaultCategories(),
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
          <CardTitle>Chop</CardTitle>
          <CardDescription>
            Mensajes de {formatMonth(month).toLowerCase()} (WhatsApp, chat de la web y tickets del formulario) y lo que
            costó la IA. Los que se resuelven sin IA son gratis.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {chop.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nadie le escribió a Chop este mes.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Persona</TableHead>
                  <TableHead className="text-right">Mensajes</TableHead>
                  <TableHead className="text-right">Sin IA</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {chop.rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{r.messages}</TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {Math.round(((r.messages - r.withAi) / r.messages) * 100)}%
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{usd(r.cost)}</TableCell>
                  </TableRow>
                ))}
                <TableRow>
                  <TableCell className="font-medium">Total</TableCell>
                  <TableCell />
                  <TableCell />
                  <TableCell className="text-right font-medium tabular-nums">{usd(chop.total)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          )}

          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">Lo que no entendió</h3>
            <p className="text-sm text-muted-foreground">
              Sirven para enseñarle frases nuevas. Al marcarlos revisados se borra el texto.
            </p>
            {unclear.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nada pendiente.</p>
            ) : (
              <ul className="flex flex-col divide-y rounded-lg border">
                {unclear.map((m) => (
                  <li key={m.id} className="flex items-start gap-3 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm break-words">«{m.text}»</p>
                      <p className="text-xs text-muted-foreground">
                        {m.user.name} · {m.source === "WHATSAPP" ? "WhatsApp" : "web"} · {m.kind} · {dateTime(m.createdAt)}
                      </p>
                    </div>
                    <Editable>
                      <ReviewedButton id={m.id} />
                    </Editable>
                  </li>
                ))}
              </ul>
            )}
          </div>
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

      <Card>
        <CardHeader>
          <CardTitle>Errores del servidor</CardTitle>
          <CardDescription>
            Los últimos 30 (se borran solos a los 30 días). No incluye los robots que prueban la app desde internet.
          </CardDescription>
          {errors.length > 0 && (
            <CardAction>
              <Editable>
                <ClearErrorsButton />
              </Editable>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {errors.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguno. 🎉</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {errors.map((e) => (
                <li key={e.id} className="flex flex-col gap-0.5 py-2">
                  <span className="text-xs text-muted-foreground">{dateTime(e.createdAt)}</span>
                  <details>
                    <summary className="cursor-pointer text-sm break-words">{e.message.split("\n")[0].slice(0, 200)}</summary>
                    <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">{e.message}</pre>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Categorías iniciales</CardTitle>
          <CardDescription>Las que recibe cada cuenta nueva. Cambiarlas no toca las cuentas que ya existen.</CardDescription>
          <CardAction>
            <Editable>
              <CategoryDialog action={saveDefaultCategoryAction} />
            </Editable>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col divide-y">
          {defaults.map((c) => (
            <div key={c.id} className="flex items-center gap-3 py-2">
              <CategoryIcon icon={c.icon} emoji={c.emoji} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{c.name}</p>
                {c.keywords.length > 0 && <p className="truncate text-xs text-muted-foreground">{c.keywords.join(", ")}</p>}
              </div>
              <Editable>
                <CategoryDialog category={c} action={saveDefaultCategoryAction} />
                <DeleteDefaultCategoryButton id={c.id} name={c.name} />
              </Editable>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
