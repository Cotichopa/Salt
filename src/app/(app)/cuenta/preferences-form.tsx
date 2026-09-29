"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { savePreferences } from "@/lib/actions/preferences";
import { currencyLabels, dollarTypeLabels, paymentMethodLabels } from "@/lib/format";
import { ACCENT_COLORS, HOME_PAGES } from "@/lib/preferences";
import type { Preferences } from "@/lib/services/preferences";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const itemsOf = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));

/** Un selector con su etiqueta y una ayuda abajo */
function Field({
  name,
  label,
  help,
  labels,
  value,
}: {
  name: string;
  label: string;
  help: string;
  labels: Record<string, string>;
  value: string;
}) {
  const items = itemsOf(labels);
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      <Select name={name} items={items} defaultValue={value}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {items.map((i) => (
            <SelectItem key={i.value} value={i.value}>
              {i.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{help}</p>
    </div>
  );
}

export function PreferencesForm({ initial }: { initial: Preferences }) {
  const [state, action, pending] = useActionState(savePreferences, undefined);
  // Los valores con los que se abrió, fijos: al guardar, la página se recarga con los nuevos, y a un
  // Select de Base UI no se le puede cambiar el defaultValue después de arrancar (tira un error).
  // Lo que elegiste ya queda en cada selector.
  const [start] = useState(initial);

  useEffect(() => {
    if (state?.ok) toast.success(state.message);
  }, [state]);

  return (
    <form action={action} className="flex flex-col gap-5">
      <Field
        name="homePage"
        label="Pantalla de inicio"
        help="La que se abre al entrar a Salt."
        labels={HOME_PAGES}
        value={start.homePage}
      />
      <Field
        name="defaultCurrency"
        label="Moneda de los totales"
        help="Cómo se ven de entrada el inicio y las categorías (se puede cambiar en cada pantalla)."
        labels={currencyLabels}
        value={start.defaultCurrency}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">Color</legend>
        <div className="flex flex-wrap gap-3">
          {Object.entries(ACCENT_COLORS).map(([value, { label, swatch }]) => (
            <label key={value} className="flex cursor-pointer flex-col items-center gap-1 text-xs">
              <input type="radio" name="accentColor" value={value} defaultChecked={start.accentColor === value} className="peer sr-only" />
              <span
                className={cn(
                  "size-9 rounded-full border-2 border-transparent ring-offset-2 ring-offset-background transition",
                  "peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                  value === "neutral" && "dark:outline dark:outline-1 dark:outline-border",
                )}
                style={{ background: swatch }}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <Field
        name="defaultPaymentMethod"
        label="Medio de pago de siempre"
        help="El que se propone primero al cargar un gasto o un fijo (en la web y en Chop)."
        labels={paymentMethodLabels}
        value={start.defaultPaymentMethod}
      />
      <Field
        name="defaultDollarType"
        label="Dólar de siempre"
        help="Para los gastos en dólares que no son con crédito (con crédito es siempre el oficial)."
        labels={Object.fromEntries(Object.entries(dollarTypeLabels).map(([k, v]) => [k, `Dólar ${v}`]))}
        value={start.defaultDollarType}
      />

      {state?.message && !state.ok && <p className="text-sm text-destructive">{state.message}</p>}
      <Button type="submit" disabled={pending} className="self-start">
        {pending ? "Guardando..." : "Guardar preferencias"}
      </Button>
    </form>
  );
}
