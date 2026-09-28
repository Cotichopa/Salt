import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { formatMoney, formatMonth, paymentMethodLabels, todayISO } from "@/lib/format";
import { listCategories } from "@/lib/services/categories";
import { listPaymentSources } from "@/lib/services/payment-sources";
import { listRecurring, loadDueRecurring, type RecurringDTO } from "@/lib/services/recurring";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CategoryIcon } from "@/components/category-icon";
import { RecurringNotice } from "@/components/recurring-notice";
import { RecurringDialog } from "./recurring-dialog";
import { DeleteRecurringButton, PauseRecurringButton } from "./recurring-actions";

export const metadata: Metadata = { title: "Gastos fijos · Salt" };

const shortDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const monthName = (month: string) => formatMonth(month).replace(/ de \d+$/, "").toLowerCase();

/** Línea de detalle: día · medio · tarjeta · categoría */
function detailLine(r: RecurringDTO) {
  return [`Día ${r.day}`, paymentMethodLabels[r.paymentMethod], r.paymentSource?.name, r.category.name]
    .filter(Boolean)
    .join(" · ");
}

export default async function RecurringPage() {
  const user = await requireUser();
  const today = todayISO();
  // Si alguno ya llegó a su día, se carga antes de mostrar la lista
  const loaded = await loadDueRecurring(user.id, today);
  const [recurring, categories, sources] = await Promise.all([
    listRecurring(user.id, today),
    listCategories(user.id),
    listPaymentSources(user.id),
  ]);
  const categoryOptions = categories.map(({ id, name, emoji, icon }) => ({ id, name, emoji, icon }));

  // Cuánto suman por mes los que están activos (pesos y dólares por separado)
  const active = recurring.filter((r) => r.active);
  const totalArs = active.filter((r) => r.currency === "ARS").reduce((acc, r) => acc + r.amount, 0);
  const totalUsd = active.filter((r) => r.currency === "USD").reduce((acc, r) => acc + r.amount, 0);

  return (
    <div className="flex flex-col gap-4 py-2">
      <RecurringNotice items={loaded} />
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Gastos fijos</h1>
        <RecurringDialog categories={categoryOptions} sources={sources} today={today} />
      </div>
      <p className="text-sm text-muted-foreground">
        Se cargan solos todos los meses, el día que elijas, cuando abrís Inicio o Gastos.
        {active.length > 0 && (
          <>
            {" "}
            Suman{" "}
            <span className="font-medium text-foreground">
              {[totalArs > 0 && formatMoney(totalArs, "ARS"), totalUsd > 0 && formatMoney(totalUsd, "USD")]
                .filter(Boolean)
                .join(" + ")}
            </span>{" "}
            por mes.
          </>
        )}
      </p>

      <Card>
        <CardContent className="flex flex-col divide-y">
          {recurring.length === 0 && (
            <p className="py-6 text-center text-muted-foreground">
              Todavía no tenés gastos fijos. Agregá el alquiler, los servicios o las suscripciones y no los cargues
              más a mano.
            </p>
          )}
          {recurring.map((r) => (
            <div key={r.id} className="flex items-center gap-3 py-2">
              <CategoryIcon icon={r.category.icon} emoji={r.category.emoji} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium">{r.description}</span>
                  {!r.active && <Badge variant="secondary">Pausado</Badge>}
                </div>
                <div className="truncate text-sm text-muted-foreground">{detailLine(r)}</div>
                {r.nextDate && (
                  <div className="text-sm text-muted-foreground">Próximo: {shortDate(r.nextDate)}</div>
                )}
              </div>
              <div className="text-right whitespace-nowrap tabular-nums">
                <div className={r.active ? "font-medium" : "font-medium text-muted-foreground"}>
                  {formatMoney(r.amount, r.currency)}
                </div>
                {r.nextAmount !== null && r.nextAmountFrom && (
                  <div className="text-xs text-muted-foreground">
                    {formatMoney(r.nextAmount, r.currency)} desde {monthName(r.nextAmountFrom)}
                  </div>
                )}
              </div>
              <div className="flex">
                <RecurringDialog categories={categoryOptions} sources={sources} recurring={r} today={today} />
                <PauseRecurringButton id={r.id} name={r.description} active={r.active} />
                <DeleteRecurringButton id={r.id} name={r.description} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
