"use client";

import { useActionState, useState } from "react";
import { PencilIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";
import { savePaymentSource } from "@/lib/actions/payment-sources";
import type { FormState } from "@/lib/validators";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldError } from "@/components/field-error";

type Source = { id: string; name: string; kind: "CARD" | "WALLET"; closingDay: number | null; dueDay: number | null };

const kinds = [
  { value: "CARD", label: "Tarjeta" },
  { value: "WALLET", label: "Billetera o banco" },
];

export function PaymentSourceDialog({ source }: { source?: Source }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {source ? (
        <DialogTrigger render={<Button variant="ghost" size="icon-sm" aria-label={`Editar ${source.name}`} />}>
          <PencilIcon />
        </DialogTrigger>
      ) : (
        <DialogTrigger render={<Button />}>
          <PlusIcon />
          Agregar
        </DialogTrigger>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{source ? "Editar" : "Nueva tarjeta o billetera"}</DialogTitle>
          <DialogDescription>
            Las tarjetas aparecen cuando pagás con débito o crédito; las billeteras, cuando transferís.
          </DialogDescription>
        </DialogHeader>
        {/* key: si al guardar llegan los datos nuevos mientras la ventana se cierra, React arma un
            formulario nuevo en vez de cambiarle el valor inicial a los campos (Base UI no lo permite) */}
        <SourceForm
          key={source ? `${source.name}|${source.kind}|${source.closingDay}|${source.dueDay}` : "nueva"}
          source={source}
          onDone={() => setOpen(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function SourceForm({ source, onDone }: { source?: Source; onDone: () => void }) {
  const [state, action, pending] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await savePaymentSource(prev, formData);
    if (result?.ok) {
      toast.success(result.message);
      onDone();
    }
    return result;
  }, undefined);
  const [kind, setKind] = useState(source?.kind ?? "CARD");

  return (
    <form action={action} className="flex flex-col gap-4">
      {source && <input type="hidden" name="id" value={source.id} />}
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" placeholder="Visa Galicia" defaultValue={source?.name ?? ""} autoFocus required />
        <FieldError errors={state?.errors?.name} />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Tipo</Label>
        <Select name="kind" items={kinds} value={kind} onValueChange={(v) => setKind(v as "CARD" | "WALLET")}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {kinds.map((k) => (
              <SelectItem key={k.value} value={k.value}>
                {k.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {/* Solo tarjetas: con estos dos días se arma el resumen de cada mes (si pagás con crédito) */}
      {kind === "CARD" && (
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="closingDay">Día de cierre</Label>
              <Input
                id="closingDay"
                name="closingDay"
                type="number"
                min={1}
                max={31}
                placeholder="25"
                defaultValue={source?.closingDay ?? ""}
              />
              <FieldError errors={state?.errors?.closingDay} />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dueDay">Día de vencimiento</Label>
              <Input id="dueDay" name="dueDay" type="number" min={1} max={31} placeholder="7" defaultValue={source?.dueDay ?? ""} />
              <FieldError errors={state?.errors?.dueDay} />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            Opcional. Sirve para ver el resumen de la tarjeta de crédito. Si el banco mueve las fechas un mes, las
            corregís en ese resumen.
          </p>
        </div>
      )}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando..." : source ? "Guardar cambios" : "Agregar"}
      </Button>
    </form>
  );
}
