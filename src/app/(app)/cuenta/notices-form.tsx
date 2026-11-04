"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateNoticeSetting } from "@/lib/actions/notices";
import type { NoticeSetting, NoticeSettings } from "@/lib/services/notices";

const OPTIONS: { setting: NoticeSetting; label: string; help: string }[] = [
  { setting: "notifyCardDue", label: "Vencimiento de tarjetas", help: "3 días antes y el día anterior, si no está pagada." },
  { setting: "notifyWeekly", label: "Resumen de la semana", help: "Lo que gastaste la semana pasada (lunes a domingo)." },
  { setting: "notifyMonthly", label: "Resumen del mes", help: "Lo del mes pasado y cómo cerraron tus presupuestos." },
];

/** Llaves para prender o apagar cada aviso de Chop. Cada uno se guarda apenas se toca. */
export function NoticesForm({ initial }: { initial: NoticeSettings }) {
  const [settings, setSettings] = useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle(setting: NoticeSetting, on: boolean) {
    setSettings((s) => ({ ...s, [setting]: on }));
    startTransition(async () => {
      const result = await updateNoticeSetting({ setting, on });
      if (result.ok) {
        toast.success(on ? "Aviso prendido" : "Aviso apagado");
      } else {
        setSettings((s) => ({ ...s, [setting]: !on })); // no se guardó: vuelve como estaba
        toast.error("No se pudo guardar");
      }
    });
  }

  return (
    <>
      {OPTIONS.map(({ setting, label, help }) => (
        <label key={setting} className="flex cursor-pointer items-center gap-3 border-t py-3 text-sm first:border-t-0">
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{label}</span>
            <span className="block text-xs text-muted-foreground">{help}</span>
          </span>
          <input
            type="checkbox"
            role="switch"
            checked={settings[setting]}
            disabled={pending}
            onChange={(e) => toggle(setting, e.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className="relative h-6 w-10 shrink-0 rounded-full bg-input transition-colors after:absolute after:top-0.5 after:left-0.5 after:size-5 after:rounded-full after:bg-foreground/70 after:transition-transform peer-checked:bg-primary peer-checked:after:translate-x-4 peer-checked:after:bg-primary-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-ring/50"
          />
        </label>
      ))}
    </>
  );
}
