"use client";

import { useTransition } from "react";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { removeExpense } from "@/lib/actions/expenses";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export function DeleteExpenseButton({
  id,
  summary,
  installments = 1,
  onDeleted,
}: {
  id: string;
  summary: string;
  installments?: number;
  onDeleted?: () => void;
}) {
  const [pending, startTransition] = useTransition();

  function confirm(scope: "one" | "purchase" = "one") {
    startTransition(async () => {
      const result = await removeExpense(id, scope);
      if (result?.ok) {
        toast.success(result.message);
        onDeleted?.();
      } else toast.error(result?.message ?? "No se pudo eliminar");
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="destructive" disabled={pending} />}>
        <Trash2Icon />
        Eliminar gasto
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar este gasto?</AlertDialogTitle>
          <AlertDialogDescription>
            {summary}.{" "}
            {installments > 1
              ? `Es parte de una compra en ${installments} cuotas.`
              : "Esta acción no se puede deshacer."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          {installments > 1 && (
            <AlertDialogAction variant="destructive" onClick={() => confirm("purchase")}>
              Las {installments} cuotas
            </AlertDialogAction>
          )}
          <AlertDialogAction variant="destructive" onClick={() => confirm("one")}>
            {installments > 1 ? "Solo esta cuota" : "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
