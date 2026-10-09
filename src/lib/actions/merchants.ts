"use server";

import { revalidatePath } from "next/cache";
import { requireEditor } from "@/lib/dal";
import { forgetMerchant, MerchantError, moveMerchant } from "@/lib/services/merchants";
import type { FormState } from "@/lib/validators";

// Acciones de los comercios (tickets por CUIT) que se ven en la pantalla de cada categoría

export async function changeMerchantCategory(id: string, categoryId: string): Promise<FormState> {
  const user = await requireEditor();
  if (typeof id !== "string" || typeof categoryId !== "string") return { message: "Datos inválidos" };
  try {
    await moveMerchant(user.id, id, categoryId);
  } catch (e) {
    if (e instanceof MerchantError) return { message: e.message };
    throw e;
  }
  revalidatePath("/categorias", "layout");
  return { ok: true, message: "Comercio cambiado de categoría" };
}

export async function removeMerchant(id: string): Promise<FormState> {
  const user = await requireEditor();
  if (typeof id !== "string") return { message: "Datos inválidos" };
  await forgetMerchant(user.id, id);
  revalidatePath("/categorias", "layout");
  return { ok: true, message: "Comercio olvidado" };
}
