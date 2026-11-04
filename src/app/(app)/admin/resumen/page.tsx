import type { Metadata } from "next";
import Link from "next/link";
import { CircleAlertIcon, CircleCheckIcon, TriangleAlertIcon } from "lucide-react";
import { requireSuperadmin } from "@/lib/dal";
import { todayISO } from "@/lib/format";
import { accessOverview, notUnderstood, systemStatus } from "@/lib/services/overview";
import { recentServerErrors } from "@/lib/server-errors";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ChopSection } from "./chop-section";
import { GastosSection } from "./gastos-section";
import { MonthNav } from "./month-nav";
import { resumenHref, SECCIONES, type Seccion } from "./sections";
import { ServidorSection } from "./servidor-section";

export const metadata: Metadata = { title: "Resumen · Salt" };

// Panel del superadmin. Arriba, "Para revisar": lo que tiene que resolver él, venga de donde venga.
// Abajo, una pestaña por tema, cada dato siempre en el mismo lugar. Lo que es de una persona (accesos,
// desbloquear, cerrar sesiones) está en su ficha de Cuentas; las categorías iniciales, en Categorías.

type ReviewItem = { label: string; href: string; serious: boolean };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Se traen como mucho 30 de cada uno: si llegó al tope, puede haber más
const upTo30 = (n: number, one: string, many: string) => (n >= 30 ? `30 o más ${many}` : plural(n, one, many));

export default async function OverviewPage({ searchParams }: PageProps<"/admin/resumen">) {
  const me = await requireSuperadmin();
  const params = await searchParams;
  const currentMonth = todayISO().slice(0, 7);
  const month =
    typeof params.mes === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.mes) && params.mes <= currentMonth
      ? params.mes
      : currentMonth;
  const seccion: Seccion = SECCIONES.find((s) => s.key === params.seccion)?.key ?? "gastos";
  const monthParam = month === currentMonth ? undefined : month;

  // Esto hace falta siempre, para "Para revisar"; lo demás lo pide cada pestaña
  const [access, system, unclear, errors] = await Promise.all([accessOverview(), systemStatus(), notUnderstood(), recentServerErrors()]);

  const failedChecks = system.checks.filter((c) => c.ok === false);
  const review: ReviewItem[] = [
    ...(errors.length > 0
      ? [{ label: upTo30(errors.length, "error del servidor", "errores del servidor"), href: resumenHref("servidor", monthParam), serious: true }]
      : []),
    ...failedChecks.map((c) => ({ label: `Sistema: ${c.label}`, href: resumenHref("servidor", monthParam), serious: true })),
    ...(unclear.length > 0
      ? [{ label: `${upTo30(unclear.length, "mensaje", "mensajes")} que Chop no entendió`, href: resumenHref("chop", monthParam), serious: false }]
      : []),
    ...access
      .filter((a) => a.blockedMinutes > 0 || a.recentFails > 0)
      .map((a) => ({
        label: a.blockedMinutes > 0 ? `${a.name}: login bloqueado` : `${a.name}: ${plural(a.recentFails, "contraseña mal", "contraseñas mal")}`,
        href: `/admin/usuarios?cuenta=${a.id}`,
        serious: a.blockedMinutes > 0,
      })),
  ];
  const counts: Record<Seccion, number> = { gastos: 0, chop: unclear.length, servidor: errors.length + failedChecks.length };

  return (
    <div className="flex flex-col gap-4 py-2">
      <h1 className="text-2xl font-semibold">Resumen</h1>

      <Card className="flex flex-row flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3">
        <h2 className="text-sm font-semibold">Para revisar</h2>
        {review.length === 0 ? (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <CircleCheckIcon className="size-4 text-green-700 dark:text-green-500" />
            Nada pendiente
          </p>
        ) : (
          review.map((r) => {
            const Icon = r.serious ? CircleAlertIcon : TriangleAlertIcon;
            return (
              <Link
                key={r.label}
                href={r.href}
                className="flex min-h-11 items-center gap-2 rounded-lg border bg-muted/50 px-2.5 py-1 text-sm hover:bg-muted lg:min-h-8"
              >
                <Icon className={cn("size-3.5 shrink-0", r.serious ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400")} />
                {r.label}
              </Link>
            );
          })
        )}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b">
        <nav aria-label="Secciones del Resumen" className="flex gap-1 overflow-x-auto overflow-y-hidden">
          {SECCIONES.map((s) => (
            <Link
              key={s.key}
              href={resumenHref(s.key, monthParam)}
              aria-current={s.key === seccion ? "page" : undefined}
              className={cn(
                "flex h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-medium",
                s.key === seccion ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
              {counts[s.key] > 0 && <Badge variant="secondary">{counts[s.key]}</Badge>}
            </Link>
          ))}
        </nav>
        {seccion === "gastos" && (
          <div className="pb-2">
            <MonthNav month={month} seccion="gastos" />
          </div>
        )}
      </div>

      {seccion === "gastos" && <GastosSection month={month} meId={me.id} />}
      {seccion === "chop" && <ChopSection month={month} unclear={unclear} />}
      {seccion === "servidor" && <ServidorSection errors={errors} system={system} />}
    </div>
  );
}
