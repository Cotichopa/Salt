"use client";

import { useState, useTransition } from "react";
import { Fingerprint, Trash2Icon } from "lucide-react";
import { toast } from "sonner";
import { startRegistration } from "@simplewebauthn/browser";
import { finishPasskeyRegistration, removePasskey, startPasskeyRegistration } from "@/lib/actions/passkeys";
import { useWebAuthnSupport } from "@/lib/use-webauthn-support";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldError } from "@/components/field-error";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export type PasskeyItem = { id: string; name: string; created: string; lastUsed: string | null };

// Accesos con huella: la lista de dispositivos y "Agregar este dispositivo" (pide la contraseña,
// después la huella del celular).
export function PasskeysSection({ passkeys }: { passkeys: PasskeyItem[] }) {
  const supported = useWebAuthnSupport();
  const [asking, setAsking] = useState(false); // mostrando el campo de la contraseña
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function add(formData: FormData) {
    setError(undefined);
    startTransition(async () => {
      const start = await startPasskeyRegistration(String(formData.get("password") ?? ""));
      if ("error" in start) return setError(start.error);
      let response;
      try {
        response = await startRegistration({ optionsJSON: start.options });
      } catch (e) {
        // InvalidStateError: este dispositivo ya tiene una passkey de esta cuenta
        setError(
          e instanceof Error && e.name === "InvalidStateError"
            ? "Este dispositivo ya tiene acceso con huella."
            : "No se agregó. Si cancelaste, probá de nuevo.",
        );
        return;
      }
      const result = await finishPasskeyRegistration(response);
      if ("error" in result) return setError(result.error);
      toast.success("Listo: la próxima vez entrás con la huella.");
      setAsking(false);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {passkeys.length > 0 && (
        <ul className="flex flex-col divide-y rounded-lg border">
          {passkeys.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2">
              <Fingerprint className="size-4 shrink-0 text-muted-foreground" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{p.name}</span>
                <span className="text-xs text-muted-foreground">
                  Agregado el {p.created}
                  {p.lastUsed ? ` · último uso ${p.lastUsed}` : " · sin usar todavía"}
                </span>
              </div>
              <DeletePasskeyButton id={p.id} name={p.name} />
            </li>
          ))}
        </ul>
      )}

      {supported === false && (
        <p className="text-sm text-muted-foreground">Este navegador no permite entrar con huella.</p>
      )}
      {supported && !asking && (
        <Button type="button" variant="outline" className="self-start" onClick={() => setAsking(true)}>
          <Fingerprint />
          Agregar este dispositivo
        </Button>
      )}
      {supported && asking && (
        <form action={add} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="passkey-password">Tu contraseña</Label>
            <Input id="passkey-password" name="password" type="password" autoComplete="current-password" required autoFocus />
            <FieldError errors={error ? [error] : undefined} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Esperando la huella…" : "Continuar"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => (setAsking(false), setError(undefined))}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

function DeletePasskeyButton({ id, name }: { id: string; name: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <AlertDialog>
      <AlertDialogTrigger render={<Button variant="ghost" size="icon" aria-label={`Quitar ${name}`} disabled={pending} />}>
        <Trash2Icon />
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Quitar el acceso de {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Desde ese dispositivo vas a tener que entrar con la contraseña. Lo podés volver a agregar cuando quieras.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() =>
              startTransition(async () => {
                await removePasskey(id);
                toast.success("Acceso quitado");
              })
            }
          >
            Quitar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
