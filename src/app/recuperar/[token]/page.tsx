import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { isResetTokenValid } from "@/lib/services/password-reset";
import { NewPasswordForm } from "./new-password-form";

export const metadata: Metadata = { title: "Contraseña nueva · Salt" };

// El link que llega por mail: /recuperar/<token>
export default async function NewPasswordPage({ params }: PageProps<"/recuperar/[token]">) {
  const { token } = await params;

  if (!(await isResetTokenValid(token))) {
    return (
      <AuthShell title="Este link ya no sirve" subtitle="Vence a la hora de pedirlo y se puede usar una sola vez.">
        <Link href="/recuperar" className="text-sm font-medium underline underline-offset-4">
          Pedir un link nuevo
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Elegí tu contraseña nueva" subtitle="Mínimo 8 caracteres.">
      <NewPasswordForm token={token} />
    </AuthShell>
  );
}
