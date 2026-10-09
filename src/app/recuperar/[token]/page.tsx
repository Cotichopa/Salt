import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { resetLinkInfo } from "@/lib/services/password-reset";
import { NewPasswordForm } from "./new-password-form";

export const metadata: Metadata = { title: "Contraseña nueva · Salt" };

// El link que llega por mail: /recuperar/<token>. Sirve para "olvidé mi contraseña" y para la
// invitación a una cuenta nueva (sendInvitation), que cambia los textos.
export default async function NewPasswordPage({ params }: PageProps<"/recuperar/[token]">) {
  const { token } = await params;
  const link = await resetLinkInfo(token);

  if (!link) {
    return (
      <AuthShell
        title="Este link ya no sirve"
        subtitle="Se puede usar una sola vez, y vence (la invitación a las 48 horas; el de «olvidé mi contraseña», a la hora)."
      >
        <Link href="/recuperar" className="text-sm font-medium underline underline-offset-4">
          Pedir un link nuevo
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={link.invite ? `¡Hola ${link.name}! Elegí tu contraseña` : "Elegí tu contraseña nueva"}
      subtitle={link.invite ? "Con ella vas a entrar a Salt. Mínimo 8 caracteres." : "Mínimo 8 caracteres."}
    >
      <NewPasswordForm token={token} />
    </AuthShell>
  );
}
