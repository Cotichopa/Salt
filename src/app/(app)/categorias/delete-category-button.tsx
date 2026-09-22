"use client";

import { useState, useTransition } from "react";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { removeCategory } from "@/lib/actions/categories";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

type Option = { id: string; name: string; emoji: string | null };

// Si la categoría tiene gastos, pide elegir a cuál moverlos antes de borrarla
export function DeleteCategoryButton({
  category,
  expenseCount,
  others,
}: {
  category: Option;
  expenseCount: number;
  others: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const items = others.map((o) => ({ value: o.id, label: `${o.emoji ?? ""} ${o.name}`.trim() }));

  function confirm() {
    startTransition(async () => {
      const result = await removeCategory(category.id, moveTo ?? undefined);
      if (result?.ok) {
        toast.success(result.message);
        setOpen(false);
      } else toast.error(result?.message ?? "No se pudo eliminar");
    });
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Eliminar categoría" />}>
        <Trash2Icon />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            ¿Eliminar {category.emoji} {category.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {expenseCount > 0
              ? `Tiene ${expenseCount} ${expenseCount === 1 ? "gasto" : "gastos"}. Elegí a qué categoría moverlos.`
              : "No tiene gastos cargados."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {expenseCount > 0 && (
          <div className="flex flex-col gap-2">
            <Label>Mover gastos a</Label>
            <Select items={items} value={moveTo} onValueChange={(v) => setMoveTo(v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Elegí una categoría" />
              </SelectTrigger>
              <SelectContent>
                {items.map((i) => (
                  <SelectItem key={i.value} value={i.value}>
                    {i.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={confirm}
            disabled={pending || (expenseCount > 0 && !moveTo)}
          >
            {pending ? "Eliminando..." : "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
