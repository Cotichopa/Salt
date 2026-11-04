import "server-only";
import { cache } from "react";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { MailError, mailLayout, sendMail } from "@/lib/mail";
import { Prisma } from "@/generated/prisma/client";
import type { CurrencyCode, DollarTypeCode, PaymentMethodCode } from "@/lib/format";
import { accentOf, homePageOf, type AccentColor, type HomePage } from "@/lib/preferences";

// Preferencias y perfil de cada cuenta (se cambian en "Cuenta"): con qué pantalla abre la app, en
// qué moneda se ven los totales, el color, y qué medio de pago y dólar se proponen primero al cargar.

/** Error al cambiar el perfil, con el campo del formulario donde se muestra */
export class ProfileError extends Error {
  constructor(
    readonly field: "phone" | "email" | "password",
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

export async function updatePreferences(userId: string, prefs: Partial<Preferences>) {
  await db.user.update({ where: { id: userId }, data: prefs });
}

/** El nombre es el que usa Chop para saludar ("¡Hola Felo!") */
export async function updateName(userId: string, name: string) {
  await db.user.update({ where: { id: userId }, data: { name } });
}

/** Cambiar el propio email: pide la contraseña actual, porque es con lo que se entra a Salt */
export async function updateOwnEmail(userId: string, email: string, password: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { passwordHash: true } });
  if (!(await bcrypt.compare(password, user.passwordHash))) throw new ProfileError("password", "Contraseña incorrecta");
  try {
    await db.user.update({ where: { id: userId }, data: { email } });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ProfileError("email", "Ese email ya está en otra cuenta");
    }
    throw e;
  }
}

/**
 * Le avisa a la dirección anterior que el email de la cuenta cambió: si no fue la persona, es la
 * única forma de enterarse. Si el mail falla, el cambio ya está hecho y no se deshace.
 */
export async function notifyEmailChanged(oldEmail: string, newEmail: string, name: string) {
  try {
    await sendMail(
      oldEmail,
      "Salt: cambió el email de tu cuenta",
      `Hola ${name}:\n\nEl email de tu cuenta de Salt ahora es ${newEmail}. Si fuiste vos, no tenés que hacer nada.\n` +
        "Si no fuiste vos, avisale enseguida a quien administra Salt.\n\nSalt",
      mailLayout({
        preheader: `El email de tu cuenta de Salt ahora es ${newEmail}.`,
        title: "Cambió el email de tu cuenta",
        paragraphs: [`¡Hola ${name}!`, `El email de tu cuenta de Salt ahora es ${newEmail}. Si fuiste vos, no tenés que hacer nada.`],
        footnote: ["Si no fuiste vos, avisale enseguida a quien administra Salt."],
      }),
    );
  } catch (e) {
    if (!(e instanceof MailError)) throw e; // el detalle ya quedó en los errores del servidor
  }
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
