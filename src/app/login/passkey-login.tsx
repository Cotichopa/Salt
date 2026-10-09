"use client";

import { useState, useTransition } from "react";
import { Fingerprint } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";
import { finishPasskeyLogin, startPasskeyLogin } from "@/lib/actions/passkeys";
import { useWebAuthnSupport } from "@/lib/use-webauthn-support";
import { Button } from "@/components/ui/button";

// "Entrar con huella": el celular muestra las cuentas de Salt que tiene guardadas, pide la huella o
// la cara, y firma. No hace falta escribir el email.
export function PasskeyLogin() {
  // Se sabe recién en el navegador: hasta entonces no se muestra
  const supported = useWebAuthnSupport();
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  if (!supported) return null;

  function login() {
    setError(undefined);
    startTransition(async () => {
      let response;
      try {
        response = await startAuthentication({ optionsJSON: await startPasskeyLogin() });
      } catch {
        // La persona canceló, se venció el tiempo o no tiene passkeys guardadas para Salt
        setError("No se usó ninguna huella. Si nunca la agregaste, entrá con tu contraseña y agregala desde Mi cuenta.");
        return;
      }
      // Si sale bien, finishPasskeyLogin redirige y no vuelve
      const result = await finishPasskeyLogin(response);
      if ("error" in result) setError(result.error);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />o<span className="h-px flex-1 bg-border" />
      </div>
      <Button type="button" variant="outline" size="lg" className="h-11 w-full" onClick={login} disabled={pending}>
        <Fingerprint />
        {pending ? "Esperando la huella…" : "Entrar con huella"}
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
