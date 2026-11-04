"use client";

import { useState } from "react";

// Lo que comparten la ficha de una cuenta y "Nueva cuenta": los datos que llegan de la página y los
// campos para elegir el rol y cómo entra la persona.

export type InviteState = "none" | "pending" | "expired";

export type Account = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  phoneLabel: string | null;
  role: "ADMIN" | "MEMBER"; // el rol que se puede elegir; el superadmin no se da desde acá
  roleLabel: string;
  active: boolean;
  invite: InviteState;
  lastUse: string;
  // Contraseñas mal en los últimos 15 minutos. Solo le llega al superadmin; sin problemas, null
  login: { text: string; serious: boolean } | null;
  access: string;
  expenses: number;
  isSelf: boolean;
  // Solo para que la pantalla no muestre de más: la traba de verdad está en las acciones
  canManage: boolean;
  canView: boolean;
  canChangeRole: boolean;
  canInvite: boolean;
  canWelcome: boolean;
  canToggle: boolean;
  canDelete: boolean;
  canUnlock: boolean;
  canCloseSessions: boolean;
};

const ROLES = [
  { value: "MEMBER", label: "Miembro", help: "Usa la app y a Chop con sus propios gastos." },
  { value: "ADMIN", label: "Administrador", help: "Además, puede crear cuentas y cambiar sus datos y contraseñas." },
] as const;

export function RoleChoice({ defaultValue = "MEMBER" }: { defaultValue?: "ADMIN" | "MEMBER" }) {
  const [role, setRole] = useState<"ADMIN" | "MEMBER">(defaultValue);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm leading-none font-medium">Rol</legend>
      <div className="flex rounded-lg bg-muted p-0.5">
        {ROLES.map((r) => (
          <label
            key={r.value}
            className="flex-1 cursor-pointer rounded-md py-1.5 text-center text-sm font-medium text-muted-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-2 has-focus-visible:ring-ring/50"
          >
            <input
              type="radio"
              name="role"
              value={r.value}
              checked={role === r.value}
              onChange={() => setRole(r.value)}
              className="sr-only"
            />
            {r.label}
          </label>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{ROLES.find((r) => r.value === role)?.help}</p>
    </fieldset>
  );
}

export type AccessMethod = "link" | "password";

/** Las dos formas de tener contraseña: un link por mail para que la elija, o una que le ponemos */
export function MethodChoice({
  value,
  onChange,
  options,
}: {
  value: AccessMethod;
  onChange: (value: AccessMethod) => void;
  options: { value: AccessMethod; title: string; text: string }[];
}) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((o) => (
        <label
          key={o.value}
          className="flex cursor-pointer gap-2.5 rounded-lg border p-3 has-checked:border-primary has-checked:ring-1 has-checked:ring-primary has-focus-visible:ring-2 has-focus-visible:ring-ring/50"
        >
          <input
            type="radio"
            name="method"
            value={o.value}
            checked={value === o.value}
            onChange={() => onChange(o.value)}
            className="mt-0.5 size-4 shrink-0 accent-primary"
          />
          <span className="text-sm">
            <span className="block font-medium">{o.title}</span>
            <span className="block text-muted-foreground">{o.text}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
