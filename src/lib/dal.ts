import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { readSession } from "@/lib/session";

// Data Access Layer: el único lugar donde se decide "quién es el usuario actual".
// Toda página o acción que maneje datos privados empieza llamando a estas funciones.

// Devuelve el usuario logueado o null. `cache` evita consultar la base
// varias veces durante la misma carga de página.
export const getCurrentUser = cache(async () => {
  const session = await readSession();
  if (!session) return null;

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: { id: true, name: true, email: true, phone: true, role: true, active: true },
  });
  // Si la cuenta se desactivó o borró, la sesión deja de valer aunque la cookie siga viva
  if (!user || !user.active) return null;
  return user;
});

export async function requireUser() {
  const user = await getCurrentUser();
  // Sin sesión el proxy ya habría mandado al login; si llegamos acá es porque la
  // cookie es válida pero la cuenta no, así que hay que borrar la cookie primero
  if (!user) redirect("/api/auth/logout");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/dashboard");
  return user;
}
