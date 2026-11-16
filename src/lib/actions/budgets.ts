"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireEditor } from "@/lib/dal";
import { BudgetError, removeBudget, setBudget } from "@/lib/services/budgets";
import { budgetSchema, type FormState } from "@/lib/validators";

// Acciones de presupuestos: verifican la sesión, validan y delegan en el servicio.

function revalidate() {
  revalidatePath("/categorias", "layout");
  revalidatePath("/dashboard");
}

export async function saveBudget(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireEditor();
  const parsed = budgetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  try {
    await setBudget(user.id, parsed.data.categoryId, parsed.data.amount);
  } catch (e) {
    if (e instanceof BudgetError) return { errors: { amount: [e.message] } };
    throw e;
  }
  revalidate();
  return { ok: true, message: "Presupuesto guardado" };
}

export async function deleteBudget(categoryId: string): Promise<FormState> {
  const user = await requireEditor();
  const removed = await removeBudget(user.id, categoryId);
  revalidate();
  // Antes decía "eliminado" siempre, aunque esa categoría no tuviera presupuesto (o el id fuera de otra
  // cuenta, en cuyo caso no borra nada): ahora el mensaje dice lo que realmente pasó.
  return removed > 0
    ? { ok: true, message: "Presupuesto eliminado" }
    : { ok: true, message: "Esa categoría no tenía presupuesto" };
}
