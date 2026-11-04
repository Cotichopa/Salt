"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireEditor } from "@/lib/dal";
import { notifyEmailChanged, ProfileError, updateName, updateOwnEmail, updateOwnPhone, updatePreferences } from "@/lib/services/preferences";
import { ownEmailSchema, ownPhoneSchema, preferencesSchema, profileSchema, type FormState } from "@/lib/validators";

/** Guarda una sola preferencia, apenas se cambia en Mi cuenta */
export async function savePreference(field: string, value: string): Promise<FormState> {
  const user = await requireEditor();
  const parsed = preferencesSchema.partial().safeParse({ [String(field)]: value });
  if (!parsed.success || Object.keys(parsed.data).length === 0) return { message: "Esa opción no existe" };
  await updatePreferences(user.id, parsed.data);
  // El color y la moneda se ven en toda la app
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveName(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireEditor();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };
  await updateName(user.id, parsed.data.name);
  revalidatePath("/", "layout");
  return { ok: true, message: "Nombre actualizado" };
}

export async function saveOwnPhone(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireEditor();
  const parsed = ownPhoneSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };
  try {
    await updateOwnPhone(user.id, parsed.data.phone, parsed.data.password);
  } catch (e) {
    if (e instanceof ProfileError) return { errors: { [e.field]: [e.message] } };
    throw e;
  }
  revalidatePath("/cuenta");
  return { ok: true, message: parsed.data.phone ? "WhatsApp actualizado" : "WhatsApp quitado" };
}

export async function saveOwnEmail(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireEditor();
  const parsed = ownEmailSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };
  try {
    await updateOwnEmail(user.id, parsed.data.email, parsed.data.password);
  } catch (e) {
    if (e instanceof ProfileError) return { errors: { [e.field]: [e.message] } };
    throw e;
  }
  if (parsed.data.email !== user.email) await notifyEmailChanged(user.email, parsed.data.email, user.name);
  revalidatePath("/", "layout");
  return { ok: true, message: "Email actualizado: la próxima vez entrás con este." };
}
