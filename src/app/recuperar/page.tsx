import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Olvidé mi contraseña · Salt" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="¿Olvidaste tu contraseña?"
      subtitle="Poné el email de tu cuenta y te mandamos un link para elegir una nueva."
    >
      <ForgotPasswordForm />
      <Link href="/login" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        ← Volver a ingresar
      </Link>
    </AuthShell>
  );
}
