import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { mailLayout, sendMail } from "@/lib/mail";

// "Olvidé mi contraseña": se manda por mail un link con un token al azar. En la base se guarda
// solo el hash del token (si alguien viera la base, no podría usar los links). El link vence en
// 1 hora y sirve una sola vez; pedir uno nuevo anula los anteriores.

export class PasswordResetError extends Error {}

const EXPIRES_MS = 60 * 60 * 1000; // 1 hora
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

/** El pedido del token, si todavía sirve (no se usó, no venció y la cuenta está activa) */
async function validReset(token: string) {
  const reset = await db.passwordReset.findUnique({
    where: { tokenHash: hash(token) },
    select: { id: true, userId: true, expiresAt: true, usedAt: true, user: { select: { active: true } } },
  });
  if (!reset || reset.usedAt || reset.expiresAt < new Date() || !reset.user.active) return null;
  return reset;
}

export async function isResetTokenValid(token: string) {
  return (await validReset(token)) !== null;
}

/** Cambia la contraseña con el token del mail y lo marca como usado */
export async function resetPassword(token: string, password: string) {
  const reset = await validReset(token);
  if (!reset) throw new PasswordResetError("El link venció o ya se usó. Pedí uno nuevo.");
  await db.$transaction([
    db.user.update({ where: { id: reset.userId }, data: { passwordHash: await bcrypt.hash(password, 10) } }),
    db.passwordReset.updateMany({ where: { userId: reset.userId, usedAt: null }, data: { usedAt: new Date() } }),
  ]);
}
