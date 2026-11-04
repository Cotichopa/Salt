"use client";

import { startTransition, useActionState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { FormState } from "@/lib/validators";

type Errors = Record<string, string[] | undefined> | undefined;

/** Una ventana con un formulario: si sale bien, avisa y se cierra; si no, muestra los errores */
export function FormDialog({
  title,
  description,
  action,
  onClose,
  children,
}: {
  title: string;
  description?: string;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  onClose: () => void;
  children: (errors: Errors) => React.ReactNode;
}) {
  const [state, run, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result?.ok) {
      toast.success(result.message);
      onClose();
    }
    return result;
  }, undefined);

  // Con onSubmit (y no action={...}) React no vacía el formulario si un dato vuelve con error
  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    startTransition(() => run(data));
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          {children(state?.errors)}
          {state?.message && !state.ok && <p className="text-sm text-destructive">{state.message}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando..." : "Guardar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
