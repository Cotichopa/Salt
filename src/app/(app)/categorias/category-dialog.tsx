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
import {
  CATEGORY_ICON_KEYS,
  CATEGORY_ICONS,
  CategoryIcon,
  resolveCategoryIcon,
  type CategoryIconKey,
} from "@/components/category-icon";

type Category = { id: string; name: string; emoji: string | null; icon: string | null; keywords: string[] };

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
  const [icon, setIcon] = useState<CategoryIconKey>(category ? resolveCategoryIcon(category.icon, category.emoji) : "tag");

  return (
    <form action={action} className="flex flex-col gap-4">
      {category && <input type="hidden" name="id" value={category.id} />}
      <div className="flex items-end gap-3">
        <CategoryIcon icon={icon} size="lg" />
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="name">Nombre</Label>
          <Input id="name" name="name" placeholder="Café" defaultValue={category?.name ?? ""} autoFocus required />
        </div>
      </div>
      <FieldError errors={state?.errors?.name} />

      {/* Grilla de íconos: son "radio buttons" (se elige uno solo) disfrazados de botones */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Ícono</legend>
        <div className="grid max-h-44 grid-cols-7 gap-1.5 overflow-y-auto rounded-lg border p-2 sm:grid-cols-9">
          {CATEGORY_ICON_KEYS.map((key) => {
            const { Icon, label } = CATEGORY_ICONS[key];
            return (
              <label
                key={key}
                title={label}
                className="flex aspect-square cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground has-checked:bg-primary has-checked:text-primary-foreground has-focus-visible:ring-2 has-focus-visible:ring-ring"
              >
                <input
                  type="radio"
                  name="icon"
                  value={key}
                  checked={icon === key}
                  onChange={() => setIcon(key)}
                  className="sr-only"
                />
                <Icon className="size-4" strokeWidth={1.75} />
                <span className="sr-only">{label}</span>
              </label>
            );
          })}
        </div>
        <FieldError errors={state?.errors?.icon} />
      </fieldset>
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
