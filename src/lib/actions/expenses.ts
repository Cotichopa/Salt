"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { createExpense, deleteExpense, ExpenseError, updateExpense } from "@/lib/services/expenses";
import { budgetAlertFor, budgetAlertText } from "@/lib/services/budgets";
import { cardWithoutClosingDay } from "@/lib/services/payment-sources";
import { tryGetRate } from "@/lib/services/exchange-rates";
import { dollarTypeLabels, type DollarTypeCode } from "@/lib/format";
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
  // Con crédito en una tarjeta sin día de cierre, el gasto no aparece en ningún resumen: avisamos
  const { paymentMethod, paymentSourceId } = parsed.data;
  const card = paymentMethod === "CREDIT" && paymentSourceId ? await cardWithoutClosingDay(user.id, paymentSourceId) : null;
  if (card) {
    const hint = `Para verlo en el resumen de ${card}, poné su día de cierre en Tarjetas.`;
    warning = warning ? `${warning} ${hint}` : hint;
  }

  revalidatePath("/gastos");
  revalidatePath("/dashboard");
  revalidatePath("/categorias", "layout"); // la lista y la pantalla de cada categoría
  revalidatePath("/medios", "layout"); // los resúmenes de cada tarjeta
  return { ok: true, message: id ? "Gasto actualizado" : "Gasto cargado", warning };
}

/** Cotización de un dólar en una fecha, para precargarla en el formulario (null si no hay) */
export async function getRateAction(type: string, date: string) {
  await requireUser();
  if (!(type in dollarTypeLabels) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return tryGetRate(type as DollarTypeCode, date);
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
  revalidatePath("/medios", "layout"); // los resúmenes de cada tarjeta
  return { ok: true, message: deleted > 1 ? `${deleted} cuotas eliminadas` : "Gasto eliminado" };
}
