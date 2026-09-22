import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/dal";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CreateUserForm } from "./create-user-form";
import { UserActions } from "./user-actions";

export const metadata: Metadata = { title: "Cuentas · Salt" };

export default async function UsersPage() {
  const admin = await requireAdmin();
  const users = await db.user.findMany({
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, email: true, phone: true, role: true, active: true },
  });

  return (
    <div className="flex flex-col gap-6 py-2">
      <h1 className="text-2xl font-semibold">Cuentas</h1>

      <Card>
        <CardHeader>
          <CardTitle>Nueva cuenta</CardTitle>
          <CardDescription>
            Pasale el email y la contraseña inicial a la persona; después la puede cambiar desde &quot;Mi cuenta&quot;.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateUserForm />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>WhatsApp</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} className={u.active ? undefined : "opacity-50"}>
                  <TableCell className="font-medium">
                    {u.name} {!u.active && <Badge variant="outline">inactiva</Badge>}
                  </TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>{u.phone ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === "ADMIN" ? "default" : "secondary"}>
                      {u.role === "ADMIN" ? "Admin" : "Miembro"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <UserActions userId={u.id} phone={u.phone} active={u.active} isSelf={u.id === admin.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
