"use client";

import { useActionState, useState } from "react";
import { toast } from "sonner";
import { saveExpense } from "@/lib/actions/expenses";
import { currencyLabels, formatMoney, paymentMethodLabels, parseAmount, type PaymentMethodCode } from "@/lib/format";
import type { ExpenseDTO } from "@/lib/services/expenses";
import type { FormState } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldError } from "@/components/field-error";
import { CategoryIcon } from "@/components/category-icon";

export type CategoryOption = { id: string; name: string; emoji: string | null; icon: string | null };
export type SourceOption = { id: string; name: string; kind: "CARD" | "WALLET" };

const currencies = Object.entries(currencyLabels).map(([value, label]) => ({ value, label }));
const paymentMethods = Object.entries(paymentMethodLabels).map(([value, label]) => ({ value, label }));

type Props = {
  categories: CategoryOption[];
  sources: SourceOption[];
  expense?: ExpenseDTO; // si viene, es edición
  today: string;
  onDone: () => void;
};

export function ExpenseForm({ categories, sources, expense, today, onDone }: Props) {
  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await saveExpense(prev, formData);
    if (result?.ok) {
      toast.success(result.message);
      // Aviso de presupuesto: se queda más tiempo en pantalla para que se llegue a leer
      if (result.warning) toast.warning(result.warning, { duration: 8000 });
      onDone();
    }
    return result;
  }, undefined);

  // El medio de pago define si se pide tarjeta, billetera o nada, y si hay cuotas
  const [method, setMethod] = useState<PaymentMethodCode>(expense?.paymentMethod ?? "DEBIT");
  const [amount, setAmount] = useState(expense ? String(expense.amount).replace(".", ",") : "");
  const [installments, setInstallments] = useState("1");

  const kind = method === "TRANSFER" ? "WALLET" : method === "CASH" ? null : "CARD";
  const sourceOptions = sources.filter((s) => s.kind === kind).map((s) => ({ value: s.id, label: s.name }));
  const categoryItems = categories.map((c) => ({ value: c.id, label: c.name }));
  const errors = state?.errors;

  // Cuotas: mostramos cuánto queda cada una para que no haya sorpresas
  const installmentCount = Number(installments) || 1;
  const parsedAmount = parseAmount(amount);
  const perInstallment = parsedAmount && installmentCount > 1 ? parsedAmount / installmentCount : null;

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {expense && <input type="hidden" name="id" value={expense.id} />}

      <div className="flex flex-col gap-2">
        <Label htmlFor="amount">Monto {installmentCount > 1 && "total de la compra"}</Label>
        <Input
          id="amount"
          name="amount"
          inputMode="decimal"
          placeholder="15.000"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          autoFocus
          required
        />
        <FieldError errors={errors?.amount} />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Moneda</Label>
        <Select name="currency" items={currencies} defaultValue={expense?.currency ?? "ARS"}>
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

      <div className="flex flex-col gap-2">
        <Label>Categoría</Label>
        <Select name="categoryId" items={categoryItems} defaultValue={expense?.category.id ?? null}>
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
        <Label>Medio de pago</Label>
        <Select
          name="paymentMethod"
          items={paymentMethods}
          value={method}
          onValueChange={(v) => setMethod(v as PaymentMethodCode)}
        >
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
            defaultValue={expense?.paymentSource?.id ?? null}
            key={kind} // al cambiar de tarjeta a billetera, se limpia la elección anterior
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={kind === "CARD" ? "¿Con cuál?" : "¿Con cuál?"} />
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

      {/* Cuotas: solo para crédito y solo al cargar (al editar se cambia el movimiento suelto) */}
      {method === "CREDIT" && !expense && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="installments">Cuotas</Label>
          <Input
            id="installments"
            name="installments"
            type="number"
            min={1}
            max={36}
            value={installments}
            onChange={(e) => setInstallments(e.target.value)}
          />
          {perInstallment && (
            <p className="text-sm text-muted-foreground">
              {installmentCount} cuotas de {formatMoney(Math.round(perInstallment * 100) / 100, "ARS")}, una por mes
            </p>
          )}
          <FieldError errors={errors?.installments} />
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label htmlFor="date">Fecha {installmentCount > 1 && "de la compra"}</Label>
        <Input id="date" name="date" type="date" max={today} defaultValue={expense?.date ?? today} required />
        <FieldError errors={errors?.date} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="description">Descripción (opcional)</Label>
        <Input id="description" name="description" placeholder="Pizza con amigos" defaultValue={expense?.description ?? ""} />
        <FieldError errors={errors?.description} />
      </div>

      {state?.message && !state.ok && <p className="text-sm text-destructive sm:col-span-2">{state.message}</p>}

      <Button type="submit" disabled={pending} className="sm:col-span-2" size="lg">
        {pending ? "Guardando..." : expense ? "Guardar cambios" : "Cargar gasto"}
      </Button>
    </form>
  );
}
