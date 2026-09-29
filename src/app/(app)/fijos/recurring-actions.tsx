"use client";

import { useState, useTransition } from "react";
import { PauseIcon, PlayIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { formatMonthList } from "@/lib/format";
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

/**
 * Pausar (deja de cargarse) o reanudar un gasto fijo. Si al reanudar hay meses que llegaron a su
 * día mientras estaba pausado, pregunta si cargarlos.
 */
export function PauseRecurringButton({
  id,
  name,
  active,
  pausedMonths,
}: {
  id: string;
  name: string;
  active: boolean;
  pausedMonths: string[];
}) {
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const toggle = (loadPaused = false) =>
    startTransition(async () => {
      setOpen(false);
      const result = await toggleRecurring(id, !active, loadPaused);
      if (result?.ok) toast.success(result.message);
      else toast.error(result?.message ?? "No se pudo cambiar");
    });
  const label = active ? `Pausar ${name}` : `Reanudar ${name}`;

  if (active || pausedMonths.length === 0) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        aria-label={label}
        title={active ? "Pausar" : "Reanudar"}
        onClick={() => toggle()}
      >
        {active ? <PauseIcon /> : <PlayIcon />}
      </Button>
    );
  }

  const months = formatMonthList(pausedMonths);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={label} title="Reanudar" disabled={pending} />}
      >
        <PlayIcon />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Reanudar {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Estuvo pausado en {months}. ¿Cargo {pausedMonths.length === 1 ? "ese mes" : "esos meses"} también?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction variant="outline" onClick={() => toggle(false)}>
            Solo reanudar
          </AlertDialogAction>
          <AlertDialogAction onClick={() => toggle(true)}>Reanudar y cargar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
