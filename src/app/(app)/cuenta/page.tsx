import type { Metadata } from "next";
import { requireUser } from "@/lib/dal";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Mi cuenta · Salt" };

export default async function AccountPage() {
  const user = await requireUser();

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
          <CardTitle>Cambiar contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
