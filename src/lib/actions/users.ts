"use server";

import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireAdminEditor, requireSuperadminEditor } from "@/lib/dal";
import { createSession } from "@/lib/session";
import { ensureDefaultCategories } from "@/lib/services/categories";
import { ensureDefaults } from "@/lib/services/payment-sources";
import { createUserSchema, resetPasswordSchema, updateUserSchema, type CreateUserState, type FormState } from "@/lib/validators";
import { Prisma } from "@/generated/prisma/client";
import { MailError } from "@/lib/mail";
import { sendInvitation } from "@/lib/services/password-reset";
import { sendWelcome } from "@/lib/whatsapp/client";

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

/** ¿El error es de un dato único repetido? Devuelve cuál (P2002 = se violó una restricción @unique) */
function duplicatedField(e: unknown) {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") return null;
  // Con el adaptador de Postgres el índice violado viene dentro de meta (ej: "users_phone_key")
  return JSON.stringify(e.meta ?? {}).includes("phone") ? "phone" : "email";
}

export async function createUser(_prev: CreateUserState, formData: FormData): Promise<CreateUserState> {
  await requireAdminEditor();
  const parsed = createUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  const { name, email, phone, role } = parsed.data;
  // Por mail: una contraseña al azar que nadie conoce, y la persona elige la suya con la invitación
  const initial = parsed.data.method === "password" ? parsed.data.password : randomBytes(32).toString("base64url");
  let created;
  try {
    created = await db.user.create({ data: { name, email, phone, role, passwordHash: await bcrypt.hash(initial, 10) } });
    await ensureDefaultCategories(created.id);
    await ensureDefaults(created.id);
  } catch (e) {
    const field = duplicatedField(e);
    if (field) return { errors: { [field]: ["Ya hay una cuenta con este dato"] } };
    throw e;
  }
  revalidatePath("/admin/usuarios");
  const account = { id: created.id, name, email, phone };
  if (parsed.data.method === "password") return { ok: true, created: { ...account, invited: false } };
  try {
    await sendInvitation(created.id);
  } catch (e) {
    if (!(e instanceof MailError)) throw e;
    return { ok: true, created: { ...account, invited: true, mailError: e.message } };
  }
  return { ok: true, created: { ...account, invited: true } };
}

/** Manda por mail el link para elegir contraseña (vence en 48 horas): invitación o contraseña nueva */
export async function inviteUser(userId: string): Promise<FormState> {
  const admin = await requireAdminEditor();
  if (!(await canManage(admin, userId))) return { message: NOT_ALLOWED };
  try {
    await sendInvitation(String(userId));
  } catch (e) {
    if (e instanceof MailError) return { message: e.message };
    throw e;
  }
  return { ok: true, message: "Mail enviado: el link vence en 48 horas." };
}

/** Manda la bienvenida de Chop por WhatsApp: sale recién cuando el admin toca el botón */
export async function welcomeUser(userId: string): Promise<FormState> {
  const admin = await requireAdminEditor();
  if (!(await canManage(admin, userId))) return { message: NOT_ALLOWED };
  const user = await db.user.findUnique({ where: { id: String(userId) }, select: { name: true, phone: true, active: true } });
  if (!user?.active) return { message: "Esa cuenta está desactivada" };
  if (!user.phone) return { message: "Esa cuenta no tiene WhatsApp cargado" };
  const result = await sendWelcome(user.phone, user.name);
  if (result.ok) return { ok: true, message: `Meta aceptó la bienvenida para ${user.name}` };
  // 131030 = no está en la lista del número de prueba; 132001 = plantilla inexistente o sin aprobar
  if (result.error.includes("131030")) return { message: "Ese número no está en la lista de destinatarios de Meta" };
  if (result.error.includes("132001")) return { message: "La plantilla de bienvenida todavía no está aprobada en Meta" };
  return { message: "WhatsApp no aceptó el mensaje. El detalle quedó en los errores del servidor." };
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
  // Sus accesos con huella se borran: los vuelve a agregar desde Mi cuenta. Los links para elegir
  // contraseña que no se usaron dejan de valer: si no, seguirían pudiendo pisar la que se pone acá
  const updated = await db.user.update({
    where: { id: parsed.data.userId },
    data: {
      passwordHash: await bcrypt.hash(parsed.data.password, 10),
      sessionVersion: { increment: 1 },
      passkeys: { deleteMany: {} },
      passwordResets: { updateMany: { where: { usedAt: null }, data: { usedAt: new Date() } } },
    },
    select: { sessionVersion: true },
  });
  // Si el admin se la cambió a sí mismo, sigue adentro en este dispositivo
  if (parsed.data.userId === admin.id) await createSession({ userId: admin.id, role: admin.role, ver: updated.sessionVersion });
  revalidatePath("/admin/usuarios");
  return { ok: true, message: "Contraseña cambiada. Se cerraron sus sesiones abiertas y se borraron sus accesos con huella." };
}

/** Nombre, email, WhatsApp y rol. El rol no se cambia en la cuenta propia ni en la del superadmin */
export async function updateUser(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdminEditor();
  const parsed = updateUserSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };
  const { userId, role, ...data } = parsed.data;
  if (!(await canManage(admin, userId))) return { message: NOT_ALLOWED };
  const target = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { role: true } });
  const canChangeRole = userId !== admin.id && target.role !== "SUPERADMIN";
  try {
    await db.user.update({ where: { id: userId }, data: { ...data, ...(canChangeRole && role ? { role } : {}) } });
  } catch (e) {
    const field = duplicatedField(e);
    if (field) return { errors: { [field]: ["Ya hay otra cuenta con este dato"] } };
    throw e;
  }
  revalidatePath("/admin/usuarios");
  return { ok: true, message: "Datos guardados" };
}

/**
 * Borra la cuenta y todos sus datos, para siempre. Solo el superadmin, y escribiendo el nombre de la
 * persona. No se puede con la propia ni con la de un superadmin (ese rol se saca antes, por consola).
 */
export async function deleteUser(userId: string, confirmName: string): Promise<FormState> {
  const me = await requireSuperadminEditor();
  const target = await db.user.findUnique({ where: { id: String(userId) }, select: { id: true, name: true, email: true, phone: true, role: true } });
  if (!target) return { message: "Esa cuenta ya no existe" };
  if (target.id === me.id || target.role === "SUPERADMIN") return { message: "La cuenta de un superadmin no se puede borrar" };
  if (String(confirmName).trim() !== target.name) return { message: "El nombre no coincide" };
  await db.$transaction([
    // Primero los gastos: una categoría con gastos no se puede borrar (onDelete: Restrict), así que
    // borrar la cuenta sola falla. Todo lo demás de la cuenta se borra en cascada con ella
    db.expense.deleteMany({ where: { userId: target.id } }),
    // Estos dos no están atados a la cuenta: van por teléfono y por email
    ...(target.phone ? [db.waSession.deleteMany({ where: { phone: target.phone } })] : []),
    db.loginAttempt.deleteMany({ where: { email: target.email } }),
    db.user.delete({ where: { id: target.id } }),
  ]);
  revalidatePath("/admin/usuarios");
  return { ok: true, message: `Cuenta de ${target.name} borrada` };
}
