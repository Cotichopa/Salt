"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import {
  markStatementPaid,
  resetStatementDates,
  setStatementDates,
  StatementError,
  unmarkStatementPaid,
} from "@/lib/services/card-statements";
import { statementDatesSchema, statementPaymentSchema, type FormState } from "@/lib/validators";

// Corregir (o volver al día fijo) las fechas de un resumen puntual de una tarjeta

export async function saveStatementDates(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = statementDatesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  const { cardId, month, closingDate, dueDate } = parsed.data;
  try {
    await setStatementDates(user.id, cardId, month, closingDate, dueDate);
  } catch (e) {
    if (e instanceof StatementError) return { message: e.message };
    throw e;
  }
  revalidatePath("/medios", "layout");
  return { ok: true, message: "Fechas del resumen actualizadas" };
}

export async function resetStatementDatesAction(cardId: string, month: string): Promise<FormState> {
  const user = await requireUser();
  try {
    await resetStatementDates(user.id, cardId, month);
  } catch (e) {
    if (e instanceof StatementError) return { message: e.message };
    throw e;
  }
  revalidatePath("/medios", "layout");
  return { ok: true, message: "El resumen volvió a las fechas de siempre" };
}

export async function markPaid(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = statementPaymentSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  const { cardId, month, paidOn, usdPaidIn, rate, totalArs } = parsed.data;
  try {
    await markStatementPaid(user.id, cardId, month, { paidOn, usdPaidIn, rate, totalArs: totalArs! });
  } catch (e) {
    if (e instanceof StatementError) return { message: e.message };
    throw e;
  }
  revalidatePath("/medios", "layout");
  return { ok: true, message: "Resumen marcado como pagado" };
}

export async function unmarkPaid(cardId: string, month: string): Promise<FormState> {
  const user = await requireUser();
  try {
    await unmarkStatementPaid(user.id, cardId, month);
  } catch (e) {
    if (e instanceof StatementError) return { message: e.message };
    throw e;
  }
  revalidatePath("/medios", "layout");
  return { ok: true, message: "Listo, el resumen volvió a figurar sin pagar" };
}
