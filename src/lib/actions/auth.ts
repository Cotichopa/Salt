"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/dal";
import { createSession, deleteSession } from "@/lib/session";
import { MailError } from "@/lib/mail";
import { PasswordResetError, requestPasswordReset, resetPassword } from "@/lib/services/password-reset";
import { clearFailedLogins, loginBlockedMinutes, recordFailedLogin } from "@/lib/services/login-attempts";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  newPasswordSchema,
  type FormState,
} from "@/lib/validators";

// "use server" convierte estas funciones en Server Actions: el formulario del
// navegador las llama, pero el código corre en el servidor (acá sí hay acceso a la base).

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  const { email, password } = parsed.data;
  // Bloqueado por muchos intentos: ni se prueba la contraseña (aunque esta vez sea la correcta)
  const minutes = await loginBlockedMinutes(email);
  if (minutes > 0) {
    return {
      message:
        `Demasiados intentos fallidos. Probá de nuevo en ${minutes} ${minutes === 1 ? "minuto" : "minutos"} ` +
        "o cambiá la contraseña con «¿Olvidaste tu contraseña?».",
    };
  }

  const user = await db.user.findUnique({ where: { email } });
  const valid = user && user.active && (await bcrypt.compare(password, user.passwordHash));
  // Mismo mensaje para email o contraseña incorrectos: no le decimos a un intruso cuál acertó
  if (!valid) {
    await recordFailedLogin(email);
    return { message: "Email o contraseña incorrectos" };
  }

  await clearFailedLogins(email);
  await createSession({ userId: user.id, role: user.role });
  redirect("/"); // la portada manda a la pantalla de inicio elegida
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireUser();
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  const user = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!(await bcrypt.compare(parsed.data.current, user.passwordHash))) {
    return { errors: { current: ["Contraseña actual incorrecta"] } };
  }
  await db.user.update({
    where: { id: me.id },
    data: { passwordHash: await bcrypt.hash(parsed.data.next, 10) },
  });
  return { ok: true, message: "Contraseña actualizada" };
}

/** "Olvidé mi contraseña": manda el mail con el link. Responde siempre lo mismo, exista o no la cuenta. */
export async function forgotPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = forgotPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };
  try {
    await requestPasswordReset(parsed.data.email);
  } catch (e) {
    if (e instanceof MailError) return { message: e.message };
    throw e;
  }
  return {
    ok: true,
    message: "Si ese email tiene una cuenta en Salt, te mandamos un link para cambiar la contraseña. Revisá también el spam.",
  };
}

/** Contraseña nueva con el link del mail. Si sale bien, vuelve al login. */
export async function setNewPassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = newPasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };
  try {
    await resetPassword(parsed.data.token, parsed.data.next);
  } catch (e) {
    if (e instanceof PasswordResetError) return { message: e.message };
    throw e;
  }
  redirect("/login?clave=nueva");
}
