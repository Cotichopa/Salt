"use client";

import { useActionState, useState } from "react";
import { PencilIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { saveCategory } from "@/lib/actions/categories";
import type { FormState } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldError } from "@/components/field-error";

type Category = { id: string; name: string; emoji: string | null; keywords: string[] };

export function CategoryDialog({ category }: { category?: Category }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {category ? (
        <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label="Editar categoría" />}>
          <PencilIcon />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button />}>
          <PlusIcon />
          Nueva categoría
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? "Editar categoría" : "Nueva categoría"}</DialogTitle>
          <DialogDescription>
            Las palabras clave ayudan al bot de WhatsApp: si escribís &quot;cafe 2500&quot; y &quot;cafe&quot; es palabra clave de
            esta categoría, el gasto va acá.
          </DialogDescription>
        </DialogHeader>
        <CategoryForm category={category} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CategoryForm({ category, onDone }: { category?: Category; onDone: () => void }) {
  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await saveCategory(prev, formData);
    if (result?.ok) {
      toast.success(result.message);
      onDone();
    }
    return result;
  }, undefined);

  return (
    <form action={action} className="flex flex-col gap-4">
      {category && <input type="hidden" name="id" value={category.id} />}
      <div className="grid grid-cols-[5rem_1fr] gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="emoji">Emoji</Label>
          <Input id="emoji" name="emoji" placeholder="☕" defaultValue={category?.emoji ?? ""} className="text-center" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" name="name" placeholder="Café" defaultValue={category?.name ?? ""} autoFocus required />
        </div>
      </div>
      <FieldError errors={state?.errors?.emoji ?? state?.errors?.name} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="keywords">Palabras clave (separadas por coma)</Label>
        <Input
          id="keywords"
          name="keywords"
          placeholder="cafe, starbucks, havanna, medialunas"
          defaultValue={category?.keywords.join(", ") ?? ""}
        />
        <FieldError errors={state?.errors?.keywords} />
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando..." : category ? "Guardar cambios" : "Crear categoría"}
      </Button>
    </form>
  );
}
