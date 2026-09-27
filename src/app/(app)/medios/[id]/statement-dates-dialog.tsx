"use client";

import { useActionState, useState, useTransition } from "react";
import { CalendarIcon } from "lucide-react";
import { toast } from "sonner";
import { resetStatementDatesAction, saveStatementDates } from "@/lib/actions/card-statements";
import type { FormState } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldError } from "@/components/field-error";

// Ventana para corregir el cierre y el vencimiento de UN resumen (cuando el banco los mueve).
// Los demás resúmenes siguen usando el día fijo de la tarjeta.

type Props = { cardId: string; month: string; closing: string; due: string; corrected: boolean };

export function StatementDatesDialog({ cardId, month, closing, due, corrected }: Props) {
  const [open, setOpen] = useState(false);
  const [resetting, startReset] = useTransition();

  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await saveStatementDates(prev, formData);
    if (result?.ok) {
      toast.success(result.message);
      setOpen(false);
    }
    return result;
  }, undefined);

  function reset() {
    startReset(async () => {
      const result = await resetStatementDatesAction(cardId, month);
      if (result?.ok) {
        toast.success(result.message);
        setOpen(false);
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline" size="sm" />}>
        <CalendarIcon />
        Cambiar fechas
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Fechas de este resumen</DialogTitle>
          <DialogDescription>
            Si el banco movió el cierre o el vencimiento, corregilos acá. Solo cambia este resumen: los demás siguen con
            los días de siempre.
          </DialogDescription>
        </DialogHeader>
        {/* key: formulario nuevo si cambian las fechas (Base UI no deja cambiar el valor inicial) */}
        <form key={`${closing}|${due}`} action={action} className="flex flex-col gap-4">
          <input type="hidden" name="cardId" value={cardId} />
          <input type="hidden" name="month" value={month} />
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="closingDate">Cierre</Label>
              <Input id="closingDate" name="closingDate" type="date" defaultValue={closing} required />
              <FieldError errors={state?.errors?.closingDate} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dueDate">Vencimiento</Label>
              <Input id="dueDate" name="dueDate" type="date" defaultValue={due} required />
              <FieldError errors={state?.errors?.dueDate} />
            </div>
          </div>
          {state?.message && !state.ok && <p className="text-sm text-destructive">{state.message}</p>}
          <Button type="submit" disabled={pending || resetting}>
            {pending ? "Guardando..." : "Guardar fechas"}
          </Button>
          {corrected && (
            <Button type="button" variant="ghost" onClick={reset} disabled={pending || resetting}>
              {resetting ? "Volviendo..." : "Volver a los días de siempre"}
            </Button>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
