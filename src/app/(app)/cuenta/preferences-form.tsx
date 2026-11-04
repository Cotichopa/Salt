"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { savePreference } from "@/lib/actions/preferences";
import { currencyLabels, dollarTypeLabels, paymentMethodLabels } from "@/lib/format";
import { ACCENT_COLORS, HOME_PAGES } from "@/lib/preferences";
import type { Preferences } from "@/lib/services/preferences";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// "Cómo usás Salt": cada opción se guarda sola apenas se cambia, como los avisos de Chop.

const itemsOf = (labels: Record<string, string>) => Object.entries(labels).map(([value, label]) => ({ value, label }));

const DOLLAR_LABELS = Object.fromEntries(Object.entries(dollarTypeLabels).map(([k, v]) => [k, `Dólar ${v}`]));

function Row({ label, help, children }: { label: string; help: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t py-3 first:border-t-0">
      <div className="min-w-0 flex-[1_1_14rem]">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{help}</div>
      </div>
      {children}
    </div>
  );
}

function Choice({
  label,
  labels,
  value,
  onChange,
}: {
  label: string;
  labels: Record<string, string>;
  value: string;
  onChange: (value: string) => void;
}) {
  const items = itemsOf(labels);
  return (
    <Select items={items} value={value} onValueChange={(v) => v && onChange(String(v))}>
      <SelectTrigger className="w-44" aria-label={label}>
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
  );
}

/** El tema se guarda en el navegador (next-themes): el servidor no lo sabe hasta que arranca la página */
const useMounted = () =>
  useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

function ThemeChoice() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  return (
    <div className="flex w-44 rounded-lg bg-muted p-0.5" role="radiogroup" aria-label="Tema">
      {[
        { value: "dark", label: "Oscuro" },
        { value: "light", label: "Claro" },
      ].map((t) => (
        <label
          key={t.value}
          className="flex-1 cursor-pointer rounded-md py-1 text-center text-sm font-medium text-muted-foreground has-checked:bg-background has-checked:text-foreground has-checked:shadow-sm has-focus-visible:ring-2 has-focus-visible:ring-ring/50"
        >
          <input
            type="radio"
            name="theme"
            value={t.value}
            checked={mounted && resolvedTheme === t.value}
            onChange={() => setTheme(t.value)}
            className="sr-only"
          />
          {t.label}
        </label>
      ))}
    </div>
  );
}

export function PreferencesRows({ initial }: { initial: Preferences }) {
  const [prefs, setPrefs] = useState(initial);
  const [, startTransition] = useTransition();

  function save(field: keyof Preferences, value: string) {
    const before = prefs[field];
    setPrefs((p) => ({ ...p, [field]: value }));
    startTransition(async () => {
      const result = await savePreference(field, value);
      if (result?.ok) toast.success("Guardado");
      else {
        setPrefs((p) => ({ ...p, [field]: before })); // no se guardó: vuelve como estaba
        toast.error(result?.message ?? "No se pudo guardar");
      }
    });
  }

  return (
    <>
      <Row label="Pantalla de inicio" help="La que se abre al entrar a Salt.">
        <Choice label="Pantalla de inicio" labels={HOME_PAGES} value={prefs.homePage} onChange={(v) => save("homePage", v)} />
      </Row>
      <Row label="Moneda de los totales" help="Cómo se ven de entrada el inicio y las categorías.">
        <Choice label="Moneda de los totales" labels={currencyLabels} value={prefs.defaultCurrency} onChange={(v) => save("defaultCurrency", v)} />
      </Row>
      <Row label="Medio de pago de siempre" help="El que se propone primero, en la web y en Chop.">
        <Choice
          label="Medio de pago de siempre"
          labels={paymentMethodLabels}
          value={prefs.defaultPaymentMethod}
          onChange={(v) => save("defaultPaymentMethod", v)}
        />
      </Row>
      <Row label="Dólar de siempre" help="Para gastos en dólares que no son con crédito.">
        <Choice label="Dólar de siempre" labels={DOLLAR_LABELS} value={prefs.defaultDollarType} onChange={(v) => save("defaultDollarType", v)} />
      </Row>
      <Row label="Tema" help="Se recuerda en este dispositivo.">
        <ThemeChoice />
      </Row>
      <Row label="Color" help="El de los botones principales.">
        <div className="flex gap-2" role="radiogroup" aria-label="Color">
          {Object.entries(ACCENT_COLORS).map(([value, { label, swatch }]) => (
            <label key={value} title={label} className="cursor-pointer">
              <input
                type="radio"
                name="accentColor"
                value={value}
                aria-label={label}
                checked={prefs.accentColor === value}
                onChange={() => save("accentColor", value)}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "block size-8 rounded-full ring-offset-2 ring-offset-card",
                  "peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring",
                  value === "neutral" && "dark:outline dark:outline-1 dark:outline-border",
                )}
                style={{ background: swatch }}
              />
            </label>
          ))}
        </div>
      </Row>
    </>
  );
}
