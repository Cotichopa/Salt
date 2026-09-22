import { z } from "zod";

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

export const resetPasswordSchema = z.object({
  userId: z.string().min(1),
  password: passwordRule,
});

// Estado que devuelven las acciones de formularios para mostrar errores o avisos
export type FormState =
  | { ok?: boolean; message?: string; errors?: Record<string, string[] | undefined> }
  | undefined;
