"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/dal";
import { ensureDefaultCategories } from "@/lib/services/categories";
import { ensureDefaults } from "@/lib/services/payment-sources";
import { createUserSchema, resetPasswordSchema, updatePhoneSchema, type FormState } from "@/lib/validators";
import { Prisma } from "@/generated/prisma/client";

// Acciones de administración de cuentas. Cada una verifica que quien la llama sea ADMIN:
// esconder el botón en la pantalla no alcanza, porque una acción se puede invocar a mano.

export async function createUser(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = createUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  const { password, ...data } = parsed.data;
  try {
    const created = await db.user.create({ data: { ...data, passwordHash: await bcrypt.hash(password, 10) } });
    await ensureDefaultCategories(created.id);
    await ensureDefaults(created.id);
  } catch (e) {
    // P2002 = se violó una restricción @unique (email o teléfono ya usados)
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      // Con el adaptador de Postgres el índice violado viene dentro de meta (ej: "users_phone_key")
      const field = JSON.stringify(e.meta ?? {}).includes("phone") ? "phone" : "email";
      return { errors: { [field]: ["Ya hay una cuenta con este dato"] } };
    }
    throw e;
  }
  revalidatePath("/admin/usuarios");
  return { ok: true, message: `Cuenta de ${data.name} creada` };
}

export async function toggleUserActive(userId: string) {
  const admin = await requireAdmin();
  if (userId === admin.id) return; // no te podés desactivar a vos mismo
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await db.user.update({ where: { id: userId }, data: { active: !user.active } });
  revalidatePath("/admin/usuarios");
}

export async function resetUserPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };
  await db.user.update({
    where: { id: parsed.data.userId },
    data: { passwordHash: await bcrypt.hash(parsed.data.password, 10) },
  });
  return { ok: true, message: "Contraseña cambiada" };
}

export async function updateUserPhone(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdmin();
  const parsed = updatePhoneSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };
  try {
    await db.user.update({ where: { id: parsed.data.userId }, data: { phone: parsed.data.phone } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { errors: { phone: ["Ese número ya está en otra cuenta"] } };
    }
    throw e;
  }
  revalidatePath("/admin/usuarios");
  return { ok: true, message: parsed.data.phone ? "WhatsApp actualizado" : "WhatsApp quitado" };
}
