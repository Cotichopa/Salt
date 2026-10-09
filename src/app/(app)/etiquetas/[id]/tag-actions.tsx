"use client";

import { useState, useTransition } from "react";
import { PencilIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { deleteTagAction, renameTagAction } from "@/lib/actions/tags";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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

// Cambiarle el nombre a una etiqueta, o borrarla (sus gastos quedan, sin ella)

export function RenameTagButton({ tag }: { tag: { id: string; name: string } }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(tag.name);
  const [pending, startTransition] = useTransition();

  function save(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await renameTagAction(tag.id, name);
      if (result?.ok) {
        toast.success(result.message);
        setOpen(false);
      } else toast.error(result?.message ?? "No se pudo guardar");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon" aria-label="Cambiar el nombre" />}>
        <PencilIcon />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cambiar el nombre</DialogTitle>
          <DialogDescription>Una sola palabra: letras, números, _ o -.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="tag-name">Nombre</Label>
            <Input id="tag-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={31} autoFocus />
          </div>
          <Button type="submit" disabled={pending || !name.trim()}>
            Guardar
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function DeleteTagButton({ tag, count }: { tag: { id: string; name: string }; count: number }) {
  const [pending, startTransition] = useTransition();

  function confirm() {
    startTransition(async () => {
      // Si sale bien, la acción lleva a /etiquetas (redirect): solo vuelve algo si hubo un error
      const result = await deleteTagAction(tag.id);
      if (result && !result.ok) toast.error(result.message ?? "No se pudo borrar");
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="icon" aria-label="Borrar la etiqueta" disabled={pending} />}>
        <Trash2Icon />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Borrar #{tag.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {count > 0
              ? `Los ${count === 1 ? "gasto" : `${count} gastos`} que la tienen no se borran: quedan sin esta etiqueta.`
              : "No tiene gastos."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirm}>
            Borrar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
