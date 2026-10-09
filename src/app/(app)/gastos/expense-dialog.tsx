"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PencilIcon, PlusIcon } from "lucide-react";
import type { ExpenseDTO } from "@/lib/services/expenses";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ExpenseForm, type CategoryOption, type SourceOption } from "./expense-form";
import { NEW_EXPENSE_EVENT } from "@/components/keyboard-shortcuts";

// Ventana con el formulario. Sin `expense` muestra "Nuevo gasto"; con `expense`, un lápiz para editar.
export function ExpenseDialog({
  categories,
  sources,
  expense,
  today,
}: {
  categories: CategoryOption[];
  sources: SourceOption[];
  expense?: ExpenseDTO;
  today: string;
}) {
  // Atajo N (components/keyboard-shortcuts.tsx): desde otra pantalla llega con ?nuevo=1 y abre de entrada;
  // estando en Gastos, avisa con un evento
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(!expense && params.get("nuevo") === "1");

  useEffect(() => {
    if (expense) return;
    const openNew = () => setOpen(true);
    window.addEventListener(NEW_EXPENSE_EVENT, openNew);
    return () => window.removeEventListener(NEW_EXPENSE_EVENT, openNew);
  }, [expense]);

  // Sacar el ?nuevo=1 de la dirección, así al recargar no se vuelve a abrir
  useEffect(() => {
    if (expense || params.get("nuevo") !== "1") return;
    const next = new URLSearchParams(params);
    next.delete("nuevo");
    router.replace(next.size > 0 ? `${pathname}?${next}` : pathname);
  }, [expense, params, pathname, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {expense ? (
        <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Editar gasto" />}>
          <PencilIcon />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button />}>
          <PlusIcon />
          Nuevo gasto
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{expense ? "Editar gasto" : "Nuevo gasto"}</DialogTitle>
        </DialogHeader>
        <ExpenseForm categories={categories} sources={sources} expense={expense} today={today} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
