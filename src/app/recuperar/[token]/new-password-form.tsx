"use client";

import { useActionState } from "react";
import { setNewPassword } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";

export function NewPasswordForm({ token }: { token: string }) {
  // Si sale bien, la acción lleva al login; si no, vuelve con los errores
  const [state, action, pending] = useActionState(setNewPassword, undefined);

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="token" value={token} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="next">Contraseña nueva</Label>
        <Input id="next" name="next" type="password" autoComplete="new-password" className="h-11" required />
        <FieldError errors={state?.errors?.next} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Repetir contraseña nueva</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" className="h-11" required />
        <FieldError errors={state?.errors?.confirm} />
      </div>
      {state?.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
        {pending ? "Guardando…" : "Guardar contraseña"}
      </Button>
    </form>
  );
}
