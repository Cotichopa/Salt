import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { DollarTypeCode } from "@/lib/format";
import type { Section } from "@/lib/whatsapp/ai-parser";

// "Memoria" de la conversación: en qué paso del menú está cada teléfono y qué datos
// fue juntando (por ejemplo, la categoría elegida mientras espera el monto).
// Se guarda en la tabla wa_sessions para que no se pierda si el servidor se reinicia.

const EXPIRES_MS = 15 * 60 * 1000; // si pasan 15 minutos sin responder, arranca de cero

export type PendingExpense = {
  categoryId: string;
  categoryLabel: string;
  amount: number;
  currency: "ARS" | "USD";
  paymentMethod: "CASH" | "DEBIT" | "CREDIT" | "TRANSFER";
  description: string | null;
  date: string;
  guessedMethod?: boolean; // true si el medio de pago lo dedujimos nosotros
  sourceId?: string | null; // tarjeta o billetera
  sourceName?: string | null;
  installments?: number;
  dollarType?: DollarTypeCode; // en USD sin crédito: a qué dólar se pagó (se pregunta antes de guardar)
};

/** Una opción de una confirmación: botón "act:<id>" y palabras que valen escritas */
export type ActionOption = { id: string; title: string; words?: string[] };

/**
 * Algo que Chop va a hacer cuando la persona confirme (crear un fijo, pausarlo...).
 * `type` dice qué hacer (ver sections/index.ts) y `data` con qué; `body` y `options` sirven para
 * volver a preguntar si contesta otra cosa. La opción elegida se le pasa a la acción.
 */
export type PendingAction = { type: string; data: Record<string, unknown>; body: string; options: ActionOption[] };

/** Un gasto fijo que se está creando: Chop pregunta lo que falte, en orden */
export type FixedDraft = {
  description: string;
  amount: number;
  currency: "ARS" | "USD";
  categoryId?: string;
  categoryLabel?: string;
  day?: number;
  paymentMethod?: "CASH" | "DEBIT" | "CREDIT" | "TRANSFER";
  sourceId?: string | null;
  sourceName?: string | null;
  askedSource?: boolean;
  dollarType?: DollarTypeCode;
};

/** Una tarjeta o billetera que se está agregando con los botones */
export type NewSourceDraft = { kind?: "CARD" | "WALLET"; name?: string };

export type Draft = {
  action?: PendingAction;
  fixed?: FixedDraft;
  newSource?: NewSourceDraft;
  budgetCategoryId?: string; // presupuesto que se está poniendo con los botones: falta el monto
  // Chop hizo una pregunta: la respuesta se interpreta junto con el mensaje original (sin sección = IA principal)
  followup?: { section?: Section; text: string; question: string };
  pending?: PendingExpense[];
  receiptId?: string; // ticket (foto o PDF) de estos gastos: se guarda con ellos
  heading?: string; // título de la confirmación ("📄 Esto leí de la factura"), aunque antes pregunte algo
  categoryId?: string;
  categoryLabel?: string;
  amount?: number;
  currency?: "ARS" | "USD";
  paymentMethod?: "CASH" | "DEBIT" | "CREDIT" | "TRANSFER";
  description?: string | null;
  date?: string;
  sourceId?: string | null; // carga paso a paso: tarjeta o billetera elegida con el medio
  sourceName?: string | null;
  expenseId?: string;
  page?: number;
  // Para editar por texto: qué gasto y con qué valores queda
  edit?: {
    expenseId: string;
    before: string;
    after: string;
    values: {
      categoryId: string;
      amount: number;
      currency: "ARS" | "USD";
      paymentMethod: "CASH" | "DEBIT" | "CREDIT" | "TRANSFER";
      paymentSourceId?: string;
      description: string | null;
      date: string;
    };
  };
  // Para completar la tarjeta o billetera antes de guardar
  missing?: "source"[];
  askedSource?: boolean; // ya se preguntó la tarjeta o billetera (si no eligió, se guarda sin)
  confirmed?: boolean; // ya dijo "Guardar": lo que falte preguntar (el dólar) no vuelve a pedir confirmación
};

export type Session = { state: string; data: Draft };

export async function getSession(phone: string): Promise<Session | null> {
  const s = await db.waSession.findUnique({ where: { phone } });
  if (!s || Date.now() - s.updatedAt.getTime() > EXPIRES_MS) return null;
  return { state: s.state, data: (s.data ?? {}) as Draft };
}

export async function setSession(phone: string, state: string, data: Draft = {}) {
  const json = data as Prisma.InputJsonValue;
  await db.waSession.upsert({ where: { phone }, update: { state, data: json }, create: { phone, state, data: json } });
}

export async function clearSession(phone: string) {
  await db.waSession.deleteMany({ where: { phone } });
}
