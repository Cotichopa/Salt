"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import { db } from "@/lib/db";
import { requireEditor } from "@/lib/dal";
import { createSession } from "@/lib/session";
import {
  authenticationOptions,
  deletePasskey,
  PasskeyError,
  registerPasskey,
  registrationOptions,
  verifyPasskeyLogin,
} from "@/lib/services/passkeys";

// Entrar con huella (passkeys). Cada operación tiene dos pasos con el navegador en el medio:
// el servidor da las opciones → el navegador pide la huella → el servidor verifica.
// La lógica está en src/lib/services/passkeys.ts.

type Result = { ok: true } | { error: string };

/** Lo que llega del navegador no es de fiar: si ni siquiera tiene un id, no se procesa */
function looksLikeResponse(response: unknown): response is { id: string } {
  return typeof response === "object" && response !== null && typeof (response as { id?: unknown }).id === "string";
}

/** Agregar este dispositivo, paso 1: pide la contraseña (por si alguien encontró la sesión abierta) */
export async function startPasskeyRegistration(password: string) {
  const me = await requireEditor();
  const user = await db.user.findUniqueOrThrow({ where: { id: me.id }, select: { passwordHash: true } });
  if (typeof password !== "string" || !(await bcrypt.compare(password, user.passwordHash))) {
    return { error: "Contraseña incorrecta" } as const;
  }
  return { options: await registrationOptions(me) } as const;
}

/** Agregar este dispositivo, paso 2 */
export async function finishPasskeyRegistration(response: RegistrationResponseJSON): Promise<Result> {
  const me = await requireEditor();
  if (!looksLikeResponse(response)) return { error: "No se pudo verificar el dispositivo. Probá de nuevo." };
  try {
    await registerPasskey(me.id, response);
  } catch (e) {
    if (e instanceof PasskeyError) return { error: e.message };
    throw e;
  }
  revalidatePath("/cuenta");
  return { ok: true };
}

export async function removePasskey(id: string) {
  const me = await requireEditor();
  await deletePasskey(me.id, id);
  revalidatePath("/cuenta");
}

/** Entrar con huella, paso 1 (sin sesión) */
export async function startPasskeyLogin() {
  return authenticationOptions();
}

/** Entrar con huella, paso 2: si la firma vale, abre la sesión igual que con la contraseña */
export async function finishPasskeyLogin(response: AuthenticationResponseJSON): Promise<Result> {
  if (!looksLikeResponse(response)) return { error: "No se pudo verificar la huella. Probá de nuevo." };
  let user;
  try {
    user = await verifyPasskeyLogin(response);
  } catch (e) {
    if (e instanceof PasskeyError) return { error: e.message };
    throw e;
  }
  await createSession({ userId: user.id, role: user.role, ver: user.sessionVersion });
  redirect("/"); // la portada manda a la pantalla de inicio elegida
}
