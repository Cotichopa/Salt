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

/** Tildes para prender o apagar cada aviso de Chop. Cada uno se guarda apenas se toca. */
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
    <div className="flex flex-col gap-4">
      {OPTIONS.map(({ setting, label, help }) => (
        <label key={setting} className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={settings[setting]}
            disabled={pending}
            onChange={(e) => toggle(setting, e.target.checked)}
            className="mt-0.5 accent-primary"
          />
          <span>
            {label}
            <span className="block text-muted-foreground">{help}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
