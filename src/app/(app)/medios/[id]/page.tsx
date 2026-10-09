import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { requireAccount } from "@/lib/dal";
import { cn } from "@/lib/utils";
import { formatMoney, formatMonth, todayISO } from "@/lib/format";
import { listCategories } from "@/lib/services/categories";
import { listPaymentSources } from "@/lib/services/payment-sources";
import {
  currentStatementMonth,
  getStatement,
  installmentPurchases,
  shiftMonth,
  statementToShow,
  type StatementStatus,
} from "@/lib/services/card-statements";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ExpensesView } from "../../gastos/expenses-view";
import { PaymentSourceDialog } from "../payment-source-dialog";
import { CategoryIcon } from "@/components/category-icon";
import { MarkPaidDialog, UnmarkPaidButton } from "./mark-paid-dialog";
import { StatementDatesDialog } from "./statement-dates-dialog";
import { Editable } from "@/components/read-only";

// Pantalla de una tarjeta (/medios/<id>): el resumen de crédito de cada mes. Por defecto el
// que hay que pagar (o el abierto, si no hay ninguno a pagar); con las flechas
// (?resumen=2026-09) se ven los anteriores y los que vienen (donde ya caen las cuotas).

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

const STATUS: Record<StatementStatus, { label: string; className: string }> = {
  abierto: { label: "Abierto", className: "" },
  "a pagar": { label: "Cerrado · a pagar", className: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200" },
  vencido: { label: "Vencido · sin pagar", className: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200" },
  pagado: { label: "Pagado", className: "bg-green-100 text-green-900 dark:bg-green-950 dark:text-green-200" },
};

export async function generateMetadata({ params }: PageProps<"/medios/[id]">): Promise<Metadata> {
  const user = await requireAccount();
  const { id } = await params;
  const sources = await listPaymentSources(user.id);
  return { title: `${sources.find((s) => s.id === id)?.name ?? "Tarjeta"} · Salt` };
}

export default async function CardPage({ params, searchParams }: PageProps<"/medios/[id]">) {
  const user = await requireAccount();
  const { id } = await params;
  const query = await searchParams;

  const sources = await listPaymentSources(user.id);
  const source = sources.find((s) => s.id === id);
  // Solo tarjetas propias: si el id es de otra cuenta (o es una billetera), es como si no existiera
  if (!source || source.kind !== "CARD") notFound();

  const back = (
    <Link href="/medios" className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <ChevronLeftIcon className="size-4" />
      Tarjetas
    </Link>
  );
  const header = (
    <div className="flex items-center gap-3">
      <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold">{source.name}</h1>
      <Editable>
        <PaymentSourceDialog source={source} />
      </Editable>
    </div>
  );

  const current = await currentStatementMonth(user.id, id);
  if (!current) {
    return (
      <div className="flex flex-col gap-4 py-2">
        {back}
        {header}
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Para ver el resumen, poné el día de cierre y el de vencimiento de la tarjeta con el lápiz de arriba.
          </CardContent>
        </Card>
      </div>
    );
  }

  const asked = typeof query.resumen === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(query.resumen) ? query.resumen : null;
  const defaultMonth = (await statementToShow(user.id, id)) ?? current;
  const month = asked ?? defaultMonth;
  const [statement, categories] = await Promise.all([getStatement(user.id, id, month), listCategories(user.id)]);
  if (!statement?.configured) notFound();
  // Compras en cuotas: en qué cuota va cada una en este resumen y cuánto queda
  const cuotas = await installmentPurchases(user.id, id, statement.from, statement.closing);
  // Mirando el resumen a pagar, las compras nuevas van al abierto: lo mostramos en una línea
  const open = statement.status === "a pagar" && month !== current ? await getStatement(user.id, id, current) : null;
  const today = todayISO();

  const categoryOptions = categories.map(({ id, name, emoji, icon }) => ({ id, name, emoji, icon }));
  const href = (m: string) => `/medios/${id}?resumen=${m}`;
  const status = STATUS[statement.status];
  const monthName = formatMonth(month).toLowerCase();

  return (
    <div className="flex flex-col gap-4 py-2">
      {back}
      {header}

      {/* Qué resumen se ve: flechas para ir a los anteriores y a los que vienen */}
      <div className="flex items-center gap-1">
        <Link href={href(shiftMonth(month, -1))} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Resumen anterior">
          <ChevronLeftIcon />
        </Link>
        <span className="min-w-44 text-center font-medium">Resumen de {monthName}</span>
        <Link href={href(shiftMonth(month, 1))} className={buttonVariants({ variant: "outline", size: "icon" })} aria-label="Resumen siguiente">
          <ChevronRightIcon />
        </Link>
        {month !== defaultMonth && (
          <Link href={`/medios/${id}`} className="ml-2 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground">
            Volver al actual
          </Link>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {formatMoney(statement.total, "ARS")}
            <Badge variant={statement.status === "abierto" ? "secondary" : "outline"} className={cn("font-normal", status.className)}>
              {status.label}
            </Badge>
          </CardTitle>
          <CardDescription>
            Del {shortDate(statement.from)} al {shortDate(statement.closing)} · vence el {shortDate(statement.due)}
            {statement.corrected && " · fechas corregidas"}
            {statement.payment && ` · pagado el ${shortDate(statement.payment.paidOn)}`}
          </CardDescription>
          <CardAction>
            <Editable>
              <StatementDatesDialog
                cardId={id}
                month={month}
                closing={statement.closing}
                due={statement.due}
                corrected={statement.corrected}
              />
            </Editable>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-muted-foreground">En pesos</span>
            <span className="font-medium tabular-nums">{formatMoney(statement.ars, "ARS")}</span>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-muted-foreground">En dólares</span>
            <span className="text-right">
              <span className="font-medium tabular-nums">{formatMoney(statement.usd, "USD")}</span>
              {statement.usd > 0 && (
                <span className="block text-xs text-muted-foreground">
                  {statement.payment?.usdPaidIn === "USD"
                    ? "Pagados en dólares"
                    : statement.rate && statement.usdInPesos !== null
                      ? `${statement.payment ? "=" : "≈"} ${formatMoney(statement.usdInPesos, "ARS")} al dólar ${
                          statement.payment ? "del pago" : statement.rate.estimated ? "oficial de hoy" : "oficial del vencimiento"
                        } (${formatMoney(statement.rate.sell, "ARS")})`
                      : "Sin cotización del dólar oficial: no se suma al total"}
                </span>
              )}
            </span>
          </div>
          {statement.usd > 0 && !statement.payment && (
            <p className="text-xs text-muted-foreground">
              El banco pasa los dólares a pesos con el dólar oficial del día en que pagás
              {statement.rate?.estimated ? ": el total es un estimado." : "."}
            </p>
          )}
          {statement.payment && (
            <div className="flex items-baseline justify-between gap-2 border-t pt-2">
              <span className="text-muted-foreground">Pagaste</span>
              <span className="font-medium tabular-nums">
                {[
                  statement.payment.totalArs > 0 || statement.payment.totalUsd === 0 ? formatMoney(statement.payment.totalArs, "ARS") : null,
                  statement.payment.totalUsd > 0 ? formatMoney(statement.payment.totalUsd, "USD") : null,
                ]
                  .filter(Boolean)
                  .join(" + ")}
              </span>
            </div>
          )}
          {/* Pagar: una vez que cerró. Pagado: se puede deshacer por si fue un error */}
          <Editable>
            {statement.status !== "abierto" && (
              <div className="flex justify-end gap-2 pt-1">
                {statement.payment ? (
                  <UnmarkPaidButton cardId={id} month={month} />
                ) : (
                  <MarkPaidDialog
                    cardId={id}
                    month={month}
                    closing={statement.closing}
                    ars={statement.ars}
                    usd={statement.usd}
                    rate={statement.rate?.sell ?? null}
                    today={today}
                  />
                )}
              </div>
            )}
          </Editable>
        </CardContent>
      </Card>

      {open?.configured && (
        <Link href={href(current)} className="group">
          <Card size="sm" className="transition-colors group-hover:bg-muted/50">
            <CardContent className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">Resumen abierto de {formatMonth(current).toLowerCase()}</div>
                <div className="text-sm text-muted-foreground">
                  Acá van las compras nuevas · cierra el {shortDate(open.closing)}
                </div>
              </div>
              <span className="font-medium tabular-nums">{formatMoney(open.total, "ARS")}</span>
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
            </CardContent>
          </Card>
        </Link>
      )}

      {cuotas.purchases.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Compras en cuotas</CardTitle>
            <CardDescription>
              En qué cuota va cada una en este resumen.
              {(cuotas.leftArs > 0 || cuotas.leftUsd > 0) &&
                ` Quedan ${[cuotas.leftArs > 0 && formatMoney(cuotas.leftArs, "ARS"), cuotas.leftUsd > 0 && formatMoney(cuotas.leftUsd, "USD")]
                  .filter(Boolean)
                  .join(" + ")} para los próximos resúmenes.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col divide-y">
            {cuotas.purchases.map((p, i) => (
              <div key={i} className="flex items-center gap-3 py-2">
                <CategoryIcon icon={p.category.icon} emoji={p.category.emoji} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{p.description ?? p.category.name}</div>
                  {/* Barrita de avance: cuántas cuotas van de cuántas */}
                  <div className="mt-1 h-1.5 max-w-48 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-foreground" style={{ width: `${(p.installment / p.installments) * 100}%` }} />
                  </div>
                </div>
                <div className="text-right text-sm">
                  <div className="font-medium tabular-nums">
                    Cuota {p.installment} de {p.installments}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">
                    {p.leftCount > 0
                      ? `Quedan ${p.leftCount} · ${formatMoney(p.leftAmount, p.currency)}`
                      : "Última cuota"}
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <h2 className="mt-2 text-lg font-semibold">Gastos del resumen</h2>
      <ExpensesView expenses={statement.expenses} categories={categoryOptions} sources={sources} today={today} />
    </div>
  );
}
