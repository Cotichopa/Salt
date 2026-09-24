"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { createExpense, deleteExpense, ExpenseError, updateExpense } from "@/lib/services/expenses";
import { budgetAlertFor, budgetAlertText } from "@/lib/services/budgets";
import { expenseSchema, type FormState } from "@/lib/validators";

// Acciones de la web: verifican la sesión, validan y delegan en el servicio de gastos.

export async function saveExpense(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = expenseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  const id = formData.get("id");
  let warning: string | undefined;
  try {
    if (typeof id === "string" && id) {
      await updateExpense(user.id, id, parsed.data);
    } else {
      const created = await createExpense(user.id, parsed.data, "WEB");
      // ¿Con este gasto se llegó al 80 % o al 100 % del presupuesto de la categoría?
      const alert = await budgetAlertFor(user.id, created);
      if (alert) warning = budgetAlertText(alert);
    }
  } catch (e) {
    if (e instanceof ExpenseError) return { message: e.message };
    throw e;
  }
  revalidatePath("/gastos");
  revalidatePath("/dashboard");
  revalidatePath("/categorias", "layout"); // la lista y la pantalla de cada categoría
  return { ok: true, message: id ? "Gasto actualizado" : "Gasto cargado", warning };
}

export async function removeExpense(id: string, scope: "one" | "purchase" = "one"): Promise<FormState> {
  const user = await requireUser();
  let deleted = 1;
  try {
    deleted = await deleteExpense(user.id, id, scope);
  } catch (e) {
    if (e instanceof ExpenseError) return { message: e.message };
    throw e;
  }
  revalidatePath("/gastos");
  revalidatePath("/dashboard");
  revalidatePath("/categorias", "layout"); // la lista y la pantalla de cada categoría
  return { ok: true, message: deleted > 1 ? `${deleted} cuotas eliminadas` : "Gasto eliminado" };
}
