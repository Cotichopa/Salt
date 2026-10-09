"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireSuperadminEditor } from "@/lib/dal";
import { clearFailedLogins } from "@/lib/services/login-attempts";
import { CategoryError } from "@/lib/services/categories";
import { deleteDefaultCategory, saveDefaultCategory } from "@/lib/services/default-categories";
import { categorySchema, type FormState } from "@/lib/validators";

// Acciones del Resumen del superadmin. Solo el superadmin (y no en "ver como").

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

// ---------- Categorías iniciales ----------

/** Crear o editar una categoría inicial (mismo formulario que las categorías de cada cuenta) */
export async function saveDefaultCategoryAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireSuperadminEditor();
  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };
  const id = formData.get("id");
  try {
    await saveDefaultCategory(typeof id === "string" && id ? id : null, parsed.data);
  } catch (e) {
    if (e instanceof CategoryError) return { errors: { name: [e.message] } };
    throw e;
  }
  revalidatePath("/admin/resumen");
  return { ok: true, message: id ? "Categoría inicial actualizada" : `"${parsed.data.name}" se suma a las cuentas nuevas` };
}

export async function removeDefaultCategory(id: string): Promise<FormState> {
  await requireSuperadminEditor();
  try {
    await deleteDefaultCategory(String(id));
  } catch (e) {
    if (e instanceof CategoryError) return { message: e.message };
    throw e;
  }
  revalidatePath("/admin/resumen");
  return { ok: true, message: "Las cuentas nuevas ya no la reciben" };
}

// ---------- Chop y errores ----------

/** Un mensaje que Chop no entendió, ya revisado: se borra el texto (queda el registro del costo) */
export async function markReviewed(id: string) {
  await requireSuperadminEditor();
  await db.chopMessage.updateMany({ where: { id: String(id) }, data: { text: null } });
  revalidatePath("/admin/resumen");
}

/** Los errores del servidor, ya revisados: se borran todos */
export async function clearServerErrors() {
  await requireSuperadminEditor();
  await db.serverError.deleteMany({});
  revalidatePath("/admin/resumen");
}
