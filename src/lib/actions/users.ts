"use server";

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdminEditor } from "@/lib/dal";
import { createSession } from "@/lib/session";
import { ensureDefaultCategories } from "@/lib/services/categories";
import { ensureDefaults } from "@/lib/services/payment-sources";
import { createUserSchema, resetPasswordSchema, updatePhoneSchema, type FormState } from "@/lib/validators";
import { Prisma } from "@/generated/prisma/client";
import { MailError } from "@/lib/mail";
import { sendInvitation } from "@/lib/services/password-reset";

// Acciones de administración de cuentas. Cada una verifica que quien la llama sea ADMIN:
// esconder el botón en la pantalla no alcanza, porque una acción se puede invocar a mano.

/**
 * La cuenta del superadmin solo la toca el superadmin. Si no, un admin podría ponerle una
 * contraseña nueva, entrar como superadmin y ver las cuentas de todos.
 */
async function canManage(admin: { id: string; role: string }, userId: string) {
  if (admin.role === "SUPERADMIN" || admin.id === userId) return true;
  const target = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  return target?.role !== "SUPERADMIN";
}

const NOT_ALLOWED = "La cuenta del superadmin solo la puede cambiar el superadmin.";

export async function createUser(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdminEditor();
  const parsed = createUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  const { password, ...data } = parsed.data;
  // Sin contraseña: una al azar que nadie conoce, y la persona elige la suya con la invitación
  const initial = password || randomBytes(32).toString("base64url");
  let created;
  try {
    created = await db.user.create({ data: { ...data, passwordHash: await bcrypt.hash(initial, 10) } });
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
  if (password) return { ok: true, message: `Cuenta de ${data.name} creada` };
  try {
    await sendInvitation(created.id);
  } catch (e) {
    if (!(e instanceof MailError)) throw e;
    return { ok: true, message: `Cuenta de ${data.name} creada, pero no se pudo mandar el mail: ${e.message} Probá «Invitar» en su fila.` };
  }
  return { ok: true, message: `Cuenta de ${data.name} creada. Le mandamos un mail a ${data.email} para que elija su contraseña.` };
}

/** (Re)manda la invitación por mail: para elegir la contraseña con un link que vence en 48 horas */
export async function inviteUser(userId: string): Promise<FormState> {
  const admin = await requireAdminEditor();
  if (!(await canManage(admin, userId))) return { message: NOT_ALLOWED };
  try {
    await sendInvitation(String(userId));
  } catch (e) {
    if (e instanceof MailError) return { message: e.message };
    throw e;
  }
  return { ok: true, message: "Invitación enviada" };
}

export async function toggleUserActive(userId: string) {
  const admin = await requireAdminEditor();
  if (userId === admin.id) return; // no te podés desactivar a vos mismo
  if (!(await canManage(admin, userId))) return;
  const user = await db.user.findUniqueOrThrow({ where: { id: userId } });
  await db.user.update({ where: { id: userId }, data: { active: !user.active } });
  revalidatePath("/admin/usuarios");
}

export async function resetUserPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdminEditor();
  const parsed = resetPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };
  if (!(await canManage(admin, parsed.data.userId))) return { message: NOT_ALLOWED };
  // sessionVersion + 1: esa persona tiene que volver a entrar con la contraseña nueva en todos lados.
  // Sus accesos con huella se borran: los vuelve a agregar desde Mi cuenta
  const updated = await db.user.update({
    where: { id: parsed.data.userId },
    data: {
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      sessionVersion: { increment: 1 },
      passkeys: { deleteMany: {} },
    },
    select: { sessionVersion: true },
  });
  // Si el admin se la cambió a sí mismo, sigue adentro en este dispositivo
  if (parsed.data.userId === admin.id) await createSession({ userId: admin.id, role: admin.role, ver: updated.sessionVersion });
  return { ok: true, message: "Contraseña cambiada. Se cerraron sus sesiones abiertas y se borraron sus accesos con huella." };
}

export async function updateUserPhone(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdminEditor();
  const parsed = updatePhoneSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };
  if (!(await canManage(admin, parsed.data.userId))) return { message: NOT_ALLOWED };
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
