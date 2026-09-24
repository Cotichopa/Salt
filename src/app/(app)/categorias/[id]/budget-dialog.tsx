"use client";

import { useActionState, useState, useTransition } from "react";
import { PencilIcon, TargetIcon } from "lucide-react";
import { toast } from "sonner";
import { deleteBudget, saveBudget } from "@/lib/actions/budgets";
import type { FormState } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldError } from "@/components/field-error";

// Ventana para poner, cambiar o quitar el presupuesto mensual de una categoría

export function BudgetDialog({
  categoryId,
  categoryName,
  amount,
}: {
  categoryId: string;
  categoryName: string;
  amount?: number; // si viene, ya tiene presupuesto y estamos editando
}) {
  const [open, setOpen] = useState(false);
  const [removing, startRemove] = useTransition();

  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await saveBudget(prev, formData);
    if (result?.ok) {
      toast.success(result.message);
      setOpen(false);
    }
    return result;
  }, undefined);

  function remove() {
    startRemove(async () => {
      const result = await deleteBudget(categoryId);
      if (result?.ok) {
        toast.success(result.message);
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {amount ? (
        <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Cambiar presupuesto" />}>
          <PencilIcon />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button variant="outline" />}>
          <TargetIcon />
          Poner presupuesto
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Presupuesto de {categoryName}</DialogTitle>
          <DialogDescription>
            Cuánto querés gastar como máximo por mes, en pesos. Te aviso (acá y por WhatsApp) cuando llegues al 80 % y
            cuando te pases.
          </DialogDescription>
        </DialogHeader>
        {/* key: si al guardar llega el monto nuevo mientras la ventana se cierra, React arma un
            formulario nuevo en vez de cambiarle el valor inicial al campo (Base UI no lo permite) */}
        <form key={amount ?? "nuevo"} action={action} className="flex flex-col gap-4">
          <input type="hidden" name="categoryId" value={categoryId} />
          <div className="flex flex-col gap-2">
            <Label htmlFor="budget-amount">Monto por mes</Label>
            <Input
              id="budget-amount"
              name="amount"
              inputMode="decimal"
              placeholder="150.000"
              defaultValue={amount ? String(amount).replace(".", ",") : ""}
              autoFocus
              required
            />
            <FieldError errors={state?.errors?.amount} />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            {amount ? (
              <Button type="button" variant="ghost" onClick={remove} disabled={removing || pending}>
                {removing ? "Quitando..." : "Quitar presupuesto"}
              </Button>
            ) : (
              <span />
            )}
            <Button type="submit" disabled={pending || removing}>
              {pending ? "Guardando..." : "Guardar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
