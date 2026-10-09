// Chequeo diario del servidor (lo corre deploy/salt-check.timer cada mañana; a mano: npm run check).
// Si algo anda mal, les manda un mail a los superadmins; si todo está bien, no manda nada.
// Mira: el último backup, el token de WhatsApp, Whisper, el disco (lo mismo que Resumen → Sistema),
// los errores del servidor de las últimas 24 horas y si alguien probó muchas contraseñas.
import "dotenv/config";
import { db } from "../src/lib/db";
import { mailLayout, sendMail } from "../src/lib/mail";
import { systemStatus } from "../src/lib/services/overview";

const DAY_MS = 24 * 60 * 60 * 1000;

async function main() {
  const since = new Date(Date.now() - DAY_MS);
  const [{ checks }, errors, errorCount, fails] = await Promise.all([
    systemStatus(),
    db.serverError.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" }, take: 5 }),
    db.serverError.count({ where: { createdAt: { gte: since } } }),
    db.loginAttempt.groupBy({ by: ["email"], where: { createdAt: { gte: since } }, _count: true }),
  ]);

  const problems = checks.filter((c) => c.ok === false).map((c) => `${c.label}: ${c.detail}`);
  for (const f of fails.filter((f) => f._count >= 5)) {
    problems.push(`Login: ${f._count} contraseñas mal para ${f.email} en las últimas 24 horas`);
  }
  if (errorCount > 0) {
    problems.push(`${errorCount} ${errorCount === 1 ? "error" : "errores"} del servidor en las últimas 24 horas. Los últimos:`);
    for (const e of errors) problems.push(`· ${e.message.split("\n")[0].slice(0, 200)}`);
  }

  if (problems.length === 0) {
    console.log("Todo bien: no se manda mail.");
    return;
  }
  const to = await db.user.findMany({ where: { role: "SUPERADMIN", active: true }, select: { email: true } });
  if (to.length === 0) {
    console.log("Hay problemas pero no hay superadmin para avisarle:\n" + problems.join("\n"));
    return;
  }
  const link = `${(process.env.APP_URL || "http://localhost:3001").replace(/\/$/, "")}/admin/resumen`;
  for (const { email } of to) {
    await sendMail(
      email,
      "Salt: hay algo para revisar",
      `Esto encontró el chequeo de hoy:\n\n${problems.join("\n")}\n\nMás detalle en ${link}\n\nSalt`,
      mailLayout({
        preheader: problems[0],
        title: "Hay algo para revisar",
        paragraphs: ["Esto encontró el chequeo de hoy en el servidor:", ...problems],
        button: { label: "Abrir el Resumen", href: link },
        footnote: ["Este mail llega solo cuando algo anda mal. Se chequea todas las mañanas."],
      }),
    );
  }
  console.log(`Mail mandado a ${to.map((u) => u.email).join(", ")}:\n${problems.join("\n")}`);
}

main().finally(() => db.$disconnect());
