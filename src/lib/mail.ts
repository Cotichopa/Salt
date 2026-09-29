import "server-only";
import nodemailer from "nodemailer";

// Mails de Salt (por ahora, solo el de "olvidé mi contraseña"). Salen desde una cuenta de Gmail
// con una "contraseña de aplicación" (GMAIL_USER y GMAIL_APP_PASSWORD en el .env; se crea en
// https://myaccount.google.com/apppasswords con la verificación en 2 pasos activada).

export class MailError extends Error {}

function transport() {
  const user = process.env.GMAIL_USER;
  // Google la muestra en 4 grupos con espacios: se aceptan con o sin ellos
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s/g, "");
  if (!user || !pass) return null;
  return { user, transporter: nodemailer.createTransport({ service: "gmail", auth: { user, pass } }) };
}

export function isMailEnabled() {
  return transport() !== null;
}

export async function sendMail(to: string, subject: string, text: string, html: string) {
  const mail = transport();
  // Sin configurar (por ejemplo, en pruebas locales) mostramos el mail en la terminal
  if (!mail) {
    console.log(`[mail:simulado] → ${to}: ${subject}\n${text}`);
    return;
  }
  try {
    await mail.transporter.sendMail({ from: `Salt <${mail.user}>`, to, subject, text, html });
  } catch (e) {
    console.error("[mail] no se pudo mandar:", e instanceof Error ? e.message : e);
    throw new MailError("No pudimos mandar el mail. Probá de nuevo en un rato.");
  }
}
