"use client";

import { useActionState, useState, useTransition } from "react";
import { toast } from "sonner";
import { resetUserPassword, toggleUserActive, updateUserPhone } from "@/lib/actions/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldError } from "@/components/field-error";
import type { FormState } from "@/lib/validators";

type Mode = "none" | "password" | "phone";

// Botones por fila: cambiar WhatsApp, poner una contraseña nueva y activar/desactivar
export function UserActions({
  userId,
  phone,
  active,
  isSelf,
}: {
  userId: string;
  phone: string | null;
  active: boolean;
  isSelf: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<Mode>("none");

  if (mode === "password") {
    return (
      <InlineForm
        action={resetUserPassword}
        userId={userId}
        field="password"
        placeholder="Nueva contraseña"
        onClose={() => setMode("none")}
      />
    );
  }
  if (mode === "phone") {
    return (
      <InlineForm
        action={updateUserPhone}
        userId={userId}
        field="phone"
        placeholder="5491122334455"
        defaultValue={phone ?? ""}
        required={false}
        onClose={() => setMode("none")}
      />
    );
  }

  return (
    <div className="flex flex-wrap justify-end gap-2">
      <Button size="sm" variant="outline" onClick={() => setMode("phone")}>
        WhatsApp
      </Button>
      <Button size="sm" variant="outline" onClick={() => setMode("password")}>
        Contraseña
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

// Formulario chiquito de un solo campo que reemplaza a los botones mientras se edita
function InlineForm({
  action,
  userId,
  field,
  placeholder,
  defaultValue,
  required = true,
  onClose,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  userId: string;
  field: string;
  placeholder: string;
  defaultValue?: string;
  required?: boolean;
  onClose: () => void;
}) {
  const [state, formAction, saving] = useActionState(async (prev: FormState, formData: FormData) => {
    const result = await action(prev, formData);
    if (result?.ok) {
      toast.success(result.message);
      onClose();
    }
    return result;
  }, undefined);

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="userId" value={userId} />
      <div className="flex gap-2">
        <Input
          name={field}
          placeholder={placeholder}
          defaultValue={defaultValue}
          className="w-40"
          autoFocus
          required={required}
        />
        <Button type="submit" size="sm" disabled={saving}>
          Guardar
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
      </div>
      <FieldError errors={state?.errors?.[field]} />
    </form>
  );
}
