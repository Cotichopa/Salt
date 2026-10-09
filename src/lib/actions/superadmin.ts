"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSuperadminEditor } from "@/lib/dal";
import { clearFailedLogins } from "@/lib/services/login-attempts";

// Acciones del Resumen → Accesos. Solo el superadmin (y no en "ver como").

/** Borra los intentos fallidos: si estaba bloqueada por 15 minutos, ya puede entrar */
export async function unlockLogin(userId: string) {
  await requireSuperadminEditor();
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } });
  if (user) await clearFailedLogins(user.email);
  revalidatePath("/admin/resumen");
}

/**
 * Saca a esa persona de todos sus dispositivos (por ejemplo, si perdió el celular): sube
 * sessionVersion, como al cambiar la contraseña pero sin cambiarla, y quita sus huellas (la del
 * celular perdido seguiría abriendo la cuenta). Vuelve a entrar con su contraseña.
 */
export async function closeSessions(userId: string) {
  const me = await requireSuperadminEditor();
  if (userId === me.id) return; // las propias se cierran cambiando la contraseña
  await db.user.update({
    where: { id: userId },
    data: { sessionVersion: { increment: 1 }, passkeys: { deleteMany: {} } },
  });
  revalidatePath("/admin/resumen");
}
