"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { saveName, saveOwnPhone } from "@/lib/actions/preferences";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";

/** El nombre: es el que usa Chop para saludar */
export function NameForm({ name }: { name: string }) {
  const [state, action, pending] = useActionState(saveName, undefined);

  useEffect(() => {
    if (state?.ok) toast.success(state.message);
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-2">
      <Label htmlFor="name">Nombre</Label>
      <div className="flex gap-2">
        <Input id="name" name="name" defaultValue={name} autoComplete="nickname" required />
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Guardando..." : "Guardar"}
        </Button>
      </div>
      <FieldError errors={state?.errors?.name} />
      <p className="text-xs text-muted-foreground">Es como te saluda Chop.</p>
    </form>
  );
}

/** El WhatsApp: pide la contraseña, porque el número también sirve para usar Chop */
export function PhoneForm({ phone }: { phone: string | null }) {
  const [state, action, pending] = useActionState(saveOwnPhone, undefined);
  const passwordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message);
      if (passwordRef.current) passwordRef.current.value = "";
    }
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">WhatsApp</Label>
        <Input id="phone" name="phone" type="tel" inputMode="tel" defaultValue={phone ?? ""} placeholder="5491122334455" />
        <FieldError errors={state?.errors?.phone} />
        <p className="text-xs text-muted-foreground">
          Con código de país y de área, sin 0 ni 15 (ej: 54 9 11 2233-4455). Vacío = sin WhatsApp.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone-password">Tu contraseña</Label>
        <Input ref={passwordRef} id="phone-password" name="password" type="password" autoComplete="current-password" required />
        <FieldError errors={state?.errors?.password} />
      </div>
      <Button type="submit" variant="outline" disabled={pending} className="self-start">
        {pending ? "Guardando..." : "Cambiar WhatsApp"}
      </Button>
    </form>
  );
}
