"use client";

import { useState } from "react";
import { PencilIcon, PlusIcon } from "lucide-react";
import type { ExpenseDTO } from "@/lib/services/expenses";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ExpenseForm, type CategoryOption } from "./expense-form";

// Ventana con el formulario. Sin `expense` muestra "Nuevo gasto"; con `expense`, un lápiz para editar.
export function ExpenseDialog({
  categories,
  expense,
  today,
}: {
  categories: CategoryOption[];
  expense?: ExpenseDTO;
  today: string;
}) {
  const [open, setOpen] = useState(false);

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
        <ExpenseForm categories={categories} expense={expense} today={today} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
