import "server-only";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import type { CurrencyCode, DollarTypeCode, PaymentMethodCode } from "@/lib/format";
import { accentOf, homePageOf, type AccentColor, type HomePage } from "@/lib/preferences";

// Preferencias y perfil de cada cuenta (se cambian en "Cuenta"): con qué pantalla abre la app, en
// qué moneda se ven los totales, el color, y qué medio de pago y dólar se proponen primero al cargar.

/** Error al cambiar el perfil, con el campo del formulario donde se muestra */
export class ProfileError extends Error {
  constructor(
    readonly field: "phone" | "password",
    message: string,
  ) {
    super(message);
  }
}

export type Preferences = {
  homePage: HomePage;
  defaultCurrency: CurrencyCode;
  accentColor: AccentColor;
  defaultPaymentMethod: PaymentMethodCode;
  defaultDollarType: DollarTypeCode;
};

/** Las preferencias de la persona (`cache`: una sola consulta por carga de página) */
export const getPreferences = cache(async (userId: string): Promise<Preferences> => {
  const u = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { homePage: true, defaultCurrency: true, accentColor: true, defaultPaymentMethod: true, defaultDollarType: true },
  });
  return { ...u, homePage: homePageOf(u.homePage), accentColor: accentOf(u.accentColor) };
});

export async function updatePreferences(userId: string, prefs: Preferences) {
  await db.user.update({ where: { id: userId }, data: prefs });
}

/** El nombre es el que usa Chop para saludar ("¡Hola Felo!") */
export async function updateName(userId: string, name: string) {
  await db.user.update({ where: { id: userId }, data: { name } });
}

/** Cambiar el propio WhatsApp: pide la contraseña actual, porque el número también sirve para usar Chop */
export async function updateOwnPhone(userId: string, phone: string | null, password: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  if (!(await bcrypt.compare(password, user.passwordHash))) throw new ProfileError("password", "Contraseña incorrecta");
  try {
    await db.user.update({ where: { id: userId }, data: { phone } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ProfileError("phone", "Ese número ya está en otra cuenta");
    }
    throw e;
  }
}
