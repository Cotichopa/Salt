"use client";

import { useState } from "react";
import { saveName, saveOwnEmail, saveOwnPhone } from "@/lib/actions/preferences";
import { formatPhone } from "@/lib/format";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";
import { RowAction, SettingRow } from "@/components/setting-row";
import { FormDialog } from "./form-dialog";

// Perfil: nombre, email y WhatsApp. El email y el WhatsApp piden la contraseña: con el email se entra
// a Salt, y el número también sirve para usar Chop.

type Field = "name" | "email" | "phone";

function PasswordField({ errors }: { errors?: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="profile-password">Tu contraseña</Label>
      <Input id="profile-password" name="password" type="password" autoComplete="current-password" required />
      <FieldError errors={errors} />
    </div>
  );
}

export function ProfileRows({ name, email, phone }: { name: string; email: string; phone: string | null }) {
  const [open, setOpen] = useState<Field | null>(null);
  const close = () => setOpen(null);

  return (
    <>
      <SettingRow label="Nombre" value={name} help="Es como te saluda Chop." action={<RowAction onClick={() => setOpen("name")}>Cambiar</RowAction>} />
      <SettingRow label="Email" value={email} help="Con este entrás a Salt." action={<RowAction onClick={() => setOpen("email")}>Cambiar</RowAction>} />
      <SettingRow
        label="WhatsApp"
        value={phone ? formatPhone(phone) : "Sin cargar"}
        help="Con este número te reconoce Chop."
        action={<RowAction onClick={() => setOpen("phone")}>{phone ? "Cambiar" : "Agregar"}</RowAction>}
      />

      {open === "name" && (
        <FormDialog title="Tu nombre" action={saveName} onClose={close}>
          {(errors) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor="profile-name">Nombre</Label>
              <Input id="profile-name" name="name" defaultValue={name} autoComplete="nickname" required />
              <FieldError errors={errors?.name} />
            </div>
          )}
        </FormDialog>
      )}
      {open === "email" && (
        <FormDialog title="Tu email" description="Es con el que vas a entrar a Salt de acá en adelante." action={saveOwnEmail} onClose={close}>
          {(errors) => (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="profile-email">Email</Label>
                <Input id="profile-email" name="email" type="email" defaultValue={email} autoComplete="email" required />
                <FieldError errors={errors?.email} />
              </div>
              <PasswordField errors={errors?.password} />
            </>
          )}
        </FormDialog>
      )}
      {open === "phone" && (
        <FormDialog title="Tu WhatsApp" action={saveOwnPhone} onClose={close}>
          {(errors) => (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="profile-phone">Número</Label>
                <Input id="profile-phone" name="phone" type="tel" inputMode="tel" defaultValue={phone ?? ""} placeholder="5491122334455" />
                <FieldError errors={errors?.phone} />
                <p className="text-xs text-muted-foreground">Con código de país y de área, sin 0 ni 15 (ej: 54 9 11 2233-4455). Vacío = sin WhatsApp.</p>
              </div>
              <PasswordField errors={errors?.password} />
            </>
          )}
        </FormDialog>
      )}
    </>
  );
}
