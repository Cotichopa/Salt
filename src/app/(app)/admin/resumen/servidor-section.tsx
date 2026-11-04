import { CircleAlertIcon, CircleCheckIcon, CircleMinusIcon } from "lucide-react";
import { systemStatus, type Check } from "@/lib/services/overview";
import { recentServerErrors } from "@/lib/server-errors";
import { cn } from "@/lib/utils";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Editable } from "@/components/read-only";
import { dateTime } from "./date-time";
import { ClearErrorsButton } from "./review-actions";

// Pestaña Servidor: los errores (lo que hay que revisar) y cómo está el sistema, ahora

function CheckLine({ check }: { check: Check }) {
  const Icon = check.ok === null ? CircleMinusIcon : check.ok ? CircleCheckIcon : CircleAlertIcon;
  return (
    <li className="flex items-start gap-3 py-2">
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          check.ok === null ? "text-muted-foreground" : check.ok ? "text-green-700 dark:text-green-500" : "text-red-700 dark:text-red-400",
        )}
        aria-label={check.ok === null ? "Sin configurar" : check.ok ? "Bien" : "Problema"}
      />
      <div className="min-w-0">
        <p className="text-sm font-medium">{check.label}</p>
        <p className="text-sm text-muted-foreground">{check.detail}</p>
      </div>
    </li>
  );
}

export function ServidorSection({
  errors,
  system,
}: {
  errors: Awaited<ReturnType<typeof recentServerErrors>>;
  system: Awaited<ReturnType<typeof systemStatus>>;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Errores del servidor</CardTitle>
          <CardDescription>Los últimos 30 (se borran solos a los 30 días). No incluye los robots que prueban la app desde internet.</CardDescription>
          {errors.length > 0 && (
            <CardAction>
              <Editable>
                <ClearErrorsButton />
              </Editable>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {errors.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguno.</p>
          ) : (
            <ul className="flex flex-col divide-y">
              {errors.map((e) => (
                <li key={e.id} className="flex flex-col gap-0.5 py-2">
                  <span className="text-xs text-muted-foreground">{dateTime(e.createdAt)}</span>
                  <details>
                    <summary className="cursor-pointer text-sm break-words">{e.message.split("\n")[0].slice(0, 200)}</summary>
                    <pre className="mt-1 overflow-x-auto rounded bg-muted p-2 text-xs whitespace-pre-wrap">{e.message}</pre>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sistema</CardTitle>
          <CardDescription>El servidor donde corre Salt, ahora.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-x-8 sm:grid-cols-2">
          <ul className="flex flex-col divide-y">
            {system.checks.map((c) => (
              <CheckLine key={c.label} check={c} />
            ))}
          </ul>
          <dl className="flex flex-col divide-y">
            {system.info.map((i) => (
              <div key={i.label} className="py-2">
                <dt className="text-sm font-medium">{i.label}</dt>
                <dd className="text-sm text-muted-foreground">{i.detail}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
