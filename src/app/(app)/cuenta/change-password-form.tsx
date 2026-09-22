"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { changePassword } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message);
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="current">Contraseña actual</Label>
        <Input id="current" name="current" type="password" autoComplete="current-password" required />
        <FieldError errors={state?.errors?.current} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="next">Nueva contraseña</Label>
        <Input id="next" name="next" type="password" autoComplete="new-password" required />
        <FieldError errors={state?.errors?.next} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm">Repetir nueva contraseña</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
        <FieldError errors={state?.errors?.confirm} />
      </div>
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Guardando..." : "Cambiar contraseña"}
      </Button>
    </form>
  );
}
