import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getNoticeSettings } from "@/lib/services/notices";
import { ChangePasswordForm } from "./change-password-form";
import { NoticesForm } from "./notices-form";

export const metadata: Metadata = { title: "Mi cuenta · Salt" };

export default async function AccountPage() {
  const user = await requireUser();
  const notices = await getNoticeSettings(user.id);

  return (
    <div className="flex max-w-md flex-col gap-4 py-2">
      <h1 className="text-2xl font-semibold">Mi cuenta</h1>
      <Card>
        <CardHeader>
          <CardTitle>{user.name}</CardTitle>
          <CardDescription>
            {user.email}
            <br />
            WhatsApp: {user.phone ?? "sin cargar (pedíselo al administrador)"}
          </CardDescription>
        </CardHeader>
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
