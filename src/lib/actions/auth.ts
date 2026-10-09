"use server";

import bcrypt from "bcryptjs";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/dal";
import { createSession, deleteSession } from "@/lib/session";
import { MailError } from "@/lib/mail";
import { PasswordResetError, requestPasswordReset, resetPassword } from "@/lib/services/password-reset";
import { claimLoginAttempt, clearFailedLogins } from "@/lib/services/login-attempts";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  newPasswordSchema,
  type FormState,
} from "@/lib/validators";

// "use server" convierte estas funciones en Server Actions: el formulario del
// navegador las llama, pero el código corre en el servidor (acá sí hay acceso a la base).

// Hash de una contraseña al azar que nadie conoce (ver login): con el mismo costo (10) que los reales
const DUMMY_HASH = "$2b$10$EPT1cnNpgkKiQq4WTu/r5eiY5aGXI8.ad/EQIAjQhUhMO0zcx/4ky";

export async function login(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  const { email, password } = parsed.data;
  // Se anota el intento antes de probar. Bloqueado por muchos intentos: ni se prueba la contraseña
  // (aunque esta vez sea la correcta)
  const minutes = await claimLoginAttempt(email);
  if (minutes > 0) {
    return {
      message:
        `Demasiados intentos fallidos. Probá de nuevo en ${minutes} ${minutes === 1 ? "minuto" : "minutos"} ` +
        "o cambiá la contraseña con «¿Olvidaste tu contraseña?».",
    };
  }

  const user = await db.user.findUnique({ where: { email } });
  // Siempre se compara contra algún hash, aunque el email no exista o la cuenta esté desactivada:
  // bcrypt tarda ~70 ms a propósito, y si solo tardara con las cuentas reales, midiendo el tiempo
  // de respuesta se podría saber qué emails tienen cuenta
  const matches = await bcrypt.compare(password, user?.active ? user.passwordHash : DUMMY_HASH);
  const valid = user && user.active && matches;
  // Mismo mensaje para email o contraseña incorrectos: no le decimos a un intruso cuál acertó.
  // El intento fallido ya quedó anotado (claimLoginAttempt)
  if (!valid) return { message: "Email o contraseña incorrectos" };

  await clearFailedLogins(email);
  await createSession({ userId: user.id, role: user.role, ver: user.sessionVersion });
  redirect("/"); // la portada manda a la pantalla de inicio elegida
}

export async function logout() {
  await deleteSession();
  redirect("/login");
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const me = await requireEditor();
  const parsed = changePasswordSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  const user = await db.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!(await bcrypt.compare(parsed.data.current, user.passwordHash))) {
    return { errors: { current: ["Contraseña actual incorrecta"] } };
  }
  // Subir la versión cierra las sesiones abiertas en otros lados; en este dispositivo seguís
  // adentro con una cookie nueva. Los accesos con huella se borran (decisión de Felipe: si alguien
  // sabía la contraseña vieja, pudo haber agregado el suyo)
  const passkeys = await db.passkey.count({ where: { userId: me.id } });
  const updated = await db.user.update({
    where: { id: me.id },
    data: {
      passwordHash: await bcrypt.hash(parsed.data.next, 10),
      sessionVersion: { increment: 1 },
      passkeys: { deleteMany: {} },
    },
    select: { sessionVersion: true },
  });
  await createSession({ userId: me.id, role: me.role, ver: updated.sessionVersion });
  revalidatePath("/cuenta"); // la lista de accesos con huella quedó vacía
  return {
    ok: true,
    message:
      "Contraseña actualizada. Se cerró la sesión en los otros dispositivos" +
      (passkeys > 0 ? " y se borraron los accesos con huella: volvé a agregarlos." : "."),
  };
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
