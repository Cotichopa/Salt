"use client";

import { useTransition } from "react";
import { CheckIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { clearServerErrors, markReviewed, removeDefaultCategory } from "@/lib/actions/superadmin";
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

/** Un mensaje que Chop no entendió: ya lo viste, se borra el texto */
export function ReviewedButton({ id }: { id: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="icon-sm"
      variant="ghost"
      aria-label="Marcar revisado"
      title="Revisado (se borra el texto)"
      disabled={pending}
      onClick={() => startTransition(() => markReviewed(id))}
    >
      <CheckIcon />
    </Button>
  );
}

export function ClearErrorsButton() {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await clearServerErrors();
          toast.success("Errores borrados");
        })
      }
    >
      <CheckIcon />
      Todos revisados
    </Button>
  );
}

export function DeleteDefaultCategoryButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Quitar ${name}`} disabled={pending} />}>
        <Trash2Icon />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Quitar {name} de las categorías iniciales?</AlertDialogTitle>
          <AlertDialogDescription>
            Las cuentas nuevas ya no la van a recibir. Las cuentas que ya existen no cambian.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              startTransition(async () => {
                const result = await removeDefaultCategory(id);
                if (result?.ok) toast.success(result.message);
                else toast.error(result?.message ?? "No se pudo quitar");
              })
            }
          >
            Quitar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
