"use client";

import { useTransition } from "react";
import { PauseIcon, PlayIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { removeRecurring, toggleRecurring } from "@/lib/actions/recurring";
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

/** Pausar (deja de cargarse) o reanudar un gasto fijo */
export function PauseRecurringButton({ id, name, active }: { id: string; name: string; active: boolean }) {
  const [pending, startTransition] = useTransition();
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      disabled={pending}
      aria-label={active ? `Pausar ${name}` : `Reanudar ${name}`}
      title={active ? "Pausar" : "Reanudar"}
      onClick={() =>
        startTransition(async () => {
          const result = await toggleRecurring(id, !active);
          if (result?.ok) toast.success(result.message);
          else toast.error(result?.message ?? "No se pudo cambiar");
        })
      }
    >
      {active ? <PauseIcon /> : <PlayIcon />}
    </Button>
  );
}

export function DeleteRecurringButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Eliminar ${name}`} disabled={pending} />}>
        <Trash2Icon />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Deja de cargarse todos los meses. Los gastos que ya cargó no se borran. Si solo querés frenarlo un
            tiempo, pausalo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              startTransition(async () => {
                const result = await removeRecurring(id);
                if (result?.ok) toast.success(result.message);
                else toast.error(result?.message ?? "No se pudo eliminar");
              })
            }
          >
            Eliminar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
