"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import {
  createPaymentSource,
  deletePaymentSource,
  PaymentSourceError,
  updatePaymentSource,
} from "@/lib/services/payment-sources";
import { paymentSourceSchema, type FormState } from "@/lib/validators";

function revalidate() {
  revalidatePath("/medios");
  revalidatePath("/gastos");
  revalidatePath("/dashboard");
}

export async function savePaymentSource(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = paymentSourceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: z.flattenError(parsed.error).fieldErrors };

  const id = formData.get("id");
  try {
    if (typeof id === "string" && id) await updatePaymentSource(user.id, id, parsed.data.name, parsed.data.kind);
    else await createPaymentSource(user.id, parsed.data.name, parsed.data.kind);
  } catch (e) {
    if (e instanceof PaymentSourceError) return { errors: { name: [e.message] } };
    throw e;
  }
  revalidate();
  return { ok: true, message: id ? "Actualizado" : `"${parsed.data.name}" agregado` };
}

export async function removePaymentSource(id: string): Promise<FormState> {
  const user = await requireUser();
  try {
    await deletePaymentSource(user.id, id);
  } catch (e) {
    if (e instanceof PaymentSourceError) return { message: e.message };
    throw e;
  }
  revalidate();
  return { ok: true, message: "Eliminado" };
}
