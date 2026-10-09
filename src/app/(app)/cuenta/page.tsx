import type { Metadata } from "next";
import { db } from "@/lib/db";
import { getViewedAccount, requireUser } from "@/lib/dal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getNoticeSettings } from "@/lib/services/notices";
import { getPreferences } from "@/lib/services/preferences";
import { listPasskeys } from "@/lib/services/passkeys";
import { TIME_ZONE } from "@/lib/format";
import { ChangePasswordForm } from "./change-password-form";
import { NoticesForm } from "./notices-form";
import { PasskeysSection } from "./passkeys-section";
import { PreferencesForm } from "./preferences-form";
import { NameForm, PhoneForm } from "./profile-forms";

export const metadata: Metadata = { title: "Mi cuenta · Salt" };

export default async function AccountPage() {
  const user = await requireUser();
  // En "ver como" esta pantalla sería la del superadmin, pero no se puede cambiar nada
  const viewed = await getViewedAccount();
  if (viewed) {
    return (
      <div className="flex max-w-md flex-col gap-4 py-2">
        <h1 className="text-2xl font-semibold">Mi cuenta</h1>
        <p className="text-muted-foreground">
          Estás viendo la cuenta de {viewed.name}. Para cambiar algo de la tuya, tocá «Salir» en la barra de arriba.
        </p>
      </div>
    );
  }
  const [notices, preferences, passkeys] = await Promise.all([
    getNoticeSettings(user.id),
    getPreferences(user.id),
    listPasskeys(user.id),
  ]);
  // Quién puede mirar los gastos de esta cuenta (decisión de Felipe: que todos lo sepan)
  const superadmins =
    user.role === "SUPERADMIN"
      ? []
      : await db.user.findMany({ where: { role: "SUPERADMIN", active: true }, select: { name: true } });
  const day = new Intl.DateTimeFormat("es-AR", { timeZone: TIME_ZONE, day: "numeric", month: "numeric", year: "numeric" });

  return (
    <div className="flex max-w-md flex-col gap-4 py-2">
      <h1 className="text-2xl font-semibold">Mi cuenta</h1>
      <Card>
        <CardHeader>
          <CardTitle>Perfil</CardTitle>
          <CardDescription>{user.email}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <NameForm name={user.name} />
          <PhoneForm phone={user.phone} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Preferencias</CardTitle>
        </CardHeader>
        <CardContent>
          <PreferencesForm initial={preferences} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Avisos de Chop</CardTitle>
          <CardDescription>Chop te los cuenta la próxima vez que le escribas.</CardDescription>
        </CardHeader>
        <CardContent>
          <NoticesForm initial={notices} />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Entrar con huella</CardTitle>
          <CardDescription>
            Entrá con la huella o la cara del celular, sin escribir la contraseña. Si cambiás la contraseña, se borran
            y hay que volver a agregarlos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PasskeysSection
            passkeys={passkeys.map((p) => ({
              id: p.id,
              name: p.name,
              created: day.format(p.createdAt),
              lastUsed: p.lastUsedAt && day.format(p.lastUsedAt),
            }))}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Cambiar contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
      {superadmins.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Quién puede ver tus gastos</CardTitle>
            <CardDescription>
              {superadmins.map((s) => s.name).join(" y ")}{" "}
              {superadmins.length === 1 ? "administra Salt y puede" : "administran Salt y pueden"} ver tu cuenta: gastos,
              tickets, tarjetas, fijos y presupuestos. Solo mirar: no se puede cambiar nada. También ve los mensajes que
              Chop no entendió, para enseñarle frases nuevas (el resto de lo que le escribís no se guarda).
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
