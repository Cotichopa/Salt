"use client";

import { useState } from "react";
import { changePassword } from "@/lib/actions/auth";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";
import { RowAction, SettingRow } from "@/components/setting-row";
import { FormDialog } from "./form-dialog";

export function PasswordRow() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <SettingRow
        label="Contraseña"
        value="Si la cambiás, se cierran tus otras sesiones y se borran tus huellas."
        action={<RowAction onClick={() => setOpen(true)}>Cambiar</RowAction>}
      />
      {open && (
        <FormDialog title="Cambiar contraseña" action={changePassword} onClose={() => setOpen(false)}>
          {(errors) => (
            <>
              <div className="flex flex-col gap-2">
                <Label htmlFor="current">Contraseña actual</Label>
                <Input id="current" name="current" type="password" autoComplete="current-password" required />
                <FieldError errors={errors?.current} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="next">Nueva contraseña</Label>
                <Input id="next" name="next" type="password" autoComplete="new-password" required />
                <FieldError errors={errors?.next} />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="confirm">Repetir nueva contraseña</Label>
                <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
                <FieldError errors={errors?.confirm} />
              </div>
            </>
          )}
        </FormDialog>
      )}
    </>
  );
}
