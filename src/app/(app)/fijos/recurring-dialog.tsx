"use client";

import { useActionState, useState } from "react";
import { PencilIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { saveRecurring } from "@/lib/actions/recurring";
import {
  currencyLabels,
  dollarTypeFor,
  dollarTypeLabels,
  formatMonth,
  parseAmount,
  paymentMethodLabels,
  type CurrencyCode,
  type DollarTypeCode,
  type PaymentMethodCode,
} from "@/lib/format";
import type { RecurringDTO } from "@/lib/services/recurring";
import type { FormState } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldError } from "@/components/field-error";
import { CategoryIcon } from "@/components/category-icon";
import type { CategoryOption, SourceOption } from "../gastos/expense-form";

const currencies = Object.entries(currencyLabels).map(([value, label]) => ({ value, label }));
const paymentMethods = Object.entries(paymentMethodLabels).map(([value, label]) => ({ value, label }));
const dollarTypes = Object.entries(dollarTypeLabels).map(([value, label]) => ({ value, label }));

type Props = {
  categories: CategoryOption[];
  sources: SourceOption[];
  recurring?: RecurringDTO; // si viene, es edición
  today: string;
};

// Ventana con el formulario. Sin `recurring` muestra "Nuevo fijo"; con `recurring`, un lápiz.
export function RecurringDialog(props: Props) {
  const [open, setOpen] = useState(false);
  const { recurring } = props;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {recurring ? (
        <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Editar ${recurring.description}`} />}>
          <PencilIcon />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button />}>
          <PlusIcon />
          Nuevo fijo
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{recurring ? "Editar gasto fijo" : "Nuevo gasto fijo"}</DialogTitle>
          <DialogDescription>Se carga solo todos los meses, el día que elijas.</DialogDescription>
        </DialogHeader>
        {/* key: si al guardar llegan los datos nuevos mientras la ventana se cierra, React arma un
            formulario nuevo en vez de cambiarle el valor inicial a los campos (Base UI no lo permite) */}
        <RecurringForm key={recurring ? JSON.stringify(recurring) : "nuevo"} {...props} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function RecurringForm({ categories, sources, recurring, today, onDone }: Props & { onDone: () => void }) {
  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await saveRecurring(prev, formData);
    if (result?.ok) {
      toast.success(result.message);
      onDone();
    }
    return result;
  }, undefined);

  const [method, setMethod] = useState<PaymentMethodCode>(recurring?.paymentMethod ?? "DEBIT");
  const [currency, setCurrency] = useState<CurrencyCode>(recurring?.currency ?? "ARS");
  // Con crédito siempre es el oficial; con los demás medios, el que elijas
  const [chosenDollar, setChosenDollar] = useState<DollarTypeCode>(
    recurring?.dollarType && recurring.paymentMethod !== "CREDIT" ? recurring.dollarType : "MEP",
  );
  const dollarType = dollarTypeFor(method, chosenDollar);
  const [amount, setAmount] = useState(recurring ? String(recurring.amount).replace(".", ",") : "");
  const [day, setDay] = useState(recurring ? String(recurring.day) : "");

  const kind = method === "TRANSFER" ? "WALLET" : method === "CASH" ? null : "CARD";
  const sourceOptions = sources.filter((s) => s.kind === kind).map((s) => ({ value: s.id, label: s.name }));
  const categoryItems = categories.map((c) => ({ value: c.id, label: c.name }));
  const errors = state?.errors;

  // Al crearlo: si el día de este mes ya pasó, preguntamos siempre si cargar también el de este mes
  const dayNumber = Number(day);
  const dayPassed = !recurring && Number.isInteger(dayNumber) && dayNumber >= 1 && dayNumber <= Number(today.slice(8, 10));
  // Al editar: si cambió el monto (en la misma moneda), preguntamos desde cuándo vale
  const amountChanged =
    !!recurring && currency === recurring.currency && parseAmount(amount) !== null && parseAmount(amount) !== recurring.amount;
  const thisMonth = formatMonth(today.slice(0, 7)).replace(/ de \d+$/, "").toLowerCase();

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {recurring && <input type="hidden" name="id" value={recurring.id} />}

      <div className="flex flex-col gap-2 sm:col-span-2">
        <Label htmlFor="description">Nombre</Label>
        <Input
          id="description"
          name="description"
          placeholder="Netflix, alquiler, gimnasio..."
          defaultValue={recurring?.description ?? ""}
          autoFocus
          required
        />
        <FieldError errors={errors?.description} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="amount">Monto por mes</Label>
        <Input
          id="amount"
          name="amount"
          inputMode="decimal"
          placeholder="15.000"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
        <FieldError errors={errors?.amount} />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Moneda</Label>
        <Select name="currency" items={currencies} value={currency} onValueChange={(v) => setCurrency(v as CurrencyCode)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {currencies.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Monto cambiado: ¿se corrige también el gasto de este mes? */}
      {amountChanged && (
        <fieldset className="flex flex-col gap-2 rounded-lg border p-3 sm:col-span-2">
          <legend className="px-1 text-sm font-medium">¿Desde cuándo vale el monto nuevo?</legend>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="from" value="this" defaultChecked className="mt-0.5 accent-primary" />
            <span>
              Desde este mes
              <span className="block text-muted-foreground">
                {recurring.loadedThisMonth
                  ? `También corrijo el gasto de ${thisMonth} que ya se cargó.`
                  : `El de ${thisMonth} se carga con el monto nuevo.`}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="from" value="next" className="mt-0.5 accent-primary" />
            <span>
              Desde el próximo
              <span className="block text-muted-foreground">
                {recurring.loadedThisMonth
                  ? `El gasto de ${thisMonth} queda como está.`
                  : `El de ${thisMonth} se carga con el monto de antes.`}
              </span>
            </span>
          </label>
        </fieldset>
      )}

      {/* Dólares: a qué dólar se paga (con crédito, siempre el oficial). La cotización es la del
          día en que se carga cada mes. */}
      {currency === "USD" &&
        (method === "CREDIT" ? (
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label>Dólar</Label>
            <p className="rounded-lg border px-3 py-2 text-sm text-muted-foreground">
              Con crédito es el <span className="font-medium text-foreground">dólar oficial</span>: el banco te lo
              cobra al oficial del día en que pagás el resumen.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:col-span-2">
            <Label>¿A qué dólar lo pagás?</Label>
            <Select
              name="dollarType"
              items={dollarTypes}
              value={dollarType}
              onValueChange={(v) => setChosenDollar(v as DollarTypeCode)}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {dollarTypes.map((d) => (
                  <SelectItem key={d.value} value={d.value}>
                    {d.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-sm text-muted-foreground">Cada mes se pasa a pesos con la cotización de ese día.</p>
            <FieldError errors={errors?.dollarType} />
          </div>
        ))}

      <div className="flex flex-col gap-2">
        <Label>Categoría</Label>
        <Select name="categoryId" items={categoryItems} defaultValue={recurring?.category.id ?? null}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Elegí una categoría" />
          </SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                <span className="flex items-center gap-2">
                  <CategoryIcon icon={c.icon} emoji={c.emoji} size="sm" />
                  {c.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError errors={errors?.categoryId} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="day">Día del mes</Label>
        <Input
          id="day"
          name="day"
          type="number"
          min={1}
          max={31}
          placeholder="10"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          required
        />
        {dayNumber > 28 && dayNumber <= 31 && (
          <p className="text-sm text-muted-foreground">En los meses más cortos, el último día.</p>
        )}
        <FieldError errors={errors?.day} />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Medio de pago</Label>
        <Select name="paymentMethod" items={paymentMethods} value={method} onValueChange={(v) => setMethod(v as PaymentMethodCode)}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {paymentMethods.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Tarjeta o billetera, según el medio de pago. El efectivo no lleva. */}
      {kind && (
        <div className="flex flex-col gap-2">
          <Label>{kind === "CARD" ? "Tarjeta" : "Billetera"} (opcional)</Label>
          <Select
            name="paymentSourceId"
            items={sourceOptions}
            defaultValue={recurring?.paymentSource?.id ?? null}
            key={kind} // al cambiar de tarjeta a billetera, se limpia la elección anterior
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="¿Con cuál?" />
            </SelectTrigger>
            <SelectContent>
              {sourceOptions.map((s) => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldError errors={errors?.paymentSourceId} />
        </div>
      )}

      {dayPassed && (
        <fieldset className="flex flex-col gap-2 rounded-lg border p-3 sm:col-span-2">
          <legend className="px-1 text-sm font-medium">El día {dayNumber} de {thisMonth} ya pasó: ¿lo cargo?</legend>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="loadThisMonth" value="yes" required className="mt-0.5 accent-primary" />
            <span>
              Sí, cargar el de {thisMonth}
              <span className="block text-muted-foreground">Queda con fecha del día {dayNumber}.</span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input type="radio" name="loadThisMonth" value="no" className="mt-0.5 accent-primary" />
            <span>No, empezar el mes que viene</span>
          </label>
        </fieldset>
      )}

      {state?.message && !state.ok && <p className="text-sm text-destructive sm:col-span-2">{state.message}</p>}

      <Button type="submit" disabled={pending} className="sm:col-span-2" size="lg">
        {pending ? "Guardando..." : recurring ? "Guardar cambios" : "Agregar gasto fijo"}
      </Button>
    </form>
  );
}
