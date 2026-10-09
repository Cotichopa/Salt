"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireEditor } from "@/lib/dal";
import { deleteTag, renameTag, TagError } from "@/lib/services/tags";
import type { FormState } from "@/lib/validators";

// Acciones de la pantalla de cada etiqueta (/etiquetas/<id>): cambiarle el nombre o borrarla

/** Las pantallas que muestran etiquetas: la lista, cada una y los gastos */
function revalidate() {
  revalidatePath("/etiquetas", "layout");
  revalidatePath("/gastos");
  revalidatePath("/categorias", "layout");
  revalidatePath("/medios", "layout");
}

export async function renameTagAction(id: string, name: string): Promise<FormState> {
  const user = await requireEditor();
  if (typeof id !== "string" || typeof name !== "string") return { message: "Datos inválidos" };
  try {
    await renameTag(user.id, id, name);
  } catch (e) {
    if (e instanceof TagError) return { message: e.message };
    throw e;
  }
  revalidate();
  return { ok: true, message: "Etiqueta renombrada" };
}

export async function deleteTagAction(id: string): Promise<FormState> {
  const user = await requireEditor();
  if (typeof id !== "string") return { message: "Datos inválidos" };
  try {
    await deleteTag(user.id, id);
  } catch (e) {
    if (e instanceof TagError) return { message: e.message };
    throw e;
  }
  revalidate();
  redirect("/etiquetas");
}
