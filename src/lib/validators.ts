import { z } from "zod";
import { dollarTypeLabels, parseAmount, todayISO, type DollarTypeCode } from "@/lib/format";
import { parseKeywords } from "@/lib/text";
import { CATEGORY_ICON_INFO, CATEGORY_ICON_KEYS } from "@/lib/category-icon-data";

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

// "Olvidé mi contraseña": primero el email, después la contraseña nueva (con el token del mail)
export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Email inválido")),
});

export const newPasswordSchema = z
  .object({
    token: z.string().min(1),
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

const DOLLAR_TYPES = Object.keys(dollarTypeLabels) as [DollarTypeCode, ...DollarTypeCode[]];

// Monto escrito "a la argentina" ("15.000", "15000,50") → número positivo
const amountRule = z
  .string()
  .transform((v, ctx) => {
    const n = parseAmount(v);
    if (n === null || n <= 0) {
      ctx.addIssue({ code: "custom", message: "Monto inválido (ej: 15000 o 15.000,50)" });
      return z.NEVER;
    }
    return n;
  })
  .refine((n) => n < 1_000_000_000_000, "Monto demasiado grande");

export const expenseSchema = z.object({
  amount: amountRule,
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
  // Gastos en USD: a qué dólar y a qué cotización (vacía = la del día, se busca sola)
  dollarType: z.preprocess((v) => v || undefined, z.enum(DOLLAR_TYPES).optional()),
  rate: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v?.trim()) return undefined;
      const n = parseAmount(v);
      if (n === null || n <= 0) {
        ctx.addIssue({ code: "custom", message: "Cotización inválida (ej: 1557 o 1.557,30)" });
        return z.NEVER;
      }
      return n;
    }),
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
  })
  // Con crédito no se elige: siempre es el oficial (ver dollarTypeFor en format.ts)
  .refine((d) => d.currency !== "USD" || d.paymentMethod === "CREDIT" || d.dollarType, {
    path: ["dollarType"],
    message: "Elegí qué dólar usaste",
  });

// Día del mes (1 a 31), opcional: el formulario manda "" cuando se deja vacío
const dayOfMonth = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.coerce.number().int("Día inválido").min(1, "Entre 1 y 31").max(31, "Entre 1 y 31").nullable(),
);

export const paymentSourceSchema = z
  .object({
    name: z.string().trim().min(2, "Mínimo 2 caracteres").max(30, "Máximo 30 caracteres"),
    kind: z.enum(["CARD", "WALLET"]),
    // Solo tarjetas: para armar el resumen de cada mes
    closingDay: dayOfMonth,
    dueDay: dayOfMonth,
  })
  .refine((d) => (d.closingDay === null) === (d.dueDay === null), {
    path: ["dueDay"],
    message: "Completá los dos días (o ninguno)",
  })
  // Las billeteras no tienen resumen
  .transform((d) => (d.kind === "CARD" ? d : { ...d, closingDay: null, dueDay: null }));

export type PaymentSourceInput = z.infer<typeof paymentSourceSchema>;

// Fechas de un resumen puntual, cuando el banco las mueve
export const statementDatesSchema = z
  .object({
    cardId: z.string().min(1),
    month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    closingDate: z.iso.date("Fecha inválida"),
    dueDate: z.iso.date("Fecha inválida"),
  })
  .refine((d) => d.dueDate > d.closingDate, { path: ["dueDate"], message: "El vencimiento va después del cierre" });

// Monto opcional a la argentina (vacío = no vino). `allowZero`: el total pagado puede ser 0
// (si todo el resumen era en dólares y se pagó en dólares).
const optionalAmount = (label: string, allowZero = false) =>
  z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v?.trim()) return undefined;
      const n = v.trim() === "0" ? 0 : parseAmount(v);
      if (n === null || n < 0 || (!allowZero && n === 0)) {
        ctx.addIssue({ code: "custom", message: `${label} inválido` });
        return z.NEVER;
      }
      return n;
    });

// Marcar un resumen de tarjeta como pagado
export const statementPaymentSchema = z.object({
  cardId: z.string().min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  paidOn: z.iso.date("Fecha inválida").refine((d) => d <= todayISO(), "La fecha no puede ser futura"),
  usdPaidIn: z.preprocess((v) => v || "ARS", z.enum(["ARS", "USD"])),
  rate: optionalAmount("Dólar"),
  totalArs: optionalAmount("Total", true).refine((n) => n !== undefined, "Poné cuánto pagaste en pesos"),
});

export type ExpenseInput = z.infer<typeof expenseSchema>;

// Gasto fijo: como un gasto, pero con día del mes en vez de fecha (y sin cotización: se usa
// la del día en que se carga cada mes)
export const recurringSchema = z
  .object({
    description: z.string().trim().min(2, "Mínimo 2 caracteres").max(60, "Máximo 60 caracteres"),
    amount: amountRule,
    currency: z.enum(["ARS", "USD"]),
    dollarType: z.preprocess((v) => v || undefined, z.enum(DOLLAR_TYPES).optional()),
    paymentMethod: z.enum(["CASH", "DEBIT", "CREDIT", "TRANSFER"]),
    paymentSourceId: z
      .string()
      .optional()
      .transform((v) => v || undefined),
    categoryId: z.string().min(1, "Elegí una categoría"),
    day: z.coerce.number("Día inválido").int("Día inválido").min(1, "Entre 1 y 31").max(31, "Entre 1 y 31"),
    // Al crearlo, si el día de este mes ya pasó: ¿cargar también el de este mes? ("yes" / "no")
    loadThisMonth: z.preprocess((v) => v === "yes", z.boolean()),
    // Al cambiar el monto: ¿desde este mes o desde el próximo?
    from: z.preprocess((v) => v || "this", z.enum(["this", "next"])),
  })
  .refine((d) => !d.paymentSourceId || d.paymentMethod !== "CASH", {
    path: ["paymentSourceId"],
    message: "El efectivo no lleva tarjeta ni billetera",
  })
  .refine((d) => d.currency !== "USD" || d.paymentMethod === "CREDIT" || d.dollarType, {
    path: ["dollarType"],
    message: "Elegí qué dólar usás",
  });

export type RecurringInput = z.infer<typeof recurringSchema>;

export const categorySchema = z
  .object({
    name: z.string().trim().min(2, "Mínimo 2 caracteres").max(30, "Máximo 30 caracteres"),
    icon: z.enum(CATEGORY_ICON_KEYS, "Elegí un ícono"),
    keywords: z
      .string()
      .max(500, "Demasiadas palabras")
      .transform(parseKeywords)
      .refine((k) => k.length <= 30, "Máximo 30 palabras clave"),
  })
  // El emoji no se elige: sale del ícono (es el que Chop muestra en WhatsApp)
  .transform((c) => ({ ...c, emoji: CATEGORY_ICON_INFO[c.icon].emoji }));

export type CategoryInput = z.infer<typeof categorySchema>;

export const budgetSchema = z.object({
  categoryId: z.string().min(1),
  amount: amountRule,
});

// Estado que devuelven las acciones de formularios para mostrar errores o avisos
export type FormState =
  | {
      ok?: boolean;
      message?: string;
      warning?: string; // aviso extra, por ejemplo "te pasaste del presupuesto"
      errors?: Record<string, string[] | undefined>;
    }
  | undefined;
