import "server-only";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";

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
};

export type Draft = {
  pending?: PendingExpense[];
  categoryId?: string;
  categoryLabel?: string;
  amount?: number;
  currency?: "ARS" | "USD";
  paymentMethod?: "CASH" | "DEBIT" | "CREDIT" | "TRANSFER";
  description?: string | null;
  date?: string;
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
  // Para completar datos que faltan de la propuesta
  missing?: ("description" | "source")[];
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
