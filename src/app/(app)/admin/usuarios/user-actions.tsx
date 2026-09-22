"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { resetUserPassword, toggleUserActive } from "@/lib/actions/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/field-error";
import type { FormState } from "@/lib/validators";

// Botones por fila: activar/desactivar y poner una contraseña nueva
export function UserActions({ userId, active, isSelf }: { userId: string; active: boolean; isSelf: boolean }) {
  const [pending, startTransition] = useTransition();
  const [showReset, setShowReset] = useState(false);
  const [state, action, resetting] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await resetUserPassword(prev, formData);
    if (result?.ok) {
      toast.success(result.message);
      setShowReset(false);
    }
    return result;
  }, undefined);

  if (showReset) {
    return (
      <form action={action} className="flex flex-col items-end gap-1">
        <input type="hidden" name="userId" value={userId} />
        <div className="flex gap-2">
          <Input name="password" placeholder="Nueva contraseña" className="w-40" autoFocus required />
          <Button type="submit" size="sm" disabled={resetting}>
            Guardar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setShowReset(false)}>
            Cancelar
          </Button>
        </div>
        <FieldError errors={state?.errors?.password} />
      </form>
    );
  }

  return (
    <div className="flex justify-end gap-2">
      <Button size="sm" variant="outline" onClick={() => setShowReset(true)}>
        Cambiar contraseña
      </Button>
      {!isSelf && (
        <Button
          size="sm"
          variant={active ? "destructive" : "secondary"}
          disabled={pending}
          onClick={() => startTransition(() => toggleUserActive(userId))}
        >
          {active ? "Desactivar" : "Activar"}
        </Button>
      )}
    </div>
  );
}
