import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { mailLayout, sendMail } from "@/lib/mail";

// "Olvidé mi contraseña": se manda por mail un link con un token al azar. En la base se guarda
// solo el hash del token (si alguien viera la base, no podría usar los links). El link vence en
// 1 hora y sirve una sola vez; pedir uno nuevo anula los anteriores. Las invitaciones a cuentas
// nuevas usan el mismo camino (sendInvitation).

export class PasswordResetError extends Error {}

const EXPIRES_MS = 60 * 60 * 1000; // 1 hora
const INVITE_EXPIRES_MS = 48 * 60 * 60 * 1000; // la invitación a una cuenta nueva: 48 horas
const MAX_PER_HOUR = 3; // para que no se pueda llenar de mails la casilla de alguien

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** Dirección de la app para armar el link del mail (APP_URL en el .env) */
function appUrl() {
  return (process.env.APP_URL || "http://localhost:3001").replace(/\/$/, "");
}

/**
 * Manda el mail con el link, si el email es de una cuenta activa. Si no lo es, no hace nada:
 * quien llama responde siempre lo mismo, para no revelar qué emails tienen cuenta.
 */
export async function requestPasswordReset(email: string) {
  const user = await db.user.findUnique({ where: { email }, select: { id: true, name: true, active: true } });
  if (!user?.active) return;

  const recent = await db.passwordReset.count({
    where: { userId: user.id, createdAt: { gt: new Date(Date.now() - EXPIRES_MS) } },
  });
  if (recent >= MAX_PER_HOUR) return;

  const token = randomBytes(32).toString("base64url");
  await db.$transaction([
    // Pedir uno nuevo anula los anteriores que no se usaron
    db.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }),
    db.passwordReset.create({
      data: { userId: user.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + EXPIRES_MS) },
    }),
  ]);

  const link = `${appUrl()}/recuperar/${token}`;
  await sendMail(
    email,
    "Salt: cambiá tu contraseña",
    `Hola ${user.name}:\n\nPara elegir una contraseña nueva, entrá a este link (vence en 1 hora):\n${link}\n\n` +
      "Si no lo pediste vos, ignorá este mail: tu contraseña sigue igual.\n\nSalt",
    mailLayout({
      preheader: "Elegí una contraseña nueva para tu cuenta de Salt.",
      title: "Cambiá tu contraseña",
      paragraphs: [`¡Hola ${user.name}!`, "Nos pediste cambiar la contraseña de Salt. Tocá el botón para elegir una nueva."],
      button: { label: "Elegir contraseña nueva", href: link },
      footnote: [
        "El link vence en 1 hora y se puede usar una sola vez.",
        "Si no lo pediste vos, ignorá este mail: tu contraseña sigue igual.",
      ],
    }),
  );
}

/**
 * Invitación a una cuenta (la manda el admin): el mismo link que "olvidé mi contraseña", pero vence
 * en 48 horas y el mail y la pantalla dan la bienvenida. Anula los links anteriores sin usar.
 */
export async function sendInvitation(userId: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { id: true, name: true, email: true } });
  const token = randomBytes(32).toString("base64url");
  await db.$transaction([
    db.passwordReset.updateMany({ where: { userId, usedAt: null }, data: { usedAt: new Date() } }),
    db.passwordReset.create({
      data: { userId, tokenHash: hash(token), expiresAt: new Date(Date.now() + INVITE_EXPIRES_MS), invite: true },
    }),
  ]);

  const link = `${appUrl()}/recuperar/${token}`;
  await sendMail(
    user.email,
    "Te invitaron a Salt",
    `Hola ${user.name}:\n\nYa tenés tu cuenta en Salt, para anotar tus gastos desde la web o por WhatsApp.\n` +
      `Para entrar, elegí tu contraseña en este link (vence en 48 horas):\n${link}\n\nSalt`,
    mailLayout({
      preheader: "Elegí tu contraseña y empezá a anotar tus gastos.",
      title: "Te damos la bienvenida a Salt",
      paragraphs: [
        `¡Hola ${user.name}!`,
        "Ya tenés tu cuenta en Salt, para anotar tus gastos desde la web o escribiéndole a Chop por WhatsApp.",
        "Tocá el botón para elegir tu contraseña y entrar.",
      ],
      button: { label: "Elegir mi contraseña", href: link },
      footnote: [
        "El link vence en 48 horas y se puede usar una sola vez.",
        `Tu usuario es ${user.email}.`,
      ],
    }),
  );
}

/** El pedido del token, si todavía sirve (no se usó, no venció y la cuenta está activa) */
async function validReset(token: string) {
  const reset = await db.passwordReset.findUnique({
    where: { tokenHash: hash(token) },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      usedAt: true,
      invite: true,
      user: { select: { active: true, email: true, name: true } },
    },
  });
  if (!reset || reset.usedAt || reset.expiresAt < new Date() || !reset.user.active) return null;
  return reset;
}

/** Para la pantalla del link: null si ya no sirve; si sirve, si es una invitación y para quién */
export async function resetLinkInfo(token: string) {
  const reset = await validReset(token);
  return reset && { invite: reset.invite, name: reset.user.name };
}

/** Cambia la contraseña con el token del mail y lo marca como usado */
export async function resetPassword(token: string, password: string) {
  const reset = await validReset(token);
  if (!reset) throw new PasswordResetError("El link venció o ya se usó. Pedí uno nuevo.");
  await db.$transaction([
    // sessionVersion + 1: se cierran las sesiones abiertas (por si alguien más estaba adentro), y se
    // borran los accesos con huella: hay que volver a agregarlos
    db.user.update({
      where: { id: reset.userId },
      data: {
        passwordHash: await bcrypt.hash(password, 10),
        sessionVersion: { increment: 1 },
        passkeys: { deleteMany: {} },
      },
    }),
    db.passwordReset.updateMany({ where: { userId: reset.userId, usedAt: null }, data: { usedAt: new Date() } }),
    // Si el login estaba bloqueado por intentos fallidos, con la contraseña nueva ya puede entrar
    db.loginAttempt.deleteMany({ where: { email: reset.user.email } }),
  ]);
}
