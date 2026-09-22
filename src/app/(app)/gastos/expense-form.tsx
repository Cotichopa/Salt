"use client";

import { useActionState } from "react";
import { toast } from "sonner";
import { saveExpense } from "@/lib/actions/expenses";
import { currencyLabels, paymentMethodLabels } from "@/lib/format";
import type { ExpenseDTO } from "@/lib/services/expenses";
import type { FormState } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldError } from "@/components/field-error";

export type CategoryOption = { id: string; name: string; emoji: string | null };

const currencies = Object.entries(currencyLabels).map(([value, label]) => ({ value, label }));
const paymentMethods = Object.entries(paymentMethodLabels).map(([value, label]) => ({ value, label }));

type Props = {
  categories: CategoryOption[];
  expense?: ExpenseDTO; // si viene, es edición
  today: string;
  onDone: () => void;
};

export function ExpenseForm({ categories, expense, today, onDone }: Props) {
  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await saveExpense(prev, formData);
    if (result?.ok) {
      toast.success(result.message);
      onDone();
    }
    return result;
  }, undefined);

  const categoryItems = categories.map((c) => ({ value: c.id, label: `${c.emoji ?? ""} ${c.name}`.trim() }));
  const errors = state?.errors;

  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      {expense && <input type="hidden" name="id" value={expense.id} />}

      <div className="flex flex-col gap-2">
        <Label htmlFor="amount">Monto</Label>
        <Input
          id="amount"
          name="amount"
          inputMode="decimal"
          placeholder="15.000"
          defaultValue={expense ? String(expense.amount).replace(".", ",") : ""}
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
            {categoryItems.map((c) => (
              <SelectItem key={c.value} value={c.value}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError errors={errors?.categoryId} />
      </div>

      <div className="flex flex-col gap-2">
        <Label>Medio de pago</Label>
        <Select name="paymentMethod" items={paymentMethods} defaultValue={expense?.paymentMethod ?? "DEBIT"}>
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

      <div className="flex flex-col gap-2">
        <Label htmlFor="date">Fecha</Label>
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
