"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { createUser } from "@/lib/actions/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FieldError } from "@/components/field-error";

const roles = [
  { value: "MEMBER", label: "Miembro" },
  { value: "ADMIN", label: "Administrador" },
];

export function CreateUserForm() {
  const [state, action, pending] = useActionState(createUser, undefined);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      toast.success(state.message);
      formRef.current?.reset();
    }
  }, [state]);

  return (
    <form ref={formRef} action={action} className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nombre</Label>
        <Input id="name" name="name" required />
        <FieldError errors={state?.errors?.name} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required />
        <FieldError errors={state?.errors?.email} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="phone">WhatsApp (opcional)</Label>
        <Input id="phone" name="phone" inputMode="tel" placeholder="5491122334455" />
        <FieldError errors={state?.errors?.phone} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Contraseña inicial</Label>
        <Input id="password" name="password" type="text" autoComplete="off" required />
        <FieldError errors={state?.errors?.password} />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Rol</Label>
        <Select name="role" items={roles} defaultValue="MEMBER">
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-end">
        <Button type="submit" disabled={pending} className="w-full sm:w-auto">
          {pending ? "Creando..." : "Crear cuenta"}
        </Button>
      </div>
    </form>
  );
}
