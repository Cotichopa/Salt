import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getNoticeSettings } from "@/lib/services/notices";
import { getPreferences } from "@/lib/services/preferences";
import { ChangePasswordForm } from "./change-password-form";
import { NoticesForm } from "./notices-form";
import { PreferencesForm } from "./preferences-form";
import { NameForm, PhoneForm } from "./profile-forms";

export const metadata: Metadata = { title: "Mi cuenta · Salt" };

export default async function AccountPage() {
  const user = await requireUser();
  const [notices, preferences] = await Promise.all([getNoticeSettings(user.id), getPreferences(user.id)]);

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
          <CardTitle>Cambiar contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
