"use client";

import { useActionState } from "react";
import { forgotPassword } from "@/lib/actions/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPassword, undefined);

  // Mandado: en vez del formulario, el aviso (igual exista o no la cuenta)
  if (state?.ok) {
    return (
      <p role="status" className="rounded-lg border px-3 py-2 text-sm">
        📬 {state.message}
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" className="h-11" required />
        <FieldError errors={state?.errors?.email} />
      </div>
      {state?.message && (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      )}
      <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
        {pending ? "Mandando…" : "Mandarme el link"}
      </Button>
    </form>
  );
}
