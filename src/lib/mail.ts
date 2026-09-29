import "server-only";
import path from "node:path";
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
    await mail.transporter.sendMail({
      from: `Salt <${mail.user}>`,
      to,
      subject,
      text,
      html,
      // El ánfora va adjunta e "incrustada" (cid): Gmail no muestra SVG ni imágenes de afuera sin permiso
      attachments: html.includes(`cid:${LOGO_CID}`)
        ? [{ filename: "salt.png", path: path.join(process.cwd(), "public/icons/icon-192.png"), cid: LOGO_CID }]
        : [],
    });
  } catch (e) {
    console.error("[mail] no se pudo mandar:", e instanceof Error ? e.message : e);
    throw new MailError("No pudimos mandar el mail. Probá de nuevo en un rato.");
  }
}

// ---------- Diseño de los mails ----------
// Los programas de mail (Gmail, Outlook...) ignoran casi todo el CSS moderno: por eso se arma con
// tablas y estilos en línea. Tarjeta blanca sobre fondo gris, con el ánfora, el texto, un botón
// y "Made by Estilo" al pie.

const LOGO_CID = "logo@salt";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** El HTML completo de un mail. `paragraphs` y `footnote` son texto (se escapan acá). */
export function mailLayout({
  preheader,
  title,
  paragraphs,
  button,
  footnote,
}: {
  preheader: string; // el resumen que muestra la bandeja de entrada al lado del asunto
  title: string;
  paragraphs: string[];
  button: { label: string; href: string };
  footnote: string[];
}) {
  const p = (text: string) =>
    `<p style="margin:0 0 16px;font-size:16px;line-height:24px;color:#3f3f46">${escapeHtml(text)}</p>`;
  const small = (text: string) =>
    `<p style="margin:0 0 8px;font-size:13px;line-height:20px;color:#71717a">${escapeHtml(text)}</p>`;

  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#f4f4f5">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;font-family:${FONT}">
  <tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px">
      <tr><td align="center" style="padding-bottom:20px">
        <img src="cid:${LOGO_CID}" width="44" height="44" alt="" style="display:block;border-radius:12px">
        <div style="margin-top:8px;font-size:22px;font-weight:700;letter-spacing:-0.5px;color:#0d0d0d">Salt</div>
      </td></tr>
      <tr><td style="background:#ffffff;border:1px solid #e4e4e7;border-radius:16px;padding:32px 28px">
        <h1 style="margin:0 0 20px;font-size:22px;line-height:28px;font-weight:700;color:#0d0d0d">${escapeHtml(title)}</h1>
        ${paragraphs.map(p).join("\n        ")}
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px">
          <tr><td style="background:#0d0d0d;border-radius:10px">
            <a href="${button.href}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:600;color:#fafafa;text-decoration:none;border-radius:10px">${escapeHtml(button.label)}</a>
          </td></tr>
        </table>
        <div style="border-top:1px solid #e4e4e7;padding-top:16px">
          ${footnote.map(small).join("\n          ")}
          <p style="margin:0;font-size:12px;line-height:18px;color:#a1a1aa;word-break:break-all">Si el botón no anda, copiá este link: ${escapeHtml(button.href)}</p>
        </div>
      </td></tr>
      <tr><td align="center" style="padding-top:20px;font-size:12px;color:#a1a1aa">
        Made by <a href="https://estilo.com.ar/" style="color:#52525b;font-weight:600;text-decoration:none">Estilo</a>
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}
