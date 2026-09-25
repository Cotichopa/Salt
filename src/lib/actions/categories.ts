"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { CategoryError, createCategory, deleteCategory, updateCategory } from "@/lib/services/categories";
import { categorySchema, type FormState } from "@/lib/validators";

function revalidate() {
  revalidatePath("/categorias", "layout"); // la lista y la pantalla de cada categoría
  revalidatePath("/gastos");
  revalidatePath("/dashboard");
}

export async function saveCategory(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = categorySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  const id = formData.get("id");
  try {
    if (typeof id === "string" && id) await updateCategory(user.id, id, parsed.data);
    else await createCategory(user.id, parsed.data);
  } catch (e) {
    if (e instanceof CategoryError) return { errors: { name: [e.message] } };
    throw e;
  }
  revalidate();
  return { ok: true, message: id ? "Categoría actualizada" : `Categoría "${parsed.data.name}" creada` };
}

export async function removeCategory(
  id: string,
  opts: { moveTo?: string; deleteExpenses?: boolean } = {},
): Promise<FormState> {
  const user = await requireUser();
  // Una acción se puede invocar a mano con cualquier cosa: nos quedamos solo con lo esperado
  const deleteExpenses = opts?.deleteExpenses === true;
  const moveTo = typeof opts?.moveTo === "string" ? opts.moveTo : undefined;
  try {
    const count = await deleteCategory(user.id, id, { moveTo, deleteExpenses });
    revalidate();
    if (!count) return { ok: true, message: "Categoría eliminada" };
    return {
      ok: true,
      message: `Categoría eliminada (${count} ${count === 1 ? "gasto" : "gastos"} ${deleteExpenses ? "borrados" : "movidos"})`,
    };
  } catch (e) {
    if (e instanceof CategoryError) return { message: e.message };
    throw e;
  }
}
