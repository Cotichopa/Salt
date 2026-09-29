"use client";

import { useState, useTransition } from "react";
import { PencilIcon } from "lucide-react";
import { toast } from "sonner";
import { changeMerchantCategory, removeMerchant } from "@/lib/actions/merchants";
import { formatCuit } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { CategoryIcon } from "@/components/category-icon";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type Option = { id: string; name: string; emoji: string | null; icon: string | null };

// Ventana para cambiar de categoría un comercio (sus próximos tickets van a la nueva) u olvidarlo

export function MerchantDialog({
  merchant,
  categoryId,
  categories,
}: {
  merchant: { id: string; cuit: string; name: string | null };
  categoryId: string;
  categories: Option[];
}) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(categoryId);
  const [pending, startTransition] = useTransition();
  const items = categories.map((c) => ({ value: c.id, label: c.name }));
  const title = merchant.name ?? `CUIT ${formatCuit(merchant.cuit)}`;

  function run(action: () => Promise<{ ok?: boolean; message?: string } | undefined>) {
    startTransition(async () => {
      const result = await action();
      if (result?.ok) {
        toast.success(result.message);
        setOpen(false);
      } else toast.error(result?.message ?? "No se pudo guardar");
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Editar ${title}`} />}>
        <PencilIcon />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            CUIT {formatCuit(merchant.cuit)}. Cuando le mandes a Chop un ticket de este comercio, viene con esta categoría.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label>Categoría</Label>
          <Select items={items} value={chosen} onValueChange={(v) => setChosen(v as string)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Elegí una categoría" />
            </SelectTrigger>
            <SelectContent>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <span className="flex items-center gap-2">
                    <CategoryIcon icon={c.icon} emoji={c.emoji} size="sm" />
                    {c.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
          <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => removeMerchant(merchant.id))}>
            Olvidar comercio
          </Button>
          <Button
            type="button"
            disabled={pending || !chosen || chosen === categoryId}
            onClick={() => chosen && run(() => changeMerchantCategory(merchant.id, chosen))}
          >
            {pending ? "Guardando..." : "Guardar"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
