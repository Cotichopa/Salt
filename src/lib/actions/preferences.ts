"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { ProfileError, updateName, updateOwnPhone, updatePreferences } from "@/lib/services/preferences";
import { ownPhoneSchema, preferencesSchema, profileSchema, type FormState } from "@/lib/validators";

export async function savePreferences(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = preferencesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };
  await updatePreferences(user.id, parsed.data);
  // El color y la moneda se ven en toda la app
  revalidatePath("/", "layout");
  return { ok: true, message: "Preferencias guardadas" };
}

export async function saveName(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };
  await updateName(user.id, parsed.data.name);
  revalidatePath("/", "layout");
  return { ok: true, message: "Nombre actualizado" };
}

export async function saveOwnPhone(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
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
