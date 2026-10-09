"use server";

import { trackChop } from "@/lib/whatsapp/usage";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireEditor } from "@/lib/dal";
import { createExpense, deleteExpense, ExpenseError, updateExpense } from "@/lib/services/expenses";
import { budgetAlertFor, budgetAlertText } from "@/lib/services/budgets";
import { cardWithoutClosingDay } from "@/lib/services/payment-sources";
import { tryGetRate } from "@/lib/services/exchange-rates";
import { dollarTypeLabels, type CurrencyCode, type DollarTypeCode, type PaymentMethodCode } from "@/lib/format";
import { expenseSchema, type FormState } from "@/lib/validators";
import { kindForMethod } from "@/lib/services/payment-sources";
import { ReceiptError } from "@/lib/services/receipts";
import { readReceipt, receiptKind, storeReceipt } from "@/lib/services/receipt-reading";
import { isAiEnabled, matchByName } from "@/lib/whatsapp/ai-parser";

// Acciones de la web: verifican la sesión, validan y delegan en el servicio de gastos.

export async function saveExpense(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireEditor();
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
  await requireEditor();
  if (!(type in dollarTypeLabels) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return tryGetRate(type as DollarTypeCode, date);
}

export async function removeExpense(id: string, scope: "one" | "purchase" = "one"): Promise<FormState> {
  const user = await requireEditor();
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

/** Lo que se leyó del ticket, listo para completar el formulario de gasto */
export type ReceiptFill = {
  amount: number;
  currency: CurrencyCode;
  date: string;
  categoryId: string | null;
  paymentMethod: PaymentMethodCode | null;
  sourceId: string | null;
  installments: number;
  description: string | null;
};

export type ReceiptRead =
  | { ok: false; message: string }
  | { ok: true; receiptId: string; kind: "image" | "pdf"; fill: ReceiptFill | null; message: string };

// Hasta 5 MB, como por WhatsApp y el chat (el límite de las Server Actions es 6 MB: next.config.ts)
const MAX_RECEIPT_BYTES = 5_000_000;

/**
 * "Adjuntar ticket" del formulario de gasto: guarda la foto o el PDF y, con `fill`, la IA lo lee
 * (igual que Chop, con el comercio conocido por su CUIT) y devuelve los datos para completar el
 * formulario. Sin `fill` (al editar un gasto) solo lo adjunta. El ticket queda con el gasto al
 * guardarlo; si no se guarda, se borra solo al día siguiente.
 */
export async function readReceiptForForm(formData: FormData): Promise<ReceiptRead> {
  const user = await requireEditor();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, message: "No pude recibir el archivo. Probá de nuevo." };
  const kind = receiptKind(file.type);
  if (!kind) return { ok: false, message: "Ese archivo no lo puedo leer: adjuntá el ticket como foto o como PDF." };
  if (file.size > MAX_RECEIPT_BYTES) return { ok: false, message: "Ese archivo es muy grande (el máximo es 5 MB)." };
  const data = Buffer.from(await file.arrayBuffer());

  try {
    if (formData.get("fill") !== "1" || !isAiEnabled()) {
      const { id } = await storeReceipt(user.id, data, kind);
      const message = formData.get("fill") === "1" ? "Ticket adjunto. No lo puedo leer (la IA no está activada): completá los datos." : "Ticket adjunto.";
      return { ok: true, receiptId: id, kind, fill: null, message };
    }

    // Es una consulta a la IA como las de Chop: cuenta en el gasto de IA del Resumen
    const { receiptId, parsed, categories, sources } = await trackChop(
      { userId: user.id, source: "WEB", kind: "ticket del formulario" },
      () => readReceipt(user.id, data, kind),
    );
    const e = parsed?.intent === "cargar" ? parsed.expenses[0] : null;
    if (!e) {
      const why = parsed?.intent === "otro" && parsed.question ? ` (${parsed.question})` : "";
      const message = parsed
        ? `No pude sacar el gasto del ticket${why}. Quedó adjunto: completá los datos.`
        : "No pude leer el ticket: la IA no respondió. Quedó adjunto: completá los datos.";
      return { ok: true, receiptId, kind, fill: null, message };
    }
    // Igual que Chop: la tarjeta o billetera solo vale si corresponde al medio; una billetera sin
    // medio es transferencia
    const named = matchByName(sources, e.sourceName);
    const method = e.paymentMethod ?? (named?.kind === "WALLET" ? "TRANSFER" : null);
    const source = named && method && named.kind === kindForMethod(method) ? named : null;
    const fill: ReceiptFill = {
      amount: e.amount,
      currency: e.currency,
      date: e.date,
      categoryId: matchByName(categories, e.categoryName)?.id ?? null,
      paymentMethod: method,
      sourceId: source?.id ?? null,
      installments: method === "CREDIT" ? e.installments : 1,
      description: e.description,
    };
    return { ok: true, receiptId, kind, fill, message: "Completé el formulario con lo que leí del ticket: revisalo antes de guardar." };
  } catch (err) {
    if (err instanceof ReceiptError) {
      return { ok: false, message: kind === "pdf" ? "No pude leer ese PDF. Probá con una foto del ticket." : "No pude abrir esa imagen. Probá con otra foto." };
    }
    throw err;
  }
}
