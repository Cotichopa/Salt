"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { removeCategory } from "@/lib/actions/categories";
import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/components/category-icon";
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

type Option = { id: string; name: string; emoji: string | null; icon: string | null };

// Si la categoría tiene gastos, pide elegir qué hacer con ellos: moverlos a otra categoría
// o borrarlos junto con ella.
// Desde la pantalla de la categoría, al borrarla volvemos a la lista (redirectTo).
export function DeleteCategoryButton({
  category,
  expenseCount,
  others,
  redirectTo,
}: {
  category: Option;
  expenseCount: number;
  others: Option[];
  redirectTo?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"move" | "delete">("move");
  const [moveTo, setMoveTo] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const items = others.map((o) => ({ value: o.id, label: o.name }));

  function confirm() {
    startTransition(async () => {
      const result = await removeCategory(
        category.id,
        mode === "delete" ? { deleteExpenses: true } : { moveTo: moveTo ?? undefined },
      );
      if (result?.ok) {
        toast.success(result.message);
        setOpen(false);
        if (redirectTo) router.push(redirectTo);
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
            ¿Eliminar {category.name}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {expenseCount > 0
              ? `Tiene ${expenseCount} ${expenseCount === 1 ? "gasto" : "gastos"}. ¿Qué hacemos con ${expenseCount === 1 ? "él" : "ellos"}?`
              : "No tiene gastos cargados."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {expenseCount > 0 && (
          // Dos opciones excluyentes: "radio buttons" disfrazados de botones
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="radiogroup">
            {(
              [
                ["move", "Moverlos"],
                ["delete", "Borrarlos"],
              ] as const
            ).map(([value, text]) => (
              <label
                key={value}
                className="cursor-pointer rounded-md px-3 py-1.5 text-center text-sm text-muted-foreground has-checked:bg-background has-checked:font-medium has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-2 has-focus-visible:ring-ring"
              >
                <input
                  type="radio"
                  name="expenses-mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  className="sr-only"
                />
                {text}
              </label>
            ))}
          </div>
        )}
        {expenseCount > 0 && mode === "delete" && (
          <p className="text-sm text-destructive">
            Se van a borrar {expenseCount === 1 ? "el gasto" : `los ${expenseCount} gastos`} de {category.name}. No se
            puede deshacer.
          </p>
        )}
        {expenseCount > 0 && mode === "move" && (
          <div className="flex flex-col gap-2">
            <Label>Mover gastos a</Label>
            <Select items={items} value={moveTo} onValueChange={(v) => setMoveTo(v as string)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Elegí una categoría" />
              </SelectTrigger>
              <SelectContent>
                {others.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    <span className="flex items-center gap-2">
                      <CategoryIcon icon={o.icon} emoji={o.emoji} size="sm" />
                      {o.name}
                    </span>
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
            disabled={pending || (expenseCount > 0 && mode === "move" && !moveTo)}
          >
            {pending ? "Eliminando..." : "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
