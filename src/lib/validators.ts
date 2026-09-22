import { z } from "zod";
import { parseAmount, todayISO } from "@/lib/format";
import { parseKeywords } from "@/lib/text";

// Reglas de validación compartidas. Se usan en el servidor antes de tocar la base,
// así ningún dato inválido entra, venga de la web o (más adelante) de WhatsApp.

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Email inválido")),
  password: z.string().min(1, "Ingresá tu contraseña"),
});

const passwordRule = z.string().min(8, "Mínimo 8 caracteres");

// WhatsApp identifica a las personas por su número en formato internacional sin "+"
// (ej: 5491122334455). Aceptamos que lo escriban con espacios, guiones o "+".
const phoneRule = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ""))
  // Celulares argentinos: WhatsApp los identifica con un 9 después del 54 (549...).
  // Si lo escribieron sin el 9 (54 11 2233-4455), se lo agregamos.
  .transform((v) => (/^54\d{10}$/.test(v) ? `549${v.slice(2)}` : v))
  .refine((v) => v === "" || (v.length >= 10 && v.length <= 15), "Teléfono inválido (ej: 5491122334455)")
  .transform((v) => (v === "" ? null : v));

export const createUserSchema = z.object({
  name: z.string().trim().min(2, "Ingresá el nombre"),
  email: z.string().trim().toLowerCase().pipe(z.email("Email inválido")),
  phone: phoneRule,
  password: passwordRule,
  role: z.enum(["ADMIN", "MEMBER"]),
});

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, "Ingresá tu contraseña actual"),
    next: passwordRule,
    confirm: z.string(),
  })
  .refine((d) => d.next === d.confirm, { path: ["confirm"], message: "Las contraseñas no coinciden" });

export const updatePhoneSchema = z.object({
  userId: z.string().min(1),
  phone: phoneRule,
});

export const resetPasswordSchema = z.object({
  userId: z.string().min(1),
  password: passwordRule,
});

export const expenseSchema = z.object({
  amount: z
    .string()
    .transform((v, ctx) => {
      const n = parseAmount(v);
      if (n === null || n <= 0) {
        ctx.addIssue({ code: "custom", message: "Monto inválido (ej: 15000 o 15.000,50)" });
        return z.NEVER;
      }
      return n;
    })
    .refine((n) => n < 1_000_000_000_000, "Monto demasiado grande"),
  currency: z.enum(["ARS", "USD"]),
  paymentMethod: z.enum(["CASH", "DEBIT", "CREDIT", "TRANSFER"]),
  categoryId: z.string().min(1, "Elegí una categoría"),
  description: z
    .string()
    .trim()
    .max(200, "Máximo 200 caracteres")
    .transform((v) => v || null),
  date: z.iso.date("Fecha inválida").refine((d) => d <= todayISO(), "La fecha no puede ser futura"),
  // Tarjeta o billetera (opcional). El formulario manda "" cuando no se eligió nada.
  paymentSourceId: z
    .string()
    .optional()
    .transform((v) => v || undefined),
  // Cuotas: se crea un gasto por cuota, uno por mes
  installments: z.coerce
    .number()
    .int()
    .min(1, "Mínimo 1 cuota")
    .max(36, "Máximo 36 cuotas")
    .optional()
    .default(1),
})
  .refine((d) => (d.installments ?? 1) === 1 || d.paymentMethod === "CREDIT", {
    path: ["installments"],
    message: "Las cuotas son solo para tarjeta de crédito",
  })
  .refine((d) => !d.paymentSourceId || d.paymentMethod !== "CASH", {
    path: ["paymentSourceId"],
    message: "El efectivo no lleva tarjeta ni billetera",
  });

export const paymentSourceSchema = z.object({
  name: z.string().trim().min(2, "Mínimo 2 caracteres").max(30, "Máximo 30 caracteres"),
  kind: z.enum(["CARD", "WALLET"]),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;

export const categorySchema = z.object({
  name: z.string().trim().min(2, "Mínimo 2 caracteres").max(30, "Máximo 30 caracteres"),
  emoji: z
    .string()
    .trim()
    .max(8, "Poné un solo emoji")
    .transform((v) => v || null),
  keywords: z
    .string()
    .max(500, "Demasiadas palabras")
    .transform(parseKeywords)
    .refine((k) => k.length <= 30, "Máximo 30 palabras clave"),
});

export type CategoryInput = z.infer<typeof categorySchema>;

// Estado que devuelven las acciones de formularios para mostrar errores o avisos
export type FormState =
  | { ok?: boolean; message?: string; errors?: Record<string, string[] | undefined> }
  | undefined;
