"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { createExpense, deleteExpense, ExpenseError, updateExpense } from "@/lib/services/expenses";
import { expenseSchema, type FormState } from "@/lib/validators";

// Acciones de la web: verifican la sesión, validan y delegan en el servicio de gastos.

export async function saveExpense(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = expenseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  const id = formData.get("id");
  try {
    if (typeof id === "string" && id) {
      await updateExpense(user.id, id, parsed.data);
    } else {
      await createExpense(user.id, parsed.data, "WEB");
    }
  } catch (e) {
    if (e instanceof ExpenseError) return { message: e.message };
    throw e;
  }
  revalidatePath("/gastos");
  revalidatePath("/dashboard");
  return { ok: true, message: id ? "Gasto actualizado" : "Gasto cargado" };
}

export async function removeExpense(id: string): Promise<FormState> {
  const user = await requireUser();
  try {
    await deleteExpense(user.id, id);
  } catch (e) {
    if (e instanceof ExpenseError) return { message: e.message };
    throw e;
  }
  revalidatePath("/gastos");
  revalidatePath("/dashboard");
  return { ok: true, message: "Gasto eliminado" };
}
