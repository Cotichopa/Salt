import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";
import { PasskeyLogin } from "./passkey-login";

export const metadata: Metadata = { title: "Ingresar · Salt" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // Viene de "olvidé mi contraseña" con la contraseña ya cambiada
  const { clave } = await searchParams;

  return (
    <AuthShell
      title="¡Hola! Entrá a tu cuenta"
      subtitle="Si todavía no tenés una, pedísela a quien administra Salt en tu casa."
    >
      {clave === "nueva" && (
        <p role="status" className="rounded-lg border px-3 py-2 text-sm">
          ✅ Listo, cambiaste tu contraseña. Ya podés entrar con la nueva.
        </p>
      )}
      <div className="flex flex-col gap-5">
        <LoginForm />
        <PasskeyLogin />
      </div>
    </AuthShell>
  );
}
